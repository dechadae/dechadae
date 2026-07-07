// ============================================================
// This app talks to its own Netlify Functions for storage — no external
// database keys needed. Nothing to fill in here.
//
// If the functions aren't reachable (e.g. you're opening index.html
// directly as a local file, instead of running it through Netlify),
// the app automatically falls back to browser-only storage so you can
// still preview it — see README.md for deploy instructions.
// ============================================================

window.APP_CONFIG = {
  apiBase: "/.netlify/functions"
};
