const { getStore } = require("@netlify/blobs");

// Netlify's automatic Blobs context injection is unreliable on some sites
// (a known platform quirk). If NETLIFY_SITE_ID/NETLIFY_BLOBS_TOKEN are set,
// configure the store explicitly instead of relying on auto-detection.
function getBlobStore() {
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN) {
    return getStore({
      name: "scrn-store",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });
  }
  return getStore("scrn-store");
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { subscription, criteria } = body || {};
  if (!subscription || !subscription.endpoint) {
    return { statusCode: 400, body: JSON.stringify({ error: "subscription wajib diisi" }) };
  }

  try {
    const store = getBlobStore();
    const subs = (await store.get("subscriptions", { type: "json" })) || [];
    const filtered = subs.filter((s) => s.endpoint !== subscription.endpoint);
    filtered.push(subscription);
    await store.setJSON("subscriptions", filtered);

    if (criteria) {
      await store.setJSON("criteria", criteria);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, totalSubscribers: filtered.length }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: `Gagal simpan subscription: ${e.message}` }) };
  }
};
