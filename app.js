/* ============================================================
   SCRN — app.js
   Vanilla JS, no build step. Sections:
   1. Storage helpers        5. Extract & batch scan
   2. Criteria & presets     6. Fetch + scoring
   3. Toast / theme / tabs   7. Watchlist
   4. Recent pastes          8. History
                              9. Settings / init
   ============================================================ */

/* ---------- 1. Storage helpers ---------- */
const LS = {
  get(key, fallback){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }catch(e){ return fallback; }
  },
  set(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){ /* storage full/blocked */ }
  }
};

const KEYS = {
  theme: 'scrn_theme',
  history: 'scrn_history',
  watchlist: 'scrn_watchlist',
  recentPastes: 'scrn_recent_pastes',
  activePreset: 'scrn_active_preset',
  customCriteria: 'scrn_custom_criteria',
  sound: 'scrn_sound_enabled',
  rescanMinutes: 'scrn_rescan_minutes',
  wlSort: 'scrn_wl_sort',
  pushEnabled: 'scrn_push_enabled',
};

// Public VAPID key for Web Push subscriptions — safe to embed client-side (not secret).
// Its matching private key lives server-side only, as a Netlify environment variable.
const VAPID_PUBLIC_KEY = 'BEQfPEaOG4nI7VP-l581QvY9NH7hYQBf4Lw_qfZKA6gTBX_iG2ZJpKq4eB5QpQQ28CIs6ABAL4F1xE-Z5QyVYjk';

/* ---------- 2. Criteria & presets ---------- */
const STRICT_CRITERIA = {
  liqFull: 50000, liqMid: 30000, liqMin: 20000,
  ratioLowFull: 0.8, ratioHighFull: 2.5, ratioLowPartial: 0.5,
  ageFullH: 72, ageMidH: 24, ageMinH: 6,
  top10Full: 15, top10Mid: 20, top10Low: 30,
};
const LOOSE_CRITERIA = {
  liqFull: 20000, liqMid: 12000, liqMin: 6000,
  ratioLowFull: 0.4, ratioHighFull: 4, ratioLowPartial: 0.15,
  ageFullH: 24, ageMidH: 6, ageMinH: 1,
  top10Full: 25, top10Mid: 35, top10Low: 50,
};
const CRITERIA_FIELDS = [
  ['liqFull', 'Liquidity full skor ($)'], ['liqMid', 'Liquidity partial ($)'], ['liqMin', 'Liquidity minimum ($)'],
  ['ratioLowFull', 'Vol/Liq sehat — bawah'], ['ratioHighFull', 'Vol/Liq sehat — atas'], ['ratioLowPartial', 'Vol/Liq partial — bawah'],
  ['ageFullH', 'Umur full skor (jam)'], ['ageMidH', 'Umur partial (jam)'], ['ageMinH', 'Umur waspada (jam)'],
  ['top10Full', 'Top10 holder full (%)'], ['top10Mid', 'Top10 holder partial (%)'], ['top10Low', 'Top10 holder batas (%)'],
];

function getActivePresetName(){ return LS.get(KEYS.activePreset, 'strict'); }
function getActiveCriteria(){
  const name = getActivePresetName();
  if(name === 'loose') return LOOSE_CRITERIA;
  if(name === 'custom') return LS.get(KEYS.customCriteria, STRICT_CRITERIA);
  return STRICT_CRITERIA;
}

/* ---------- 3. Toast / theme / tabs ---------- */
const toastEl = document.getElementById('toast');
let toastTimer = null;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

const themeToggle = document.getElementById('themeToggle');
const darkModeSwitch = document.getElementById('darkModeSwitch');
function applyTheme(theme){
  document.body.setAttribute('data-theme', theme);
  LS.set(KEYS.theme, theme);
  if(darkModeSwitch) darkModeSwitch.checked = theme === 'dark';
}
themeToggle.addEventListener('click', () => {
  const current = document.body.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

document.querySelectorAll('.tab').forEach(tabBtn => {
  tabBtn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    tabBtn.classList.add('active');
    document.getElementById('view-' + tabBtn.dataset.tab).classList.add('active');
    if(tabBtn.dataset.tab === 'watchlist') renderWatchlist();
    if(tabBtn.dataset.tab === 'history') renderHistory();
    if(tabBtn.dataset.tab === 'settings') renderSettings();
  });
});

function fmtAgo(ts){
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if(min < 1) return 'barusan';
  if(min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if(hr < 24) return `${hr} jam lalu`;
  return `${Math.floor(hr / 24)} hari lalu`;
}
function shortAddr(a){ return a.length > 14 ? a.slice(0,6) + '…' + a.slice(-6) : a; }

/* ---------- 4. Recent pastes ---------- */
const recentPastesEl = document.getElementById('recentPastes');
function saveRecentPaste(text){
  if(!text || text.length < 10) return;
  let list = LS.get(KEYS.recentPastes, []);
  list = list.filter(t => t !== text);
  list.unshift(text);
  list = list.slice(0, 5);
  LS.set(KEYS.recentPastes, list);
  renderRecentPastes();
}
function renderRecentPastes(){
  const list = LS.get(KEYS.recentPastes, []);
  if(!list.length){ recentPastesEl.innerHTML = ''; return; }
  recentPastesEl.innerHTML = `<div class="rp-title">Paste terakhir</div>` +
    list.map((t, i) => `<div class="rp-item" data-idx="${i}">${escapeHtml(t.slice(0, 90))}</div>`).join('');
  recentPastesEl.querySelectorAll('.rp-item').forEach(el => {
    el.addEventListener('click', () => {
      rawCallEl.value = list[Number(el.dataset.idx)];
      extractStatusEl.textContent = 'Teks dimuat dari riwayat. Tap EXTRACT CA.';
    });
  });
}
function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function exportCsv(filename, headers, rows){
  const esc = (v) => {
    const s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV di-export.');
}

/* ---------- DOM refs ---------- */
const statusEl = document.getElementById('status');
const extractBtn = document.getElementById('extractBtn');
const rawCallEl = document.getElementById('rawCall');
const extractStatusEl = document.getElementById('extractStatus');
const pasteBtn = document.getElementById('pasteBtn');
const copyBtn = document.getElementById('copyBtn');
const resultsEl = document.getElementById('results');
const goBtn = document.getElementById('go');
const addrInput = document.getElementById('addr');
const chipRowEl = document.getElementById('chipRow');
const scanAllBtn = document.getElementById('scanAllBtn');

/* ---------- 5. Extract & batch scan ---------- */
function extractAllCA(text){
  const candidates = [...new Set(text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) || [])];
  if(!candidates.length) return [];

  const scored = candidates.map(c => {
    let priority = 0;
    const labelRe = new RegExp('\\bCA\\b[\\s:>\\-]*' + c, 'i');
    if(labelRe.test(text)) priority += 100;
    if(c.toLowerCase().endsWith('pump')) priority += 10;
    priority += c.length;
    return { addr: c, priority };
  });
  scored.sort((a, b) => b.priority - a.priority);
  return scored.map(s => s.addr);
}

let lastExtracted = [];
pasteBtn.addEventListener('click', async () => {
  try{
    const text = await navigator.clipboard.readText();
    if(!text){ extractStatusEl.textContent = 'Clipboard kosong.'; return; }
    rawCallEl.value = text;
    extractStatusEl.textContent = 'Teks ditempel. Tap EXTRACT CA.';
  }catch(e){
    extractStatusEl.innerHTML = '<span style="color:var(--fail)">Gagal akses clipboard — paste manual.</span>';
  }
});

copyBtn.addEventListener('click', async () => {
  const val = addrInput.value.trim();
  if(!val){ statusEl.textContent = 'Belum ada CA buat disalin.'; return; }
  try{
    await navigator.clipboard.writeText(val);
    const original = copyBtn.textContent;
    copyBtn.textContent = 'COPIED';
    setTimeout(() => { copyBtn.textContent = original; }, 1200);
  }catch(e){
    statusEl.textContent = 'Gagal copy — coba select manual.';
  }
});

extractBtn.addEventListener('click', () => {
  const text = rawCallEl.value.trim();
  if(!text){ extractStatusEl.textContent = 'Paste teks call-nya dulu.'; return; }
  saveRecentPaste(text);
  const found = extractAllCA(text);
  if(!found.length){
    extractStatusEl.innerHTML = '<span style="color:var(--fail)">Nggak nemu CA yang valid.</span>';
    chipRowEl.innerHTML = ''; scanAllBtn.style.display = 'none'; lastExtracted = [];
    return;
  }
  lastExtracted = found;
  addrInput.value = found[0];
  extractStatusEl.innerHTML = found.length > 1
    ? `<span style="color:var(--pass)">${found.length} CA ditemukan.</span> CA paling relevan sudah diisi otomatis.`
    : `<span style="color:var(--pass)">CA ditemukan: ${found[0]}</span>`;

  chipRowEl.innerHTML = found.map((c, i) =>
    `<button type="button" class="chip ${i === 0 ? 'selected' : ''}" data-addr="${c}">${shortAddr(c)}</button>`
  ).join('');
  chipRowEl.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chipRowEl.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      addrInput.value = chip.dataset.addr;
    });
  });
  scanAllBtn.style.display = found.length > 1 ? 'block' : 'none';
  addrInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

scanAllBtn.addEventListener('click', async () => {
  if(!lastExtracted.length) return;
  scanAllBtn.disabled = true;
  for(let i = 0; i < lastExtracted.length; i++){
    scanAllBtn.textContent = `SCANNING ${i + 1}/${lastExtracted.length}...`;
    await scanAddress(lastExtracted[i]);
    if(i < lastExtracted.length - 1) await sleep(900); // be gentle on rate limits
  }
  scanAllBtn.textContent = 'SCAN SEMUA CA YANG DITEMUKAN';
  scanAllBtn.disabled = false;
});

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

/* ---------- 6. Fetch + scoring ---------- */
function extractPairs(data){
  if(Array.isArray(data)) return data;
  if(data && Array.isArray(data.pairs)) return data.pairs;
  return [];
}
function pickBestPair(pairs){
  if(!pairs.length) return null;
  return pairs.reduce((best, p) => {
    const liq = (p.liquidity && p.liquidity.usd) || 0;
    const bestLiq = (best && best.liquidity && best.liquidity.usd) || 0;
    return liq > bestLiq ? p : best;
  }, null);
}
async function fetchDexScreener(address){
  // DexScreener sometimes returns HTTP 200 with an empty pairs array on one endpoint
  // even though the token IS indexed and shows up fine on the website / other endpoints.
  // So: only treat an attempt as successful if it actually yields a pair — otherwise
  // keep falling through to the next endpoint instead of giving up early.
  const attempts = [
    `https://api.dexscreener.com/tokens/v1/solana/${address}`,
    `https://api.dexscreener.com/token-pairs/v1/solana/${address}`,
    `https://api.dexscreener.com/latest/dex/tokens/${address}`,
  ];

  let lastError = null;
  for(const url of attempts){
    try{
      const res = await fetch(url);
      if(res.ok){
        const data = await res.json();
        const best = pickBestPair(extractPairs(data));
        if(best) return { error: null, pair: best };
        // HTTP ok but no pairs yet on this endpoint — try the next one
      } else {
        lastError = `DexScreener HTTP ${res.status}`;
      }
    }catch(e){
      lastError = `DexScreener fetch gagal: ${e.message}`;
    }
  }

  // Last resort: route the first endpoint through a CORS proxy, in case the direct
  // requests above were blocked by the browser rather than genuinely empty.
  try{
    const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(attempts[0])}`;
    const res = await fetch(proxied);
    if(res.ok){
      const data = await res.json();
      const best = pickBestPair(extractPairs(data));
      if(best) return { error: null, pair: best };
    }
  }catch(e){ /* keep lastError from the direct attempts above */ }

  return { error: lastError, pair: null };
}
async function fetchRugCheck(address){
  try{
    const res = await fetch(`/.netlify/functions/rugcheck-proxy?address=${address}`);
    if(!res.ok) {
      try {
        const errData = await res.json();
        return { error: `RugCheck: ${errData.error || res.status}`, rug: null };
      } catch(e) {
        return { error: `RugCheck HTTP ${res.status}`, rug: null };
      }
    }
    const rug = await res.json();
    return { error: null, rug };
  }catch(e){
    return { error: `RugCheck fetch gagal: ${e.message}`, rug: null };
  }
}

function scoreToken(pair, rug, criteria){
  let score = 0, max = 0;
  const flags = [];
  const metrics = [];
  const breakdown = [];

  // Liquidity (20)
  max += 20; let liqEarn = 0;
  const liquidity = (pair && pair.liquidity && pair.liquidity.usd) || 0;
  if(liquidity >= criteria.liqFull) liqEarn = 20;
  else if(liquidity >= criteria.liqMid) liqEarn = 14;
  else if(liquidity >= criteria.liqMin) liqEarn = 8;
  else flags.push({t:`Liquidity di bawah standar ($${liquidity.toLocaleString()}, min $${criteria.liqMin.toLocaleString()})`, c:false});
  score += liqEarn;
  metrics.push(['Liquidity', `$${liquidity.toLocaleString(undefined,{maximumFractionDigits:0})}`]);
  breakdown.push({
    label: 'Liquidity', earned: liqEarn, max: 20,
    value: `$${liquidity.toLocaleString(undefined,{maximumFractionDigits:0})}`,
    target: `min $${criteria.liqMin.toLocaleString()} · full skor ≥$${criteria.liqFull.toLocaleString()}`
  });

  // Vol/Liq ratio (15)
  max += 15; let ratioEarn = 0;
  const vol24 = (pair && pair.volume && pair.volume.h24) || 0;
  const ratio = liquidity ? vol24 / liquidity : 0;
  if(ratio >= criteria.ratioLowFull && ratio <= criteria.ratioHighFull) ratioEarn = 15;
  else if(ratio >= criteria.ratioLowPartial && ratio < criteria.ratioLowFull){ ratioEarn = 7; flags.push({t:`Volume agak rendah relatif ke liquidity (${ratio.toFixed(2)}x)`, c:false}); }
  else flags.push({t:`Volume/Liquidity ratio di luar batas aman (${ratio.toFixed(2)}x) — indikasi wash trading`, c:false});
  score += ratioEarn;
  metrics.push(['Vol 24h', `$${vol24.toLocaleString(undefined,{maximumFractionDigits:0})}`]);
  metrics.push(['Vol/Liq ratio', `${ratio.toFixed(2)}x`]);
  breakdown.push({
    label: 'Vol/Liq ratio', earned: ratioEarn, max: 15,
    value: `${ratio.toFixed(2)}x`,
    target: `sehat ${criteria.ratioLowFull}x–${criteria.ratioHighFull}x`
  });

  // Age (15)
  max += 15; let ageEarn = 0;
  const createdAt = pair && pair.pairCreatedAt;
  let ageHours = null;
  if(createdAt){
    ageHours = (Date.now() - createdAt) / 3600000;
    if(ageHours >= criteria.ageFullH) ageEarn = 15;
    else if(ageHours >= criteria.ageMidH) ageEarn = 10;
    else if(ageHours >= criteria.ageMinH){ ageEarn = 4; flags.push({t:`Token relatif baru (${ageHours.toFixed(1)} jam, idealnya >${criteria.ageMidH} jam)`, c:false}); }
    else flags.push({t:`Token sangat baru (${ageHours.toFixed(1)} jam) — risiko sniper/insider tinggi`, c:false});
    metrics.push(['Umur token', `${ageHours.toFixed(1)} jam`]);
  } else {
    flags.push({t:'Umur token tidak diketahui — anggap berisiko', c:false});
    metrics.push(['Umur token', 'n/a']);
  }
  score += ageEarn;
  breakdown.push({
    label: 'Umur token', earned: ageEarn, max: 15,
    value: ageHours != null ? `${ageHours.toFixed(1)} jam` : 'n/a',
    target: `full skor ≥${criteria.ageFullH} jam · waspada <${criteria.ageMinH} jam`
  });

  // Mint & freeze authority (20)
  max += 20; let authEarn = 0;
  const mintAuth = rug ? rug.mintAuthority : undefined;
  const freezeAuth = rug ? rug.freezeAuthority : undefined;
  if(rug && mintAuth === null) authEarn += 10;
  else flags.push({t:'Mint authority belum di-revoke — dev bisa cetak token tak terbatas', c:true});
  if(rug && freezeAuth === null) authEarn += 10;
  else flags.push({t:'Freeze authority belum di-revoke — dev bisa freeze wallet kamu', c:true});
  score += authEarn;
  breakdown.push({
    label: 'Mint & Freeze', earned: authEarn, max: 20,
    value: `Mint: ${rug && mintAuth === null ? 'revoked' : 'belum revoked'} · Freeze: ${rug && freezeAuth === null ? 'revoked' : 'belum revoked'}`,
    target: 'wajib keduanya revoked'
  });

  // Top holder concentration (20)
  max += 20; let holderEarn = 0;
  const topHolders = (rug && rug.topHolders) || [];
  if(topHolders.length){
    const top10 = topHolders.slice(0,10).reduce((s,h)=>s+(h.pct||0),0);
    if(top10 <= criteria.top10Full) holderEarn = 20;
    else if(top10 <= criteria.top10Mid) holderEarn = 13;
    else if(top10 <= criteria.top10Low) holderEarn = 6;
    else flags.push({t:`Top 10 holder pegang ${top10.toFixed(1)}% supply (standar max ${criteria.top10Full}%)`, c:false});
    metrics.push(['Top 10 holder', `${top10.toFixed(1)}%`]);
  } else {
    flags.push({t:'Data holder tidak tersedia — dianggap tidak lolos', c:false});
    metrics.push(['Top 10 holder', 'n/a']);
  }
  score += holderEarn;
  breakdown.push({
    label: 'Top 10 Holder', earned: holderEarn, max: 20,
    value: topHolders.length ? `${topHolders.slice(0,10).reduce((s,h)=>s+(h.pct||0),0).toFixed(1)}%` : 'n/a',
    target: `max ${criteria.top10Full}% supply`
  });

  // LP lock/burn (10)
  max += 10; let lpEarn = 0;
  const risks = (rug && rug.risks) || [];
  const lpRisk = risks.some(r => (r.name||'').toLowerCase().includes('liquidity'));
  if(rug && !lpRisk) lpEarn = 10;
  else flags.push({t:'LP belum terkonfirmasi lock/burn — risiko rug pull tinggi', c:false});
  score += lpEarn;
  breakdown.push({
    label: 'LP Lock/Burn', earned: lpEarn, max: 10,
    value: (rug && !lpRisk) ? 'Terkonfirmasi lock/burn' : 'Belum terkonfirmasi',
    target: 'wajib terkonfirmasi'
  });

  const pct = max ? Math.round((score/max)*1000)/10 : 0;
  const hasCritical = flags.some(f => f.c);
  let verdict, verdictClass;
  if(hasCritical){ verdict = 'AUTO-REJECT — critical red flag'; verdictClass = 'fail'; }
  else if(pct >= 85){ verdict = 'LOLOS STRICT SCREENING'; verdictClass = 'pass'; }
  else if(pct >= 65){ verdict = 'BORDERLINE — investigasi manual dulu'; verdictClass = 'warn'; }
  else { verdict = 'HIGH RISK — sebaiknya skip'; verdictClass = 'fail'; }

  const priceUsd = (pair && pair.priceUsd) ? Number(pair.priceUsd) : null;

  return {
    score, max, pct, verdict, verdictClass, flags, metrics, breakdown,
    liquidity, top10: (topHolders.length ? topHolders.slice(0,10).reduce((s,h)=>s+(h.pct||0),0) : null),
    hasCritical, priceUsd,
    symbol: (pair && pair.baseToken && pair.baseToken.symbol) || '?',
    pairAddress: pair && pair.pairAddress
  };
}

function breakdownStatus(earned, max){
  const p = max ? earned / max : 0;
  if(p >= 0.85) return 'pass';
  if(p >= 0.4) return 'warn';
  return 'fail';
}
function renderBreakdown(breakdown){
  return `<div class="breakdown"><div class="ftitle">Breakdown per kriteria</div>` +
    breakdown.map(b => {
      const st = breakdownStatus(b.earned, b.max);
      const icon = st === 'pass' ? '✓' : st === 'warn' ? '⚠' : '✗';
      return `<div class="bd-row ${st}">
        <div class="bd-icon">${icon}</div>
        <div class="bd-body">
          <div class="bd-label">${b.label}</div>
          <div class="bd-value">${b.value}</div>
          <div class="bd-target">${b.target}</div>
        </div>
      </div>`;
    }).join('') + `</div>`;
}

function isInWatchlist(address){
  return LS.get(KEYS.watchlist, []).some(w => w.address === address);
}

function render(address, result, hadData){
  const card = document.createElement('div');
  card.className = 'card';

  if(!hadData){
    card.innerHTML = `
      <div class="card-head"><div><div class="sym">Data tidak ditemukan</div><div class="addr">${address}</div></div></div>
      <div class="live">
        <div class="ftitle">Cek manual</div>
        <div class="live-links">
          <a href="https://dexscreener.com/solana/${address}" target="_blank" rel="noopener">DexScreener ↗</a>
          <a class="rc" href="https://rugcheck.xyz/tokens/${address}" target="_blank" rel="noopener">RugCheck ↗</a>
        </div>
      </div>
      <div class="flags"><div class="flag normal">Token tidak terindex di DexScreener atau contract salah. Kalau kamu yakin tokennya ada, coba scan ulang — kadang API-nya lambat sinkron.</div></div>
      <div class="card-actions"><button class="btn-ghost retry-btn">COBA LAGI</button></div>`;
    card.querySelector('.retry-btn').addEventListener('click', (e) => {
      e.target.textContent = 'SCANNING...'; e.target.disabled = true;
      scanAddress(address);
    });
    resultsEl.prepend(card);
    return;
  }

  const flagsHtml = result.flags.length
    ? result.flags.map(f => `<div class="flag ${f.c ? 'critical' : 'normal'}">${f.c ? '⚠ ' : ''}${f.t}</div>`).join('')
    : `<div class="flag ok">✓ Tidak ada red flag signifikan terdeteksi</div>`;

  const metricsHtml = result.metrics.map(([k,v]) => `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  const dexUrl = `https://dexscreener.com/solana/${address}`;
  const rugUrl = `https://rugcheck.xyz/tokens/${address}`;
  const jupUrl = `https://jup.ag/swap/SOL-${address}`;
  const raydiumUrl = `https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${address}`;
  const pairAddr = result.pairAddress;
  const chartHtml = pairAddr
    ? `<div class="chart-embed"><iframe src="https://dexscreener.com/solana/${pairAddr}?embed=1&theme=dark&trades=0&info=0" loading="lazy"></iframe></div>`
    : '';

  const alreadyWl = isInWatchlist(address);

  card.innerHTML = `
    <div class="card-head">
      <div><div class="sym">${result.symbol}</div><div class="addr">${address}</div></div>
      <div class="score"><div class="num">${result.pct}%</div><div class="lbl">${result.score}/${result.max}</div></div>
    </div>
    <div class="verdict ${result.verdictClass}">${result.verdict}</div>
    <div class="metrics">${metricsHtml}</div>
    ${renderBreakdown(result.breakdown)}
    <div class="live">
      <div class="ftitle">Live</div>
      <div class="live-links">
        <a href="${dexUrl}" target="_blank" rel="noopener">DexScreener ↗</a>
        <a class="rc" href="${rugUrl}" target="_blank" rel="noopener">RugCheck ↗</a>
      </div>
      <div class="live-links">
        <a class="swap" href="${jupUrl}" target="_blank" rel="noopener">Jupiter Swap ↗</a>
        <a class="swap" href="${raydiumUrl}" target="_blank" rel="noopener">Raydium Swap ↗</a>
      </div>
      ${chartHtml}
    </div>
    <div class="flags"><div class="ftitle">Flags</div>${flagsHtml}</div>
    <div class="card-actions">
      <button class="btn-ghost wl-add-btn" ${alreadyWl ? 'disabled' : ''}>${alreadyWl ? '✓ DI WATCHLIST' : '+ WATCHLIST'}</button>
      <button class="btn-ghost share-btn">SHARE</button>
    </div>
  `;

  card.querySelector('.wl-add-btn').addEventListener('click', (e) => {
    addToWatchlist(address, result);
    e.target.textContent = '✓ DI WATCHLIST';
    e.target.disabled = true;
  });
  card.querySelector('.share-btn').addEventListener('click', () => shareResult(address, result));

  resultsEl.prepend(card);
}

function buildShareText(address, result){
  return `SCRN Screening — $${result.symbol}\n` +
    `Score: ${result.pct}% (${result.score}/${result.max})\n` +
    `Verdict: ${result.verdict}\n` +
    `CA: ${address}\n` +
    `https://dexscreener.com/solana/${address}`;
}
async function shareResult(address, result){
  const text = buildShareText(address, result);
  if(navigator.share){
    try{ await navigator.share({ title: 'SCRN Screening', text }); return; }catch(e){ /* user cancelled or unsupported, fall through */ }
  }
  try{
    await navigator.clipboard.writeText(text);
    toast('Ringkasan disalin ke clipboard.');
  }catch(e){
    toast('Gagal share/copy.');
  }
}

async function scanAddress(address){
  if(!address) return;
  statusEl.textContent = `Fetching DexScreener + RugCheck untuk ${shortAddr(address)}...`;

  let dex, rc;
  try{
    [dex, rc] = await Promise.all([fetchDexScreener(address), fetchRugCheck(address)]);
  }catch(e){
    statusEl.textContent = `Scan gagal total: ${e.message}`;
    return;
  }

  const errors = [];
  if(dex.error) errors.push(dex.error);
  if(rc.error) errors.push(rc.error);

  if(dex.error && !dex.pair){
    statusEl.innerHTML = `<span style="color:var(--fail)">Gagal ambil data DexScreener.</span><br>${dex.error}`;
    return;
  }

  if(!dex.pair){
    statusEl.textContent = 'Selesai — token tidak ditemukan.';
    render(address, null, false);
    return;
  }

  const criteria = getActiveCriteria();
  const result = scoreToken(dex.pair, rc.rug, criteria);
  if(rc.error) result.flags.unshift({t:`${rc.error}`, c:false});
  else if(!rc.rug) result.flags.unshift({t:'RugCheck tidak punya data token ini', c:false});
  render(address, result, true);
  addHistory(address, result);
  statusEl.textContent = errors.length ? `Selesai dengan warning.` : 'Selesai.';
}

async function scan(){
  const address = addrInput.value.trim();
  if(!address){ statusEl.textContent = 'Masukin contract address dulu.'; return; }
  goBtn.disabled = true;
  await scanAddress(address);
  goBtn.disabled = false;
}
goBtn.addEventListener('click', scan);
addrInput.addEventListener('keydown', e => { if(e.key === 'Enter') scan(); });

/* ---------- 7. Watchlist ---------- */
const wlListEl = document.getElementById('wlList');
const wlEmptyEl = document.getElementById('wlEmpty');
const wlCountEl = document.getElementById('wlCount');
const rescanAllBtn = document.getElementById('rescanAllBtn');
const autoRescanDescEl = document.getElementById('autoRescanDesc');

function addToWatchlist(address, result){
  const list = LS.get(KEYS.watchlist, []);
  if(list.some(w => w.address === address)){ toast('Sudah ada di watchlist.'); return; }
  list.unshift({
    address, symbol: result.symbol, status: 'watching', addedAt: Date.now(),
    lastPct: result.pct, lastVerdictClass: result.verdictClass,
    lastLiquidity: result.liquidity, lastTop10: result.top10,
    lastHasCritical: result.hasCritical, lastCheckedAt: Date.now(), alertNote: null,
    lastPriceUsd: result.priceUsd, baselinePriceUsd: result.priceUsd,
    entryPriceUsd: null, entryAmountUsd: null, entryAt: null,
    takeProfitPct: null, stopLossPct: null, priceAlertPct: null,
    tpTriggered: false, slTriggered: false, priceAlertTriggered: false,
  });
  LS.set(KEYS.watchlist, list);
  toast(`$${result.symbol} ditambahkan ke watchlist.`);
  updateWlCount();
}
function removeFromWatchlist(address){
  const list = LS.get(KEYS.watchlist, []);
  const item = list.find(w => w.address === address);
  if(!item) return;
  if(!confirm(`Hapus $${item.symbol} dari watchlist? Ini nggak bisa dibatalkan.`)) return;
  const filtered = list.filter(w => w.address !== address);
  LS.set(KEYS.watchlist, filtered);
  renderWatchlist();
  updateWlCount();
}
function toggleWatchlistStatus(address){
  const list = LS.get(KEYS.watchlist, []);
  const item = list.find(w => w.address === address);
  if(item){
    item.status = item.status === 'watching' ? 'entered' : 'watching';
    if(item.status === 'entered' && item.entryPriceUsd == null && item.lastPriceUsd != null){
      item.entryPriceUsd = item.lastPriceUsd;
      item.entryAt = Date.now();
    }
  }
  LS.set(KEYS.watchlist, list);
  renderWatchlist();
}
function computePnlPct(item){
  if(item.entryPriceUsd && item.lastPriceUsd != null) return ((item.lastPriceUsd - item.entryPriceUsd) / item.entryPriceUsd) * 100;
  return null;
}
function updateWlCount(){
  const n = LS.get(KEYS.watchlist, []).length;
  wlCountEl.textContent = n;
  wlCountEl.style.display = n ? 'inline-block' : 'none';
}

async function rescanWatchlistItem(address, { silent } = {}){
  const list = LS.get(KEYS.watchlist, []);
  const item = list.find(w => w.address === address);
  if(!item) return;

  const [dex, rc] = await Promise.all([fetchDexScreener(address), fetchRugCheck(address)]);
  if(!dex.pair){
    item.lastCheckedAt = Date.now();
    LS.set(KEYS.watchlist, list);
    if(!silent) renderWatchlist();
    return;
  }
  const criteria = getActiveCriteria();
  const result = scoreToken(dex.pair, rc.rug, criteria);

  const alerts = [];
  if(item.lastLiquidity && result.liquidity < item.lastLiquidity * 0.7){
    alerts.push(`Liquidity turun tajam: $${item.lastLiquidity.toLocaleString()} → $${result.liquidity.toLocaleString()}`);
  }
  if(item.lastTop10 != null && result.top10 != null && result.top10 > item.lastTop10 + 10){
    alerts.push(`Top10 holder naik: ${item.lastTop10.toFixed(1)}% → ${result.top10.toFixed(1)}%`);
  }
  if(result.hasCritical && !item.lastHasCritical){
    alerts.push('Red flag kritis baru terdeteksi (mint/freeze authority)');
  }

  if(result.priceUsd != null){
    if(item.status === 'entered' && item.entryPriceUsd){
      const pnlPct = ((result.priceUsd - item.entryPriceUsd) / item.entryPriceUsd) * 100;
      if(item.takeProfitPct != null && pnlPct >= item.takeProfitPct && !item.tpTriggered){
        alerts.push(`Take profit tercapai: +${pnlPct.toFixed(1)}% (target +${item.takeProfitPct}%)`);
        item.tpTriggered = true;
      }
      if(item.stopLossPct != null && pnlPct <= -item.stopLossPct && !item.slTriggered){
        alerts.push(`Stop loss tercapai: ${pnlPct.toFixed(1)}% (target -${item.stopLossPct}%)`);
        item.slTriggered = true;
      }
    }
    if(item.priceAlertPct != null && item.baselinePriceUsd){
      const movePct = ((result.priceUsd - item.baselinePriceUsd) / item.baselinePriceUsd) * 100;
      if(Math.abs(movePct) >= item.priceAlertPct && !item.priceAlertTriggered){
        alerts.push(`Harga bergerak ${movePct >= 0 ? '+' : ''}${movePct.toFixed(1)}% dari baseline`);
        item.priceAlertTriggered = true;
      }
    }
  }

  item.lastPct = result.pct;
  item.lastVerdictClass = result.verdictClass;
  item.lastLiquidity = result.liquidity;
  item.lastTop10 = result.top10;
  item.lastHasCritical = result.hasCritical;
  item.lastPriceUsd = result.priceUsd;
  item.lastCheckedAt = Date.now();
  item.alertNote = alerts.length ? alerts.join(' · ') : null;
  LS.set(KEYS.watchlist, list);

  if(alerts.length){
    notify(`⚠ $${item.symbol} — perubahan signifikan`, alerts.join(' · '));
    playAlertSound();
    if(navigator.vibrate) navigator.vibrate([120, 60, 120]);
  }
  if(!silent) renderWatchlist();
}

rescanAllBtn.addEventListener('click', async () => {
  const list = LS.get(KEYS.watchlist, []);
  if(!list.length){ toast('Watchlist kosong.'); return; }
  rescanAllBtn.disabled = true;
  rescanAllBtn.textContent = 'SCANNING...';
  for(const item of list){
    await rescanWatchlistItem(item.address, { silent: true });
    await sleep(700);
  }
  rescanAllBtn.disabled = false;
  rescanAllBtn.textContent = 'SCAN ULANG SEMUA';
  renderWatchlist();
  toast('Watchlist di-scan ulang.');
});

const wlSortSel = document.getElementById('wlSortSel');
const wlExportBtn = document.getElementById('wlExportBtn');

function sortWatchlist(list){
  const mode = LS.get(KEYS.wlSort, 'added');
  const arr = [...list];
  if(mode === 'scoreDesc') arr.sort((a, b) => (b.lastPct || 0) - (a.lastPct || 0));
  else if(mode === 'scoreAsc') arr.sort((a, b) => (a.lastPct || 0) - (b.lastPct || 0));
  else if(mode === 'alertFirst') arr.sort((a, b) => (b.alertNote ? 1 : 0) - (a.alertNote ? 1 : 0) || b.addedAt - a.addedAt);
  else if(mode === 'pnlDesc') arr.sort((a, b) => {
    const pa = computePnlPct(a), pb = computePnlPct(b);
    if(pa === null && pb === null) return b.addedAt - a.addedAt;
    if(pa === null) return 1;
    if(pb === null) return -1;
    return pb - pa;
  });
  else arr.sort((a, b) => b.addedAt - a.addedAt);
  return arr;
}

function renderWatchlist(){
  const rawList = LS.get(KEYS.watchlist, []);
  const list = sortWatchlist(rawList);
  updateWlCount();
  if(wlSortSel) wlSortSel.value = LS.get(KEYS.wlSort, 'added');
  wlEmptyEl.style.display = list.length ? 'none' : 'block';
  wlListEl.innerHTML = list.map(item => {
    const pnlPct = computePnlPct(item);
    const pnlUsd = (pnlPct !== null && item.entryAmountUsd) ? (item.entryAmountUsd * pnlPct / 100) : null;
    const pnlHtml = pnlPct !== null
      ? `<span>P&amp;L: <b class="${pnlPct >= 0 ? 'pos' : 'neg'}">${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%${pnlUsd !== null ? ` (${pnlUsd >= 0 ? '+' : ''}$${pnlUsd.toFixed(2)})` : ''}</b></span>`
      : '';
    return `
    <div class="wl-card ${item.alertNote ? 'alert' : ''}">
      <div class="wl-head">
        <div>
          <div class="wl-sym">$${item.symbol}</div>
          <div class="wl-addr">${item.address}</div>
        </div>
        <div class="wl-badge ${item.status}">${item.status === 'watching' ? 'Watching' : 'Entered'}</div>
      </div>
      <div class="wl-meta">
        <span>Skor: <b>${item.lastPct}%</b></span>
        <span>Liq: <b>$${(item.lastLiquidity||0).toLocaleString(undefined,{maximumFractionDigits:0})}</b></span>
        <span>Dicek: <b>${fmtAgo(item.lastCheckedAt)}</b></span>
        ${pnlHtml}
      </div>
      ${item.alertNote ? `<div class="wl-note">⚠ ${item.alertNote}</div>` : ''}
      <div class="wl-actions">
        <button class="btn-sm btn-outline-amber" data-act="rescan" data-addr="${item.address}">SCAN ULANG</button>
        <button class="btn-sm btn-ghost" data-act="toggle" data-addr="${item.address}">${item.status === 'watching' ? 'TANDAI ENTERED' : 'TANDAI WATCHING'}</button>
        <button class="btn-sm btn-danger" data-act="remove" data-addr="${item.address}">HAPUS</button>
      </div>
      <details class="wl-settings">
        <summary>Entry &amp; alert harga</summary>
        <div class="field-grid">
          <div class="field"><label>Entry price (USD)</label><input type="number" step="any" class="wl-entryPrice" value="${item.entryPriceUsd ?? ''}" placeholder="mis. 0.000042"></div>
          <div class="field"><label>Modal (USD)</label><input type="number" step="any" class="wl-entryAmount" value="${item.entryAmountUsd ?? ''}" placeholder="mis. 50"></div>
          <div class="field"><label>Take profit (%)</label><input type="number" step="any" class="wl-tp" value="${item.takeProfitPct ?? ''}" placeholder="mis. 50"></div>
          <div class="field"><label>Stop loss (%)</label><input type="number" step="any" class="wl-sl" value="${item.stopLossPct ?? ''}" placeholder="mis. 20"></div>
          <div class="field"><label>Alert gerak harga (%)</label><input type="number" step="any" class="wl-alertpct" value="${item.priceAlertPct ?? ''}" placeholder="mis. 30"></div>
        </div>
        <button class="btn-sm btn-outline-amber btn-block" data-act="save-settings" data-addr="${item.address}">SIMPAN</button>
      </details>
    </div>
  `; }).join('');

  wlListEl.querySelectorAll('[data-act="rescan"]').forEach(btn => btn.addEventListener('click', async () => {
    btn.textContent = '...'; btn.disabled = true;
    await rescanWatchlistItem(btn.dataset.addr);
    renderWatchlist();
  }));
  wlListEl.querySelectorAll('[data-act="toggle"]').forEach(btn => btn.addEventListener('click', () => toggleWatchlistStatus(btn.dataset.addr)));
  wlListEl.querySelectorAll('[data-act="remove"]').forEach(btn => btn.addEventListener('click', () => removeFromWatchlist(btn.dataset.addr)));
  wlListEl.querySelectorAll('[data-act="save-settings"]').forEach(btn => btn.addEventListener('click', () => {
    const addr = btn.dataset.addr;
    const card = btn.closest('.wl-card');
    const fullList = LS.get(KEYS.watchlist, []);
    const item = fullList.find(w => w.address === addr);
    if(!item) return;
    const readNum = (sel) => {
      const v = card.querySelector(sel).value.trim();
      return v === '' ? null : Number(v);
    };
    item.entryPriceUsd = readNum('.wl-entryPrice');
    item.entryAmountUsd = readNum('.wl-entryAmount');
    item.takeProfitPct = readNum('.wl-tp');
    item.stopLossPct = readNum('.wl-sl');
    item.priceAlertPct = readNum('.wl-alertpct');
    item.tpTriggered = false; item.slTriggered = false; item.priceAlertTriggered = false;
    LS.set(KEYS.watchlist, fullList);
    toast('Setting entry & alert disimpan.');
    renderWatchlist();
  }));
}

if(wlSortSel){
  wlSortSel.addEventListener('change', () => {
    LS.set(KEYS.wlSort, wlSortSel.value);
    renderWatchlist();
  });
}
if(wlExportBtn){
  wlExportBtn.addEventListener('click', () => {
    const list = LS.get(KEYS.watchlist, []);
    if(!list.length){ toast('Watchlist kosong.'); return; }
    exportCsv('scrn-watchlist.csv',
      ['Symbol', 'Address', 'Status', 'Score%', 'Liquidity', 'EntryPriceUSD', 'AmountUSD', 'PnL%', 'PnLUSD', 'AddedAt', 'LastCheckedAt'],
      list.map(item => {
        const pnlPct = computePnlPct(item);
        const pnlUsd = (pnlPct !== null && item.entryAmountUsd) ? (item.entryAmountUsd * pnlPct / 100) : null;
        return [
          item.symbol, item.address, item.status, item.lastPct, item.lastLiquidity,
          item.entryPriceUsd ?? '', item.entryAmountUsd ?? '',
          pnlPct === null ? '' : pnlPct.toFixed(2),
          pnlUsd === null ? '' : pnlUsd.toFixed(2),
          new Date(item.addedAt).toISOString(), new Date(item.lastCheckedAt).toISOString()
        ];
      })
    );
  });
}

/* Notifications / sound */
const notifBtn = document.getElementById('notifBtn');
const notifStatusEl = document.getElementById('notifStatus');
function updateNotifUi(){
  if(!('Notification' in window)){
    notifStatusEl.textContent = 'Tidak didukung browser ini';
    notifBtn.style.display = 'none';
    return;
  }
  if(Notification.permission === 'granted'){
    notifStatusEl.textContent = 'Aktif';
    notifBtn.style.display = 'none';
  } else if(Notification.permission === 'denied'){
    notifStatusEl.textContent = 'Diblokir — ubah lewat setting browser';
    notifBtn.style.display = 'none';
  } else {
    notifStatusEl.textContent = 'Belum diaktifkan';
    notifBtn.style.display = 'inline-block';
  }
}
notifBtn.addEventListener('click', async () => {
  if(!('Notification' in window)) return;
  await Notification.requestPermission();
  updateNotifUi();
});
function notify(title, body){
  toast(`${title} — ${body}`);
  if('Notification' in window && Notification.permission === 'granted'){
    try{ new Notification(title, { body }); }catch(e){ /* ignore */ }
  }
}
function playAlertSound(){
  if(!LS.get(KEYS.sound, true)) return;
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.35);
  }catch(e){ /* audio blocked */ }
}

/* Auto re-scan loop */
let autoRescanTimer = null;
function setupAutoRescan(){
  if(autoRescanTimer) clearInterval(autoRescanTimer);
  const minutes = LS.get(KEYS.rescanMinutes, 0);
  if(!minutes){
    autoRescanDescEl.textContent = 'Nonaktif — atur di tab Settings';
    return;
  }
  autoRescanDescEl.textContent = `Aktif — tiap ${minutes} menit selagi tab ini terbuka`;
  autoRescanTimer = setInterval(async () => {
    const list = LS.get(KEYS.watchlist, []);
    for(const item of list){
      await rescanWatchlistItem(item.address, { silent: true });
      await sleep(700);
    }
    if(document.getElementById('view-watchlist').classList.contains('active')) renderWatchlist();
  }, minutes * 60000);
}

/* ---------- 8. History ---------- */
const histListEl = document.getElementById('histList');
const histEmptyEl = document.getElementById('histEmpty');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

function addHistory(address, result){
  let list = LS.get(KEYS.history, []);
  const now = Date.now();
  const entry = { address, symbol: result.symbol, pct: result.pct, verdict: result.verdict, verdictClass: result.verdictClass, scannedAt: now };
  // Avoid spammy duplicates: if the very last scan was the same token within 2 minutes, update it in place instead of adding a new row.
  if(list.length && list[0].address === address && (now - list[0].scannedAt) < 120000){
    list[0] = entry;
  } else {
    list.unshift(entry);
  }
  list = list.slice(0, 50);
  LS.set(KEYS.history, list);
}

let histSearchQuery = '';
let histFilterClass = 'all';

function getFilteredHistory(){
  const list = LS.get(KEYS.history, []);
  return list.filter(h => {
    const matchesFilter = histFilterClass === 'all' || h.verdictClass === histFilterClass;
    const q = histSearchQuery;
    const matchesSearch = !q || h.symbol.toLowerCase().includes(q) || h.address.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });
}

function renderHistory(){
  const fullList = LS.get(KEYS.history, []);
  const list = getFilteredHistory();
  histEmptyEl.style.display = list.length ? 'none' : 'block';
  histEmptyEl.textContent = fullList.length && !list.length
    ? 'Nggak ada hasil yang cocok dengan pencarian/filter.'
    : 'Belum ada riwayat scan.';
  histListEl.innerHTML = list.map((h) => `
    <div class="hist-card" data-addr="${h.address}">
      <div class="hist-left">
        <div class="hist-sym">$${h.symbol}</div>
        <div class="hist-time">${fmtAgo(h.scannedAt)} · ${shortAddr(h.address)}</div>
      </div>
      <div class="hist-right">
        <div class="hist-pct ${h.verdictClass}">${h.pct}%</div>
      </div>
    </div>
  `).join('');
  histListEl.querySelectorAll('.hist-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelector('.tab[data-tab="scan"]').click();
      addrInput.value = card.dataset.addr;
      scan();
    });
  });
}
clearHistoryBtn.addEventListener('click', () => {
  if(!confirm('Hapus semua riwayat scan?')) return;
  LS.set(KEYS.history, []);
  renderHistory();
});

const histSearchEl = document.getElementById('histSearch');
const histFilterChipsEl = document.getElementById('histFilterChips');
const histExportBtn = document.getElementById('histExportBtn');

histSearchEl.addEventListener('input', () => {
  histSearchQuery = histSearchEl.value.trim().toLowerCase();
  renderHistory();
});
histFilterChipsEl.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    histFilterChipsEl.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    histFilterClass = chip.dataset.filter;
    renderHistory();
  });
});
histExportBtn.addEventListener('click', () => {
  const list = getFilteredHistory();
  if(!list.length){ toast('Nggak ada data buat di-export.'); return; }
  exportCsv('scrn-history.csv',
    ['Symbol', 'Address', 'Score%', 'Verdict', 'ScannedAt'],
    list.map(h => [h.symbol, h.address, h.pct, h.verdict, new Date(h.scannedAt).toISOString()])
  );
});

/* ---------- 9. Settings / init ---------- */
const soundSwitch = document.getElementById('soundSwitch');
const rescanIntervalSel = document.getElementById('rescanInterval');
const presetStrictBtn = document.getElementById('presetStrictBtn');
const presetLooseBtn = document.getElementById('presetLooseBtn');
const presetCustomBtn = document.getElementById('presetCustomBtn');
const criteriaFieldsEl = document.getElementById('criteriaFields');
const saveCriteriaBtn = document.getElementById('saveCriteriaBtn');
const wipeBtn = document.getElementById('wipeBtn');
const criteriaBodyEl = document.getElementById('criteriaBody');
const activePresetLabelEl = document.getElementById('activePresetLabel');

darkModeSwitch.addEventListener('change', () => applyTheme(darkModeSwitch.checked ? 'dark' : 'light'));
soundSwitch.addEventListener('change', () => LS.set(KEYS.sound, soundSwitch.checked));
rescanIntervalSel.addEventListener('change', () => {
  LS.set(KEYS.rescanMinutes, Number(rescanIntervalSel.value));
  setupAutoRescan();
});

function setPreset(name){
  LS.set(KEYS.activePreset, name);
  [presetStrictBtn, presetLooseBtn, presetCustomBtn].forEach(b => b.classList.remove('active'));
  ({ strict: presetStrictBtn, loose: presetLooseBtn, custom: presetCustomBtn }[name]).classList.add('active');
  renderCriteriaFields();
  renderCriteriaSummary();
  syncCriteriaToServer();
}
presetStrictBtn.addEventListener('click', () => setPreset('strict'));
presetLooseBtn.addEventListener('click', () => setPreset('loose'));
presetCustomBtn.addEventListener('click', () => setPreset('custom'));

function renderCriteriaFields(){
  const criteria = getActiveCriteria();
  criteriaFieldsEl.innerHTML = CRITERIA_FIELDS.map(([key, label]) => `
    <div class="field">
      <label>${label}</label>
      <input type="number" step="any" data-key="${key}" value="${criteria[key]}">
    </div>
  `).join('');
}
saveCriteriaBtn.addEventListener('click', () => {
  const custom = {};
  criteriaFieldsEl.querySelectorAll('input').forEach(inp => {
    custom[inp.dataset.key] = Number(inp.value);
  });
  LS.set(KEYS.customCriteria, custom);
  setPreset('custom'); // also syncs to server
  toast('Kriteria custom disimpan & diaktifkan.');
});

function renderCriteriaSummary(){
  const c = getActiveCriteria();
  const name = getActivePresetName();
  activePresetLabelEl.textContent = `(${name.toUpperCase()})`;
  criteriaBodyEl.innerHTML = `
    <div><b>Liquidity</b> — full skor di ≥$${c.liqFull.toLocaleString()}, minimum $${c.liqMin.toLocaleString()}</div>
    <div><b>Vol/Liq ratio</b> — sehat di ${c.ratioLowFull}x–${c.ratioHighFull}x</div>
    <div><b>Umur token</b> — full skor di ≥${c.ageFullH} jam, waspada di bawah ${c.ageMinH} jam</div>
    <div><b>Mint & Freeze authority</b> — wajib revoked, auto-reject kalau tidak</div>
    <div><b>Top 10 holder</b> — max ${c.top10Full}% supply untuk skor penuh</div>
    <div><b>LP lock/burn</b> — wajib terkonfirmasi</div>
  `;
}

wipeBtn.addEventListener('click', async () => {
  if(!confirm('Hapus SEMUA data lokal (history, watchlist, preset custom, riwayat paste, sinyal background)? Tidak bisa dibatalkan.')) return;
  if(LS.get(KEYS.pushEnabled, false)) await disablePushSignals();
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  toast('Semua data lokal dihapus.');
  renderHistory(); renderWatchlist(); renderRecentPastes(); updateWlCount();
  setPreset('strict');
  applyTheme('dark');
  soundSwitch.checked = true;
  rescanIntervalSel.value = '0';
  setupAutoRescan();
});

function renderSettings(){
  soundSwitch.checked = LS.get(KEYS.sound, true);
  rescanIntervalSel.value = String(LS.get(KEYS.rescanMinutes, 0));
  const name = getActivePresetName();
  [presetStrictBtn, presetLooseBtn, presetCustomBtn].forEach(b => b.classList.remove('active'));
  ({ strict: presetStrictBtn, loose: presetLooseBtn, custom: presetCustomBtn }[name]).classList.add('active');
  renderCriteriaFields();
  updateNotifUi();
  updatePushUi();
}

/* ---------- Background push signals (works with the tab fully closed) ---------- */
const pushSwitch = document.getElementById('pushSwitch');
const pushStatusEl = document.getElementById('pushStatus');

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for(let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function updatePushUi(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)){
    pushStatusEl.textContent = 'Tidak didukung browser/perangkat ini';
    pushSwitch.disabled = true;
    return;
  }
  const enabled = LS.get(KEYS.pushEnabled, false);
  pushSwitch.checked = enabled;
  pushStatusEl.textContent = enabled
    ? 'Aktif — server ngecek tiap ±5 menit, nggak perlu tab kebuka'
    : 'Nonaktif — jalan di server, nggak perlu tab kebuka';
}

async function syncCriteriaToServer(){
  if(!LS.get(KEYS.pushEnabled, false)) return;
  try{
    await fetch('/.netlify/functions/save-criteria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ criteria: getActiveCriteria() }),
    });
  }catch(e){ /* best-effort; next criteria change or resubscribe will retry */ }
}

async function enablePushSignals(){
  try{
    if(Notification.permission === 'default') await Notification.requestPermission();
    if(Notification.permission !== 'granted'){
      toast('Izin notifikasi ditolak — nggak bisa aktifkan sinyal background.');
      return false;
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const res = await fetch('/.netlify/functions/save-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), criteria: getActiveCriteria() }),
    });
    if(!res.ok) throw new Error(`server HTTP ${res.status}`);
    LS.set(KEYS.pushEnabled, true);
    toast('Sinyal background aktif — jalan walau app ditutup.');
    return true;
  }catch(e){
    toast(`Gagal aktifkan sinyal background: ${e.message}`);
    return false;
  }
}

async function disablePushSignals(){
  try{
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub){
      await fetch('/.netlify/functions/remove-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe();
    }
  }catch(e){ /* best-effort cleanup */ }
  LS.set(KEYS.pushEnabled, false);
  toast('Sinyal background dimatikan.');
}

if(pushSwitch){
  pushSwitch.addEventListener('change', async () => {
    pushSwitch.disabled = true;
    if(pushSwitch.checked){
      const ok = await enablePushSignals();
      if(!ok) pushSwitch.checked = false;
    } else {
      await disablePushSignals();
    }
    pushSwitch.disabled = false;
    updatePushUi();
  });
}

/* Service worker registration */
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* ignore in dev / unsupported hosting */ });
  });
}

/* Init */
(function init(){
  applyTheme(LS.get(KEYS.theme, 'dark'));
  renderRecentPastes();
  renderHistory();
  renderWatchlist();
  renderCriteriaSummary();
  setupAutoRescan();

  // Deep link from a background push notification: /?scan=<address>
  const deepLinkAddr = new URLSearchParams(location.search).get('scan');
  if(deepLinkAddr){
    addrInput.value = deepLinkAddr;
    history.replaceState(null, '', location.pathname); // clean the URL
    scan();
  }
})();
