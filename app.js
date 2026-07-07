// ============================================================
// Bangkok Weed Shop Tracker — app.js
// ============================================================

const STATUS_LABELS = {
  not_contacted: "Not contacted",
  contacted: "Contacted",
  signed: "Signed",
  closed: "Closed"
};
const STATUS_ORDER = ["not_contacted", "contacted", "signed", "closed"];

const SESSION_KEY = "bwt_session";
const LOCAL_SHOPS_KEY = "bwt_local_shops";
const POLL_INTERVAL_MS = 7000;

let API_BASE = "/.netlify/functions";
let USE_REMOTE = false;
let pollTimer = null;
let lastShopsHash = null;

let allShops = [];
let session = null; // {username, role}

let filterText = "";
let filterDistrict = "all";
let filterStatus = "all";
let openDistricts = new Set();

// ---------------- Init ----------------
async function initRemote() {
  const cfg = window.APP_CONFIG || {};
  API_BASE = cfg.apiBase || "/.netlify/functions";
  try {
    const res = await fetch(`${API_BASE}/shops`, { method: "GET" });
    USE_REMOTE = res.ok;
  } catch (e) {
    USE_REMOTE = false;
  }
}

function setSyncPill() {
  const pill = document.getElementById("syncPill");
  if (!pill) return;
  if (USE_REMOTE) {
    pill.className = "sync-pill live";
    pill.innerHTML = `<span class="dot2"></span> Synced`;
  } else {
    pill.className = "sync-pill local";
    pill.innerHTML = `<span class="dot2"></span> This device only`;
  }
}

async function apiCall(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const msg = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

// ---------------- Auth ----------------
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    session = raw ? JSON.parse(raw) : null;
  } catch (e) {
    session = null;
  }
}
function saveSession(s) {
  session = s;
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
function clearSession() {
  session = null;
  localStorage.removeItem(SESSION_KEY);
}

function localUsers() {
  const users = JSON.parse(localStorage.getItem("bwt_local_users") || "[]");
  if (users.length === 0) {
    users.push({ username: "admin", passcode: "000000", role: "admin" });
    localStorage.setItem("bwt_local_users", JSON.stringify(users));
  }
  return users;
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const passcode = document.getElementById("loginPasscode").value.trim();
  const errBox = document.getElementById("loginError");
  errBox.classList.add("hidden");

  if (!username || !/^\d{6}$/.test(passcode)) {
    errBox.textContent = "Enter a username and your 6-digit passcode.";
    errBox.classList.remove("hidden");
    return;
  }
  try {
    if (USE_REMOTE) {
      const data = await apiCall(`/auth?action=login`, {
        method: "POST",
        body: JSON.stringify({ username, passcode })
      });
      saveSession(data.user);
    } else {
      const users = localUsers();
      const user = users.find(u => u.username === username);
      if (!user || user.passcode !== passcode) throw new Error("Username or passcode is incorrect.");
      saveSession({ username: user.username, role: user.role });
    }
    showApp();
  } catch (err) {
    errBox.textContent = err.message || "Username or passcode is incorrect.";
    errBox.classList.remove("hidden");
    console.error(err);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById("regUsername").value.trim();
  const passcode = document.getElementById("regPasscode").value.trim();
  const confirm = document.getElementById("regPasscodeConfirm").value.trim();
  const errBox = document.getElementById("regError");
  errBox.classList.add("hidden");

  if (!username) {
    errBox.textContent = "Choose a username.";
    errBox.classList.remove("hidden");
    return;
  }
  if (!/^\d{6}$/.test(passcode)) {
    errBox.textContent = "Passcode must be exactly 6 digits.";
    errBox.classList.remove("hidden");
    return;
  }
  if (passcode !== confirm) {
    errBox.textContent = "Passcodes don't match.";
    errBox.classList.remove("hidden");
    return;
  }
  try {
    if (USE_REMOTE) {
      const data = await apiCall(`/auth?action=register`, {
        method: "POST",
        body: JSON.stringify({ username, passcode })
      });
      saveSession(data.user);
    } else {
      const users = localUsers();
      if (users.find(u => u.username === username)) throw new Error("That username is already taken.");
      users.push({ username, passcode, role: "user" });
      localStorage.setItem("bwt_local_users", JSON.stringify(users));
      saveSession({ username, role: "user" });
    }
    showApp();
  } catch (err) {
    errBox.textContent = err.message || "Registration failed.";
    errBox.classList.remove("hidden");
    console.error(err);
  }
}

function logout() {
  clearSession();
  location.reload();
}

// ---------------- Data layer ----------------
async function fetchAllShops() {
  if (USE_REMOTE) {
    const data = await apiCall("/shops");
    return data.shops;
  } else {
    const raw = localStorage.getItem(LOCAL_SHOPS_KEY);
    return raw ? JSON.parse(raw) : [];
  }
}

function saveLocalShops(shops) {
  localStorage.setItem(LOCAL_SHOPS_KEY, JSON.stringify(shops));
}

async function seedIfEmpty() {
  // The Netlify function seeds itself from its bundled copy of shops.json
  // the first time it runs, so remote mode just needs a fetch.
  if (USE_REMOTE) {
    allShops = await fetchAllShops();
    lastShopsHash = JSON.stringify(allShops);
    return;
  }
  const current = await fetchAllShops();
  if (current.length > 0) {
    allShops = current;
    return;
  }
  const res = await fetch("./shops.json");
  const seed = await res.json();
  seed.forEach(s => { s.id = crypto.randomUUID(); });
  saveLocalShops(seed);
  allShops = seed;
}

async function updateShopStatus(shopId, newStatus) {
  const editedBy = session ? session.username : "unknown";
  const editedAt = new Date().toISOString();
  try {
    if (USE_REMOTE) {
      await apiCall(`/shops?id=${encodeURIComponent(shopId)}`, {
        method: "PATCH",
        body: JSON.stringify({ track_status: newStatus, edited_by: editedBy, edited_at: editedAt })
      });
    } else {
      const shops = await fetchAllShops();
      const idx = shops.findIndex(s => s.id === shopId);
      if (idx > -1) {
        shops[idx].track_status = newStatus;
        shops[idx].edited_by = editedBy;
        shops[idx].edited_at = editedAt;
        saveLocalShops(shops);
      }
    }
  } catch (err) {
    console.error(err);
    showToast("Update failed");
    return;
  }
  const local = allShops.find(s => s.id === shopId);
  if (local) { local.track_status = newStatus; local.edited_by = editedBy; local.edited_at = editedAt; }
  lastShopsHash = JSON.stringify(allShops);
  renderAll();
}

async function addShop(shop) {
  shop.track_status = "not_contacted";
  shop.socials = shop.socials || {};
  try {
    if (USE_REMOTE) {
      const data = await apiCall("/shops", { method: "POST", body: JSON.stringify(shop) });
      allShops.unshift(data.shop);
    } else {
      shop.id = crypto.randomUUID();
      const shops = await fetchAllShops();
      shops.unshift(shop);
      saveLocalShops(shops);
      allShops.unshift(shop);
    }
  } catch (err) {
    console.error(err);
    showToast("Couldn't add shop");
    return;
  }
  lastShopsHash = JSON.stringify(allShops);
  renderAll();
  showToast("Shop added");
}

async function deleteShop(shopId) {
  try {
    if (USE_REMOTE) {
      await apiCall(`/shops?id=${encodeURIComponent(shopId)}`, { method: "DELETE" });
    } else {
      const shops = await fetchAllShops();
      saveLocalShops(shops.filter(s => s.id !== shopId));
    }
  } catch (err) {
    console.error(err);
    showToast("Delete failed");
    return;
  }
  allShops = allShops.filter(s => s.id !== shopId);
  lastShopsHash = JSON.stringify(allShops);
  renderAll();
  showToast("Shop deleted");
}

// Netlify Blobs has no realtime push, so cross-device sync happens by
// polling the function on an interval and re-rendering only if the data
// actually changed (keeps open/closed district sections stable).
function startPolling() {
  if (!USE_REMOTE) return;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const fresh = await fetchAllShops();
      const hash = JSON.stringify(fresh);
      if (hash !== lastShopsHash) {
        lastShopsHash = hash;
        allShops = fresh;
        renderAll();
      }
    } catch (e) { /* stay quiet, try again next tick */ }
  }, POLL_INTERVAL_MS);
  window.addEventListener("focus", async () => {
    try {
      const fresh = await fetchAllShops();
      const hash = JSON.stringify(fresh);
      if (hash !== lastShopsHash) { lastShopsHash = hash; allShops = fresh; renderAll(); }
    } catch (e) {}
  });
}

// ---------------- Rendering ----------------
function showToast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function socialIcon(type) {
  const icons = {
    instagram: "IG", facebook: "FB", line: "LINE", linktree: "Link",
    tiktok: "TikTok", whatsapp: "WA", twitter: "X", website: "Web"
  };
  return icons[type] || "Link";
}

function renderStats() {
  const counts = { not_contacted: 0, contacted: 0, signed: 0, closed: 0 };
  allShops.forEach(s => { counts[s.track_status] = (counts[s.track_status] || 0) + 1; });
  const strip = document.getElementById("statsStrip");
  strip.innerHTML = STATUS_ORDER.map(key => `
    <div class="stat ${key === 'signed' ? 'signed' : ''}">
      <span class="num">${counts[key] || 0}</span>
      <span class="lbl">${STATUS_LABELS[key]}</span>
    </div>
  `).join("");
}

function renderDistrictOptions() {
  const sel = document.getElementById("districtSelect");
  const districts = [...new Set(allShops.map(s => s.district || "Other"))].sort();
  sel.innerHTML = `<option value="all">All districts</option>` +
    districts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)} (${allShops.filter(s => s.district === d).length})</option>`).join("");
  sel.value = filterDistrict;
}

function matchesFilters(s) {
  if (filterStatus !== "all" && s.track_status !== filterStatus) return false;
  if (filterDistrict !== "all" && s.district !== filterDistrict) return false;
  if (filterText) {
    const q = filterText.toLowerCase();
    const hay = `${s.name} ${s.address}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function shopCardHtml(s) {
  const rating = (s.rating !== "" && s.rating != null) ? `<span class="shop-rating">★ ${s.rating}</span>` : "";
  const links = [];
  if (s.maps_link) links.push(`<a class="pill-link maps" href="${escapeHtml(s.maps_link)}" target="_blank" rel="noopener">📍 Maps</a>`);
  if (s.phone) links.push(`<a class="pill-link" href="tel:${escapeHtml(s.phone.replace(/\s+/g, ''))}">📞 ${escapeHtml(s.phone)}</a>`);
  if (s.email) links.push(`<a class="pill-link" href="mailto:${escapeHtml(s.email)}">✉️ Email</a>`);
  if (s.website) links.push(`<a class="pill-link" href="${escapeHtml(s.website)}" target="_blank" rel="noopener">🌐 Website</a>`);
  const socials = s.socials || {};
  Object.keys(socials).forEach(type => {
    links.push(`<a class="pill-link" href="${escapeHtml(socials[type])}" target="_blank" rel="noopener">${socialIcon(type)}</a>`);
  });

  const editedNote = s.edited_by
    ? `<span class="edited-note">edited by ${escapeHtml(s.edited_by)}</span>`
    : `<span class="edited-note">not yet reviewed</span>`;

  return `
    <div class="shop-card" data-id="${s.id}">
      <div class="shop-top">
        <div class="shop-name">${escapeHtml(s.name)}</div>
        ${rating}
      </div>
      <div class="shop-addr">${escapeHtml(s.address)}</div>
      <div class="shop-links">${links.join("")}</div>
      ${s.hours ? `<div class="shop-hours">${escapeHtml(s.hours)}</div>` : ""}
      <div class="shop-foot">
        <select class="status-select ${s.track_status}" data-action="status" data-id="${s.id}">
          ${STATUS_ORDER.map(k => `<option value="${k}" ${s.track_status === k ? "selected" : ""}>${STATUS_LABELS[k]}</option>`).join("")}
        </select>
        <div style="display:flex; align-items:center; gap:8px;">
          ${editedNote}
          <button class="trash-btn" data-action="delete" data-id="${s.id}" title="Delete shop">🗑</button>
        </div>
      </div>
    </div>
  `;
}

function renderDistricts() {
  const container = document.getElementById("districts");
  const filtered = allShops.filter(matchesFilters);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="big">🌿</div>No shops match your filters.</div>`;
    return;
  }

  const grouped = {};
  filtered.forEach(s => {
    const d = s.district || "Other / Unspecified";
    (grouped[d] = grouped[d] || []).push(s);
  });
  const districtNames = Object.keys(grouped).sort((a, b) => grouped[b].length - grouped[a].length);

  if (openDistricts.size === 0 && districtNames.length) {
    openDistricts.add(districtNames[0]);
  }

  container.innerHTML = districtNames.map(d => {
    const shops = grouped[d].sort((a, b) => a.name.localeCompare(b.name));
    const isOpen = openDistricts.has(d);
    return `
      <div class="district-group ${isOpen ? "open" : ""}" data-district="${escapeHtml(d)}">
        <div class="district-head" data-action="toggle-district" data-district="${escapeHtml(d)}">
          <h3>${escapeHtml(d)}</h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="meta">${shops.length} shop${shops.length !== 1 ? "s" : ""}</span>
            <span class="chev">▾</span>
          </div>
        </div>
        <div class="district-body">
          ${shops.map(shopCardHtml).join("")}
        </div>
      </div>
    `;
  }).join("");
}

function renderChips() {
  const row = document.getElementById("chipRow");
  const counts = { all: allShops.length };
  STATUS_ORDER.forEach(k => counts[k] = allShops.filter(s => s.track_status === k).length);
  const chips = [["all", "All"], ...STATUS_ORDER.map(k => [k, STATUS_LABELS[k]])];
  row.innerHTML = chips.map(([key, label]) => `
    <button class="chip ${filterStatus === key ? "active" : ""}" data-action="filter-status" data-status="${key}">
      ${label} <span class="count">${counts[key]}</span>
    </button>
  `).join("");
}

function renderWho() {
  const who = document.getElementById("whoBox");
  who.innerHTML = session
    ? `<span class="badge">${session.role}</span> ${escapeHtml(session.username)}`
    : "";
}

function renderAll() {
  renderStats();
  renderChips();
  renderDistrictOptions();
  renderDistricts();
  renderWho();
}

// ---------------- Modals ----------------
function openAddModal() {
  document.getElementById("addModalOverlay").classList.remove("hidden");
}
function closeAddModal() {
  document.getElementById("addModalOverlay").classList.add("hidden");
  document.getElementById("addShopForm").reset();
}
function handleAddShop(e) {
  e.preventDefault();
  const f = id => document.getElementById(id).value.trim();
  const shop = {
    name: f("addName"),
    rating: f("addRating") ? parseFloat(f("addRating")) : "",
    address: f("addAddress"),
    phone: f("addPhone"),
    email: f("addEmail"),
    hours: f("addHours"),
    district: f("addDistrict") || "Other / Unspecified",
    maps_link: f("addMaps"),
    website: f("addWebsite"),
    socials: {
      instagram: f("addInstagram") || undefined,
      facebook: f("addFacebook") || undefined,
      line: f("addLine") || undefined
    },
    google_status: "OPERATIONAL"
  };
  Object.keys(shop.socials).forEach(k => { if (!shop.socials[k]) delete shop.socials[k]; });
  if (!shop.name) return;
  addShop(shop);
  closeAddModal();
}

let pendingDeleteId = null;
function openDeleteModal(id) {
  pendingDeleteId = id;
  document.getElementById("deleteModalOverlay").classList.remove("hidden");
}
function closeDeleteModal() {
  pendingDeleteId = null;
  document.getElementById("deleteModalOverlay").classList.add("hidden");
}
function confirmDelete() {
  if (pendingDeleteId) deleteShop(pendingDeleteId);
  closeDeleteModal();
}

// ---------------- Event delegation ----------------
function wireEvents() {
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("registerForm").addEventListener("submit", handleRegister);
  document.getElementById("showRegister").addEventListener("click", () => {
    document.getElementById("loginPane").classList.add("hidden");
    document.getElementById("registerPane").classList.remove("hidden");
  });
  document.getElementById("showLogin").addEventListener("click", () => {
    document.getElementById("registerPane").classList.add("hidden");
    document.getElementById("loginPane").classList.remove("hidden");
  });
  document.getElementById("logoutBtn").addEventListener("click", logout);

  document.getElementById("searchInput").addEventListener("input", (e) => {
    filterText = e.target.value;
    renderDistricts();
  });
  document.getElementById("districtSelect").addEventListener("change", (e) => {
    filterDistrict = e.target.value;
    renderDistricts();
  });

  document.getElementById("fabAdd").addEventListener("click", openAddModal);
  document.getElementById("addShopForm").addEventListener("submit", handleAddShop);
  document.getElementById("cancelAdd").addEventListener("click", closeAddModal);

  document.getElementById("cancelDelete").addEventListener("click", closeDeleteModal);
  document.getElementById("confirmDelete").addEventListener("click", confirmDelete);

  document.getElementById("districts").addEventListener("click", (e) => {
    const toggle = e.target.closest('[data-action="toggle-district"]');
    if (toggle) {
      const d = toggle.dataset.district;
      if (openDistricts.has(d)) openDistricts.delete(d); else openDistricts.add(d);
      renderDistricts();
      return;
    }
    const del = e.target.closest('[data-action="delete"]');
    if (del) {
      openDeleteModal(del.dataset.id);
      return;
    }
  });
  document.getElementById("districts").addEventListener("change", (e) => {
    const sel = e.target.closest('[data-action="status"]');
    if (sel) {
      updateShopStatus(sel.dataset.id, sel.value);
    }
  });
  document.getElementById("chipRow").addEventListener("click", (e) => {
    const chip = e.target.closest('[data-action="filter-status"]');
    if (chip) {
      filterStatus = chip.dataset.status;
      renderChips();
      renderDistricts();
    }
  });
}

// ---------------- App boot ----------------
async function showApp() {
  document.getElementById("authScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  setSyncPill();
  await seedIfEmpty();
  renderAll();
  startPolling();
}

async function boot() {
  await initRemote();
  loadSession();
  wireEvents();
  if (session) {
    showApp();
  }
}

document.addEventListener("DOMContentLoaded", boot);
