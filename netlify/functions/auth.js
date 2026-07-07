// netlify/functions/auth.js
// Simple username + 6-digit-passcode auth backed by Netlify Blobs.
// Seeds a default admin/000000 account the first time it runs.

const { getStore } = require("@netlify/blobs");

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json"
};

function store() {
  return getStore("weed-tracker");
}

async function ensureSeeded(s) {
  let users = await s.get("users", { type: "json" });
  if (!users) {
    users = [{ username: "admin", passcode: "000000", role: "admin" }];
    await s.setJSON("users", users);
  }
  return users;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: HEADERS, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const action = (event.queryStringParameters && event.queryStringParameters.action) || "";
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Bad request body" }) };
  }

  const s = store();
  const users = await ensureSeeded(s);

  if (action === "login") {
    const user = users.find((u) => u.username === body.username);
    if (!user || user.passcode !== body.passcode) {
      return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: "Username or passcode is incorrect" }) };
    }
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ user: { username: user.username, role: user.role } }) };
  }

  if (action === "register") {
    if (!body.username || !/^\d{6}$/.test(body.passcode || "")) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Username and a 6-digit passcode are required" }) };
    }
    if (users.find((u) => u.username === body.username)) {
      return { statusCode: 409, headers: HEADERS, body: JSON.stringify({ error: "That username is already taken" }) };
    }
    const newUser = { username: body.username, passcode: body.passcode, role: "user" };
    users.push(newUser);
    await s.setJSON("users", users);
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ user: { username: newUser.username, role: newUser.role } }) };
  }

  return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "Unknown action" }) };
};
