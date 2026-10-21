// Counts seconds while a tracked site is the focused tab and you're not idle.
// Everything stays in chrome.storage.local; this extension makes no requests.
import { withCustom, hostOf, siteFor, dayKey, addTime, prune } from "./receipt.js";

// The service worker can be stopped at any time, so the open session lives in
// storage and is credited in small pieces. A credit never exceeds MAX_GAP,
// which keeps a sleeping laptop from billing you for the whole night.
const MAX_GAP = 90;
const IDLE_AFTER = 120;

async function load() {
  const { totals = {}, session = null, paused = false, custom = [] } = await chrome.storage.local.get(["totals", "session", "paused", "custom"]);
  return { totals, session, paused, custom };
}

// Credit the open session up to now, then start a new one on `siteId` (or none).
async function switchTo(siteId) {
  const s = await load();
  const now = Date.now();
  if (s.session) {
    const seconds = Math.min(MAX_GAP, (now - s.session.since) / 1000);
    addTime(s.totals, dayKey(now), s.session.siteId, Math.round(seconds));
    prune(s.totals);
  }
  const session = siteId && !s.paused ? { siteId, since: now } : null;
  await chrome.storage.local.set({ totals: s.totals, session });
}

// What the user is looking at right now, if it's a tracked site.
async function currentSite() {
  const { custom, paused } = await load();
  if (paused) return null;
  const state = await chrome.idle.queryState(IDLE_AFTER);
  if (state !== "active") return null;
  const win = await chrome.windows.getLastFocused().catch(() => null);
  if (!win?.focused) return null;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  // tab.url is only visible for sites this extension has host permission for.
  return siteFor(hostOf(tab?.url), withCustom(custom))?.id || null;
}

// Events arrive in bursts (focus + activate + update); run them one at a time
// so two can't credit the same session twice.
let queue = Promise.resolve();
const refresh = () => (queue = queue.then(async () => switchTo(await currentSite())).catch(() => {}));

chrome.idle.setDetectionInterval(IDLE_AFTER);
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onUpdated.addListener((_, change, tab) => { if (tab.active && (change.url || change.status === "complete")) refresh(); });
chrome.windows.onFocusChanged.addListener(refresh);
chrome.idle.onStateChanged.addListener(refresh);
chrome.storage.onChanged.addListener((change) => { if (change.paused || change.custom) refresh(); });

// A heartbeat keeps long sessions credited even when nothing else happens.
chrome.alarms.create("tick", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "tick") refresh(); });
chrome.runtime.onStartup.addListener(refresh);
chrome.runtime.onInstalled.addListener(refresh);
