import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SITES, withCustom, hostOf, siteFor, dayKey, weekOf, addTime, prune, formatDuration, invoice, conversions } from "../extension/receipt.js";

test("hostOf keeps only web hosts, without www", () => {
  assert.equal(hostOf("https://www.youtube.com/watch?v=x"), "youtube.com");
  assert.equal(hostOf("http://m.reddit.com/r/all"), "m.reddit.com");
  assert.equal(hostOf("chrome://extensions"), "");
  assert.equal(hostOf("not a url"), "");
  assert.equal(hostOf(undefined), "");
});

test("siteFor matches domains and subdomains, never look-alikes", () => {
  assert.equal(siteFor("youtube.com").id, "youtube");
  assert.equal(siteFor("m.youtube.com").id, "youtube");
  assert.equal(siteFor("twitter.com").id, "x");
  assert.equal(siteFor("notyoutube.com"), null);
  assert.equal(siteFor("ycombinator.com"), null, "only news.ycombinator.com is billed");
  assert.equal(siteFor(""), null);
  assert.equal(siteFor("blog.example.com", withCustom(["example.com"])).id, "custom:example.com");
});

test("weeks run Monday to Sunday in local time", () => {
  const w = weekOf(new Date(2026, 9, 21)); // Wednesday
  assert.equal(w.start, "2026-10-19");
  assert.equal(w.end, "2026-10-25");
  assert.equal(w.days.length, 7);
  assert.equal(weekOf(new Date(2026, 9, 25)).start, "2026-10-19", "Sunday belongs to the week before it");
  assert.equal(weekOf(new Date(2026, 9, 21), -1).start, "2026-10-12");
  assert.equal(dayKey(new Date(2026, 0, 5)), "2026-01-05");
});

test("addTime accumulates and ignores junk", () => {
  const t = {};
  addTime(t, "2026-10-20", "youtube", 60);
  addTime(t, "2026-10-20", "youtube", 30);
  addTime(t, "2026-10-20", "x", -5);
  addTime(t, "2026-10-20", "x", NaN);
  assert.deepEqual(t, { "2026-10-20": { youtube: 90 } });
});

test("prune drops old days only", () => {
  const t = { "2026-01-01": { x: 1 }, "2026-10-19": { x: 1 } };
  prune(t, 70, new Date(2026, 9, 21));
  assert.deepEqual(Object.keys(t), ["2026-10-19"]);
});

test("invoice sums the week, sorts by time, and skips crumbs", () => {
  const t = {};
  addTime(t, "2026-10-19", "youtube", 3600);
  addTime(t, "2026-10-25", "youtube", 1800);
  addTime(t, "2026-10-20", "reddit", 7200);
  addTime(t, "2026-10-20", "x", 20);
  addTime(t, "2026-10-26", "tiktok", 9999); // next week
  const inv = invoice(t, weekOf(new Date(2026, 9, 21)));
  assert.deepEqual(inv.lines.map((l) => [l.id, l.seconds]), [["reddit", 7200], ["youtube", 5400]]);
  assert.equal(inv.seconds, 12600);
  assert.match(inv.number, /^\d{6}$/);
  assert.equal(inv.number, invoice(t, weekOf(new Date(2026, 9, 21))).number, "stable invoice number");
});

test("durations and conversions read right", () => {
  assert.equal(formatDuration(59), "1m");
  assert.equal(formatDuration(3600 * 14 + 22 * 60), "14h 22m");
  assert.deepEqual(conversions(3600 * 14), ["2.0 novels, read cover to cover", "1.8 full nights of sleep", "38 episodes of a sitcom you'd actually remember", "$101.50 at the US federal minimum wage"]);
});

test("manifest grants host access to exactly the built-in sites, and no tabs permission", () => {
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  const expected = [...new Set(SITES.flatMap((s) => s.domains))].map((d) => `*://*.${d}/*`);
  assert.deepEqual(manifest.host_permissions, expected);
  assert.ok(!manifest.permissions.includes("tabs"), "tabs would expose every site's URL");
  assert.equal(manifest.manifest_version, 3);
});
