// netlify/functions/shops.js
// Handles the shop directory using Netlify Blobs (Netlify's built-in
// key/value store) — no external database needed.

const { getStore } = require("@netlify/blobs");
const seedData = require("./data/shops.json");

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

function store() {
  return getStore("weed-tracker");
}

function randomId() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: HEADERS, body: "" };

  const s = store();
  const id = event.queryStringParameters && event.queryStringParameters.id;

  try {
    if (event.httpMethod === "GET") {
      let shops = await s.get("shops", { type: "json" });
      if (!shops) {
        // First time this site has run — seed from the bundled dataset.
        shops = seedData.map((sh) => ({ ...sh, id: sh.id || randomId() }));
        await s.setJSON("shops", shops);
      }
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ shops }) };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      if (!body.name) {
        return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Shop name is required" }) };
      }
      let shops = (await s.get("shops", { type: "json" })) || [];
      const newShop = {
        socials: {},
        ...body,
        id: randomId(),
        track_status: body.track_status || "not_contacted"
      };
      shops.unshift(newShop);
      await s.setJSON("shops", shops);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ shop: newShop }) };
    }

    if (event.httpMethod === "PATCH") {
      if (!id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Missing id" }) };
      const body = JSON.parse(event.body || "{}");
      let shops = (await s.get("shops", { type: "json" })) || [];
      const idx = shops.findIndex((x) => x.id === id);
      if (idx === -1) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: "Shop not found" }) };
      shops[idx] = { ...shops[idx], ...body };
      await s.setJSON("shops", shops);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ shop: shops[idx] }) };
    }

    if (event.httpMethod === "DELETE") {
      if (!id) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Missing id" }) };
      let shops = (await s.get("shops", { type: "json" })) || [];
      shops = shops.filter((x) => x.id !== id);
      await s.setJSON("shops", shops);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (err) {
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: String(err && err.message || err) }) };
  }
};
