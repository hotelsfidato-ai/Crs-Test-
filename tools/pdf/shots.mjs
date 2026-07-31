/* Captures full-resolution screenshots of the running dev server.

     node shots.mjs                 # default set
     node shots.mjs /reports/revenue

   Requires `npm run dev` to be running on 127.0.0.1:5173.
*/

import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "shots");
const BASE = "http://127.0.0.1:5173";

/** [route, filename, role] — role is written to the session store before load. */
const DEFAULT_SHOTS = [
  ["/dashboard", "01-dashboard-sales-manager", "sales_manager"],
  ["/dashboard", "02-dashboard-hotel-manager", "hotel_manager"],
  ["/reservations", "03-reservations-list", "sales_manager"],
  ["/reservations/calendar", "04-calendar", "sales_manager"],
  ["/reservations/approvals", "05-approvals", "sales_manager"],
  ["/crm/customers", "06-customers", "sales_manager"],
  ["/crm/merge", "07-duplicate-merge", "admin"],
  ["/hotels", "08-properties", "sales_manager"],
  ["/reports/occupancy", "09-report-occupancy", "super_admin"],
  ["/admin/roles", "10-permission-matrix", "super_admin"],
  ["/design-system", "11-design-system", "super_admin"],
];

function findChrome() {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error("No Chrome or Edge found.");
  return found;
}

const custom = process.argv.slice(2);
const shots = custom.length
  ? custom.map((r, i) => [r, `custom-${i + 1}${r.replace(/\W+/g, "-")}`, "super_admin"])
  : DEFAULT_SHOTS;

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  // Seed the session store before the app boots.
  await page.goto(BASE, { waitUntil: "domcontentloaded" });

  for (const [route, name, role] of shots) {
    await page.evaluate((r) => {
      localStorage.setItem("fidato.session", JSON.stringify({ state: { role: r }, version: 0 }));
      localStorage.setItem(
        "fidato.ui",
        JSON.stringify({ state: { sidebarCollapsed: false }, version: 0 }),
      );
    }, role);

    await page.goto(BASE + route, { waitUntil: "networkidle0", timeout: 60_000 });
    // The mock repositories resolve after 120–400 ms, then charts animate.
    await new Promise((r) => setTimeout(r, 1400));

    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(`→ ${path.basename(file)}   ${route}  (${role})`);
  }
} finally {
  await browser.close();
}
