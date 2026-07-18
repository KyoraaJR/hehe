const webpush = require("web-push");
const { getStore } = require("@netlify/blobs");

// Mirrors the STRICT preset in app.js — used only as a fallback if no
// criteria has been synced from the app yet (see save-criteria.js).
const DEFAULT_CRITERIA = {
  liqFull: 50000, liqMid: 30000, liqMin: 20000,
  ratioLowFull: 0.8, ratioHighFull: 2.5, ratioLowPartial: 0.5,
  ageFullH: 72, ageMidH: 24, ageMinH: 6,
  top10Full: 15, top10Mid: 20, top10Low: 30,
};

const MAX_CANDIDATES_PER_RUN = 15;
const SEEN_CAP = 2000;

function scorePair(pair, rug, criteria) {
  let score = 0, max = 0;
  let hasCritical = false;

  max += 20;
  const liquidity = (pair.liquidity && pair.liquidity.usd) || 0;
  if (liquidity >= criteria.liqFull) score += 20;
  else if (liquidity >= criteria.liqMid) score += 14;
  else if (liquidity >= criteria.liqMin) score += 8;

  max += 15;
  const vol24 = (pair.volume && pair.volume.h24) || 0;
  const ratio = liquidity ? vol24 / liquidity : 0;
  if (ratio >= criteria.ratioLowFull && ratio <= criteria.ratioHighFull) score += 15;
  else if (ratio >= criteria.ratioLowPartial && ratio < criteria.ratioLowFull) score += 7;

  max += 15;
  let ageHours = null;
  if (pair.pairCreatedAt) {
    ageHours = (Date.now() - pair.pairCreatedAt) / 3600000;
    if (ageHours >= criteria.ageFullH) score += 15;
    else if (ageHours >= criteria.ageMidH) score += 10;
    else if (ageHours >= criteria.ageMinH) score += 4;
  }

  max += 20;
  const mintOk = !!rug && rug.mintAuthority === null;
  const freezeOk = !!rug && rug.freezeAuthority === null;
  if (mintOk) score += 10; else hasCritical = true;
  if (freezeOk) score += 10; else hasCritical = true;

  max += 20;
  const topHolders = (rug && rug.topHolders) || [];
  let top10 = null;
  if (topHolders.length) {
    top10 = topHolders.slice(0, 10).reduce((s, h) => s + (h.pct || 0), 0);
    if (top10 <= criteria.top10Full) score += 20;
    else if (top10 <= criteria.top10Mid) score += 13;
    else if (top10 <= criteria.top10Low) score += 6;
  }

  max += 10;
  const risks = (rug && rug.risks) || [];
  const lpRisk = risks.some((r) => (r.name || "").toLowerCase().includes("liquidity"));
  if (rug && !lpRisk) score += 10;

  const pct = max ? Math.round((score / max) * 1000) / 10 : 0;
  return {
    pass: !hasCritical && pct >= 85,
    pct, hasCritical, liquidity, top10,
    symbol: (pair.baseToken && pair.baseToken.symbol) || "?",
  };
}

exports.handler = async function () {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "VAPID keys belum di-set di environment variables" }) };
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const store = getStore("scrn-store");
  let subs = (await store.get("subscriptions", { type: "json" })) || [];
  if (!subs.length) {
    return { statusCode: 200, body: JSON.stringify({ skipped: "belum ada subscriber" }) };
  }
  const criteria = (await store.get("criteria", { type: "json" })) || DEFAULT_CRITERIA;
  let seen = (await store.get("seen-tokens", { type: "json" })) || [];
  const seenSet = new Set(seen.map((s) => s.address));

  let profiles = [];
  try {
    const res = await fetch("https://api.dexscreener.com/token-profiles/latest/v1");
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.data || [];
      profiles = list.filter((p) => p.chainId === "solana" && p.tokenAddress);
    }
  } catch (e) { /* nothing to scan this run */ }

  const candidates = profiles
    .map((p) => p.tokenAddress)
    .filter((addr) => !seenSet.has(addr))
    .slice(0, MAX_CANDIDATES_PER_RUN);

  if (!candidates.length) {
    return { statusCode: 200, body: JSON.stringify({ checked: 0, alerted: 0 }) };
  }

  let pairsByAddr = {};
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${candidates.join(",")}`);
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.pairs || [];
      for (const pair of list) {
        const addr = pair.baseToken && pair.baseToken.address;
        if (!addr) continue;
        const liq = (pair.liquidity && pair.liquidity.usd) || 0;
        const existingLiq = (pairsByAddr[addr] && pairsByAddr[addr].liquidity && pairsByAddr[addr].liquidity.usd) || 0;
        if (!pairsByAddr[addr] || liq > existingLiq) pairsByAddr[addr] = pair;
      }
    }
  } catch (e) { /* leave pairsByAddr empty, candidates below just get skipped */ }

  let alerted = 0;
  const newlySeen = [];
  for (const addr of candidates) {
    newlySeen.push({ address: addr, at: Date.now() });
    const pair = pairsByAddr[addr];
    if (!pair) continue;

    let rug = null;
    try {
      const rres = await fetch(`https://api.rugcheck.xyz/v1/tokens/${addr}/report`);
      if (rres.ok) rug = await rres.json();
    } catch (e) { /* no rug data -> checks fail closed, which is correct here */ }

    const result = scorePair(pair, rug, criteria);
    if (!result.pass) continue;

    alerted++;
    const payload = JSON.stringify({
      title: `🚀 $${result.symbol} lolos strict screening`,
      body: `Skor ${result.pct}% · Liquidity $${Math.round(result.liquidity).toLocaleString()} · Top10 ${result.top10 != null ? result.top10.toFixed(1) + "%" : "n/a"}`,
      url: `/?scan=${addr}`,
      tag: `scrn-${addr}`,
    });

    const stillValid = [];
    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub, payload);
        stillValid.push(sub);
      } catch (err) {
        if (err.statusCode !== 404 && err.statusCode !== 410) stillValid.push(sub);
      }
    }
    subs = stillValid;
  }

  seen = seen.concat(newlySeen).slice(-SEEN_CAP);
  await store.setJSON("seen-tokens", seen);
  await store.setJSON("subscriptions", subs);

  return { statusCode: 200, body: JSON.stringify({ checked: candidates.length, alerted, subscribers: subs.length }) };
};
