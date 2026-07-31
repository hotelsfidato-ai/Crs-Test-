/* Rasterises selected PDF pages to PNG so the layout can be eyeballed.
   Rendering happens inside Chrome via pdf.js, so there is no native
   canvas dependency to build.

     node preview.mjs 1 2 3 20        # page numbers, 1-based
*/

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PDF = path.resolve(HERE, "../../docs/Fidato-Platform-Phase-1-Manual.pdf");
const OUT = path.join(HERE, "preview");

const pages = process.argv.slice(2).map(Number).filter(Boolean);
if (!pages.length) pages.push(1, 2, 3);

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

const pdfjs = await readFile(
  path.resolve(HERE, "node_modules/pdfjs-dist/build/pdf.min.mjs"),
  "utf8",
);
const worker = await readFile(
  path.resolve(HERE, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
  "utf8",
);
const data = await readFile(PDF);

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1400, deviceScaleFactor: 1 });
  page.on("console", (m) => m.type() === "error" && console.warn("  " + m.text()));

  await page.setContent(`<!doctype html><html><body style="margin:0">
    <canvas id="c"></canvas>
    <script type="module">
      ${pdfjs}
      const blob = new Blob([${JSON.stringify(worker)}], { type: "text/javascript" });
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
      window.__pdfjs = pdfjsLib;
    </script>
  </body></html>`);

  await page.waitForFunction("window.__pdfjs !== undefined", { timeout: 30_000 });

  const bytes = [...new Uint8Array(data)];
  await page.evaluate(async (b) => {
    window.__doc = await window.__pdfjs.getDocument({ data: new Uint8Array(b) }).promise;
  }, bytes);

  const total = await page.evaluate("window.__doc.numPages");
  console.log(`PDF has ${total} pages`);

  for (const n of pages) {
    if (n < 1 || n > total) {
      console.warn(`skip page ${n} — out of range`);
      continue;
    }
    const dims = await page.evaluate(async (pageNo) => {
      const p = await window.__doc.getPage(pageNo);
      const viewport = p.getViewport({ scale: 1.6 });
      const canvas = document.getElementById("c");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await p.render({ canvasContext: ctx, viewport }).promise;
      return { w: canvas.width, h: canvas.height };
    }, n);

    await page.setViewport({
      width: Math.ceil(dims.w),
      height: Math.ceil(dims.h),
      deviceScaleFactor: 1,
    });

    const el = await page.$("#c");
    const file = path.join(OUT, `page-${String(n).padStart(3, "0")}.png`);
    await el.screenshot({ path: file });
    console.log(`→ ${path.basename(file)}  ${dims.w}×${dims.h}`);
  }
} finally {
  await browser.close();
}
