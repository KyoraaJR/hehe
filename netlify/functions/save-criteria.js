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

  if (!body || !body.criteria) {
    return { statusCode: 400, body: JSON.stringify({ error: "criteria wajib diisi" }) };
  }

  try {
    const store = getStore("scrn-store");
    await store.setJSON("criteria", body.criteria);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: `Gagal simpan kriteria: ${e.message}` }) };
  }
};
