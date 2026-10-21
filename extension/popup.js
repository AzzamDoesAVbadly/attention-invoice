import { withCustom, weekOf, invoice, drawReceipt, formatDuration } from "./receipt.js";

const $ = (s) => document.querySelector(s);
const canvas = $("[data-receipt]");
let offset = 0;
let current = null;

async function render() {
  const { totals = {}, session = null, paused = false, custom = [] } = await chrome.storage.local.get(["totals", "session", "paused", "custom"]);
  const sites = withCustom(custom);
  current = invoice(totals, weekOf(new Date(), offset), sites);
  drawReceipt(canvas, current);

  const now = $("[data-now]");
  const site = session && sites.find((s) => s.id === session.siteId);
  now.classList.toggle("live", Boolean(site));
  now.textContent = paused
    ? "Billing paused. The algorithm is concerned about you."
    : site
      ? `● Billing ${site.name} now (${formatDuration((Date.now() - session.since) / 1000)} since last tick)`
      : "Not billing right now. Enjoy it.";
  $("[data-pause]").textContent = paused ? "Resume billing" : "Pause billing";

  $("[data-custom]").replaceChildren(
    ...custom.map((d) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "×";
      btn.setAttribute("aria-label", `Stop tracking ${d}`);
      btn.addEventListener("click", async () => {
        await chrome.storage.local.set({ custom: custom.filter((x) => x !== d) });
        chrome.permissions.remove({ origins: [`*://*.${d}/*`] }).catch(() => {});
        render();
      });
      li.append(d, btn);
      return li;
    }),
  );
}

document.querySelectorAll("[data-week]").forEach((btn) =>
  btn.addEventListener("click", () => {
    offset = Number(btn.dataset.week);
    document.querySelectorAll("[data-week]").forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
    render();
  }),
);

$("[data-pause]").addEventListener("click", async () => {
  const { paused = false } = await chrome.storage.local.get("paused");
  await chrome.storage.local.set({ paused: !paused });
  render();
});

$("[data-download]").addEventListener("click", () => {
  canvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attention-invoice-${current.start}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
});

$("[data-add]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = e.target.domain;
  const domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
    input.setCustomValidity("Enter a domain like example.com");
    input.reportValidity();
    return;
  }
  input.setCustomValidity("");
  // Must be requested straight from the click, before any other await.
  const granted = await chrome.permissions.request({ origins: [`*://*.${domain}/*`] });
  if (!granted) return;
  const { custom = [] } = await chrome.storage.local.get("custom");
  if (!custom.includes(domain)) await chrome.storage.local.set({ custom: [...custom, domain] });
  input.value = "";
  render();
});

chrome.storage.onChanged.addListener(render);
render();
