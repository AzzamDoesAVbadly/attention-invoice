// ATTENTION INVOICE: the bill for the time you gave the feed.
// Shared by the extension popup and the demo on machinemadegod.pages.dev.
// Pure data helpers plus one canvas renderer; no browser-extension APIs here.

export const SITES = [
  { id: "youtube", name: "YouTube", fee: "Autoplay surcharge", domains: ["youtube.com", "youtu.be"] },
  { id: "tiktok", name: "TikTok", fee: "For You fee", domains: ["tiktok.com"] },
  { id: "instagram", name: "Instagram", fee: "Comparison tax", domains: ["instagram.com"] },
  { id: "x", name: "X", fee: "Outrage levy", domains: ["x.com", "twitter.com"] },
  { id: "reddit", name: "Reddit", fee: "Rabbit-hole fee", domains: ["reddit.com"] },
  { id: "facebook", name: "Facebook", fee: "Relatives surcharge", domains: ["facebook.com"] },
  { id: "linkedin", name: "LinkedIn", fee: "Thought-leadership tax", domains: ["linkedin.com"] },
  { id: "twitch", name: "Twitch", fee: "Parasocial fee", domains: ["twitch.tv"] },
  { id: "netflix", name: "Netflix", fee: "Are-you-still-watching fee", domains: ["netflix.com"] },
  { id: "threads", name: "Threads", fee: "Alt-platform fee", domains: ["threads.net", "threads.com"] },
  { id: "bluesky", name: "Bluesky", fee: "Alt-platform fee", domains: ["bsky.app"] },
  { id: "pinterest", name: "Pinterest", fee: "Aspiration fee", domains: ["pinterest.com"] },
  { id: "snapchat", name: "Snapchat", fee: "Streak maintenance", domains: ["snapchat.com"] },
  { id: "hackernews", name: "Hacker News", fee: "Smugness tax", domains: ["news.ycombinator.com"] },
];

export const MIN_WAGE = 7.25; // US federal, per hour

/** The built-in sites plus the user's own domains. */
export const withCustom = (custom = []) => [...SITES, ...custom.map((d) => ({ id: `custom:${d}`, name: d, fee: "Self-reported weakness", domains: [d] }))];

/** Hostname of a URL without "www.", or "" for anything that isn't http(s). */
export function hostOf(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

/** The tracked site a hostname belongs to (subdomains included), or null. */
export function siteFor(host, sites = SITES) {
  if (!host) return null;
  return sites.find((s) => s.domains.some((d) => host === d || host.endsWith(`.${d}`))) || null;
}

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday-to-Sunday week containing `date`, shifted by `offset` weeks. */
export function weekOf(date = new Date(), offset = 0) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return dayKey(x);
  });
  return { start: days[0], end: days[6], days };
}

/** Add seconds to totals[day][siteId], returning the same object. */
export function addTime(totals, day, siteId, seconds) {
  if (!(seconds > 0)) return totals;
  totals[day] ??= {};
  totals[day][siteId] = (totals[day][siteId] || 0) + seconds;
  return totals;
}

/** Drop days older than `keepDays` before `today`. */
export function prune(totals, keepDays = 70, today = new Date()) {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - keepDays);
  const min = dayKey(cutoff);
  for (const day of Object.keys(totals)) if (day < min) delete totals[day];
  return totals;
}

export function formatDuration(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** What the same hours could have been. */
export function conversions(seconds) {
  const h = seconds / 3600;
  return [
    `${(h / 7).toFixed(1)} novels, read cover to cover`,
    `${(h / 8).toFixed(1)} full nights of sleep`,
    `${Math.round((h * 60) / 22)} episodes of a sitcom you'd actually remember`,
    `$${(h * MIN_WAGE).toFixed(2)} at the US federal minimum wage`,
  ];
}

/** The invoice for one week of totals: line items, sorted, plus a total. */
export function invoice(totals, week, sites = SITES, { number } = {}) {
  const lines = sites
    .map((s) => ({ id: s.id, name: s.name, fee: s.fee, seconds: week.days.reduce((sum, d) => sum + (totals[d]?.[s.id] || 0), 0) }))
    .filter((l) => l.seconds >= 30)
    .sort((a, b) => b.seconds - a.seconds);
  const seconds = lines.reduce((sum, l) => sum + l.seconds, 0);
  let n = number;
  if (n === undefined) {
    n = 0;
    for (const ch of week.start + seconds) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return { number: String(n % 1e6).padStart(6, "0"), start: week.start, end: week.end, lines, seconds, conversions: conversions(seconds) };
}

const pretty = (day) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Draw a thermal-printer receipt for `inv` onto `canvas` (resized to fit).
 * `fonts` lets the page supply its own families; defaults are system fonts,
 * because an extension popup has no web fonts.
 */
export function drawReceipt(canvas, inv, fonts = {}) {
  const mono = fonts.mono || "'SF Mono', Menlo, Consolas, 'Courier New', monospace";
  const display = fonts.display || "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";
  const W = 600;
  const pad = 36;
  const H = 660 + Math.max(1, inv.lines.length) * 56 + inv.conversions.length * 26;
  const scale = fonts.scale || 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // paper with torn edges
  ctx.fillStyle = "#fbf8f0";
  ctx.beginPath();
  ctx.moveTo(0, 8);
  for (let x = 0; x <= W; x += 12) ctx.lineTo(x, x % 24 ? 0 : 8);
  ctx.lineTo(W, H - 8);
  for (let x = W; x >= 0; x -= 12) ctx.lineTo(x, x % 24 ? H : H - 8);
  ctx.closePath();
  ctx.fill();

  const ink = "#16130f";
  let y = 64;
  const center = (text, font, color = ink) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(text, W / 2, y);
    ctx.textAlign = "left";
  };
  const row = (left, right, font, color = ink) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(left, pad, y);
    ctx.textAlign = "right";
    ctx.fillText(right, W - pad, y);
    ctx.textAlign = "left";
  };
  const rule = (dashed = true) => {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dashed ? [6, 5] : []);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  center("ATTENTION INVOICE", `900 46px ${display}`);
  y += 28;
  center("MMG LABS · BILLING DEPT. OF THE FEED", `600 13px ${mono}`, "#6b645a");
  y += 34;
  row(`INVOICE #${inv.number}`, `${pretty(inv.start)} – ${pretty(inv.end)}`, `600 14px ${mono}`);
  y += 22;
  rule();
  y += 34;
  row("ITEM", "TIME", `700 13px ${mono}`, "#6b645a");
  y += 14;

  if (!inv.lines.length) {
    y += 30;
    center("No charges. Suspicious.", `700 20px ${mono}`);
    y += 26;
  }
  for (const l of inv.lines) {
    y += 30;
    row(l.name.toUpperCase(), formatDuration(l.seconds), `700 20px ${mono}`);
    y += 22;
    row(`  ${l.fee}`, "$0.00", `400 14px ${mono}`, "#6b645a");
  }
  y += 24;
  rule();
  y += 40;
  row("TOTAL TIME", formatDuration(inv.seconds), `900 26px ${mono}`);
  y += 32;
  row("AMOUNT DUE", "$0.00", `700 18px ${mono}`);
  y += 26;
  row("PAID WITH", "YOUR TIME", `700 18px ${mono}`);

  y += 68;
  ctx.save();
  ctx.translate(W / 2, y);
  ctx.rotate(-0.08);
  ctx.strokeStyle = "#d4246a";
  ctx.fillStyle = "#d4246a";
  ctx.lineWidth = 4;
  ctx.font = `900 30px ${display}`;
  ctx.textAlign = "center";
  const stamp = "PAID IN FULL TO THE ALGORITHM";
  const sw = Math.min(W - 70, ctx.measureText(stamp).width + 30);
  ctx.strokeRect(-sw / 2, -34, sw, 50);
  ctx.fillText(stamp, 0, 2, sw - 24);
  ctx.restore();

  y += 58;
  rule();
  y += 30;
  ctx.font = `700 13px ${mono}`;
  ctx.fillStyle = "#6b645a";
  ctx.fillText("THE SAME HOURS COULD HAVE BEEN:", pad, y);
  for (const c of inv.conversions) {
    y += 26;
    ctx.font = `400 15px ${mono}`;
    ctx.fillStyle = ink;
    ctx.fillText(`· ${c}`, pad, y);
  }

  // barcode
  y += 40;
  let seed = Number(inv.number) || 1;
  for (let x = pad + 40; x < W - pad - 40; ) {
    seed = (seed * 16807) % 2147483647;
    const bw = 1 + (seed % 4);
    ctx.fillStyle = ink;
    ctx.fillRect(x, y, bw, 54);
    x += bw + 1 + ((seed >> 3) % 3);
  }
  y += 82;
  center("THANK YOU FOR YOUR ATTENTION.", `700 14px ${mono}`);
  y += 22;
  center("IT HAS BEEN SOLD.", `700 14px ${mono}`);
  y += 26;
  center("No refunds. No returns. machinemadegod.pages.dev/lab", `400 11px ${mono}`, "#6b645a");
  return canvas;
}
