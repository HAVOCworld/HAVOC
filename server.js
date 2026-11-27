const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const COUNTER_FILE = path.join(DATA_DIR, "visits.json");
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(COUNTER_FILE)) fs.writeFileSync(COUNTER_FILE, JSON.stringify({ total: 0, days: {} }, null, 2));

function readCounts() {
  try { return JSON.parse(fs.readFileSync(COUNTER_FILE, "utf8")); }
  catch { return { total: 0, days: {} }; }
}
function send(res, status, data, type="application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(type === "application/json" ? JSON.stringify(data) : data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; if (body.length > 1e6) reject(new Error("Request too large")); });
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}
const mime = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".ico":"image/x-icon" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/api/visit") {
    const counts = readCounts();
    const day = new Date().toISOString().slice(0,10);
    counts.total += 1;
    counts.days[day] = (counts.days[day] || 0) + 1;
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(counts, null, 2));
    return send(res, 200, { total: counts.total, today: counts.days[day] });
  }
  if (req.method === "GET" && url.pathname === "/api/stats") {
    const counts = readCounts();
    const today = new Date().toISOString().slice(0,10);
    return send(res, 200, { total: counts.total, today: counts.days[today] || 0, days: counts.days });
  }
  if (req.method === "POST" && url.pathname === "/api/create") {
    let body;
    try { body = await readBody(req); } catch (e) { return send(res, 400, { error: e.message }); }
    const type = ["image","song","video"].includes(body.type) ? body.type : null;
    if (!type || typeof body.prompt !== "string" || !body.prompt.trim()) return send(res, 400, { error: "Choose a creation type and enter a prompt." });
    // Connect a generation provider here. Keep secret API keys on the server, never in browser code.
    const envName = ({image:"IMAGE_PROVIDER_URL", song:"SONG_PROVIDER_URL", video:"VIDEO_PROVIDER_URL"})[type];
    if (!process.env[envName]) return send(res, 503, { error: `${type[0].toUpperCase()+type.slice(1)} generation is not connected yet. Add a provider endpoint on your server to enable it.` });
    try {
      const response = await fetch(process.env[envName], {
        method: "POST",
        headers: { "Content-Type":"application/json", ...(process.env.AI_PROVIDER_API_KEY ? { "Authorization":`Bearer ${process.env.AI_PROVIDER_API_KEY}`} : {}) },
        body: JSON.stringify({ prompt: body.prompt.trim() })
      });
      const result = await response.json();
      if (!response.ok) return send(res, 502, { error: "The generation provider returned an error.", details: result.error || result.message || response.status });
      return send(res, 200, { result });
    } catch { return send(res, 502, { error: "Could not reach the generation provider." }); }
  }
  if (req.method === "POST" && url.pathname === "/api/checkout") {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) return send(res, 503, { error: "Payments are not set up yet. Add your Stripe secret key and price ID on the server." });
    try {
      const Stripe = require("stripe");
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: `${process.env.SITE_URL || `http://${req.headers.host}`}/?payment=success`,
        cancel_url: `${process.env.SITE_URL || `http://${req.headers.host}`}/?payment=cancelled`
      });
      return send(res, 200, { url: session.url });
    } catch (e) { return send(res, 500, { error: "Could not start checkout. Check your Stripe settings." }); }
  }

  let filePath = path.join(ROOT, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
  if (!filePath.startsWith(ROOT)) return send(res, 403, { error: "Forbidden" });
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    send(res, 200, data, mime[path.extname(filePath)] || "application/octet-stream");
  });
});
server.listen(PORT, () => console.log(`HAVOC is running at http://localhost:${PORT}`));
