const { getStore } = require("@netlify/blobs");

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

  const endpoint = body && body.endpoint;
  if (!endpoint) {
    return { statusCode: 400, body: JSON.stringify({ error: "endpoint wajib diisi" }) };
  }

  try {
    const store = getStore("scrn-store");
    const subs = (await store.get("subscriptions", { type: "json" })) || [];
    const filtered = subs.filter((s) => s.endpoint !== endpoint);
    await store.setJSON("subscriptions", filtered);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: `Gagal hapus subscription: ${e.message}` }) };
  }
};
