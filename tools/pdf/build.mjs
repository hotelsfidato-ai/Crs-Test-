/* ══════════════════════════════════════════════════════════════════
   MANUAL → PDF

   Concatenates docs/manual/*.md into one print-ready document, renders
   the Mermaid diagrams in a real browser, and prints to PDF.

   Chrome is driven through puppeteer-core (no bundled Chromium — it
   uses the browser already installed on this machine).

     node build.mjs
   ══════════════════════════════════════════════════════════════════ */

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANUAL_DIR = path.resolve(HERE, "../../docs/manual");
const OUT_DIR = path.resolve(HERE, "../../docs");
const OUT_PDF = path.join(OUT_DIR, "Fidato-Platform-Phase-1-Manual.pdf");
const OUT_HTML = path.join(HERE, "manual.html");

/* Reading order. The appendices come last regardless of filename sort. */
const ORDER = [
  "01-system-overview.md",
  "02-architecture.md",
  "03-decision-log.md",
  "04-design-system.md",
  "05-component-reference.md",
  "06-data-model.md",
  "07-seed-engine.md",
  "08-repository-layer.md",
  "09-permissions-and-rules.md",
  "10-screen-teardown.md",
  "11-diagnostics.md",
  "12-defect-log.md",
  "13-verification-record.md",
  "14-phase-2-handover.md",
  "15-glossary.md",
  "A1-data-dictionary.md",
  "A2-component-props.md",
];

function findChrome() {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error("No Chrome or Edge installation found.");
  return found;
}

/* ── Markdown → HTML ───────────────────────────────────────────────
   Mermaid fences are passed through as <pre class="mermaid"> so the
   browser can render them. Everything else is normal markdown.      */

const marked = new Marked({ gfm: true, breaks: false });

marked.use({
  renderer: {
    code({ text, lang }) {
      if (lang === "mermaid") {
        return `<pre class="mermaid">${text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</pre>`;
      }
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<pre class="code"><code>${escaped}</code></pre>`;
    },
  },
});

/* Strips the navigation lines the web version uses — they are noise on paper. */
function stripNav(md) {
  return md
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (/^←\s*\[/.test(t)) return false;
      if (/^Next:\s*\[Volume/.test(t)) return false;
      if (/^\*End of manual\./.test(t)) return false;
      return true;
    })
    .join("\n")
    // Collapse the "---" that followed a stripped nav line
    .replace(/^\s*---\s*\n/, "");
}

/* Rewrites cross-document links to in-PDF anchors. */
function rewriteLinks(html, slugOf) {
  return html.replace(
    /href="((?:0[0-9]|1[0-9]|A[12])[A-Za-z0-9-]*\.md)(#([a-z0-9-]+))?"/g,
    (_m, file, _hash, anchor) => {
      const target = anchor ? `#${anchor}` : `#${slugOf(file)}`;
      return `href="${target}"`;
    },
  );
}

const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII","XIII","XIV","XV"];

async function main() {
  const present = new Set(await readdir(MANUAL_DIR));
  const files = ORDER.filter((f) => present.has(f));
  if (files.length !== ORDER.length) {
    const missing = ORDER.filter((f) => !present.has(f));
    console.warn(`⚠ Missing: ${missing.join(", ")}`);
  }

  const slugOf = (file) => `vol-${file.replace(/\.md$/, "")}`;

  const sections = [];
  for (const [i, file] of files.entries()) {
    const raw = await readFile(path.join(MANUAL_DIR, file), "utf8");
    const md = stripNav(raw);

    // First heading becomes the section title.
    const titleMatch = md.match(/^#\s+(.+)$/m);
    const rawTitle = titleMatch ? titleMatch[1].trim() : file;

    const isAppendix = file.startsWith("A");
    const label = isAppendix
      ? `Appendix ${file[1] === "1" ? "A" : "B"}`
      : `Volume ${ROMAN[i] ?? i + 1}`;

    // Strip the label from the title — the header renders it separately.
    const title = rawTitle
      .replace(/^Volume\s+[IVXLC]+\s+—\s+/, "")
      .replace(/^Appendix\s+[AB]\s+—\s+/, "");

    let html = await marked.parse(md.replace(/^#\s+.+$/m, ""));
    html = rewriteLinks(html, slugOf);

    sections.push({ file, id: slugOf(file), label, title, html });
  }

  const mermaidJs = await readFile(
    path.resolve(HERE, "node_modules/mermaid/dist/mermaid.min.js"),
    "utf8",
  );

  const toc = sections
    .map(
      (s) => `<li><a href="#${s.id}">
        <span class="toc-label">${s.label}</span>
        <span class="toc-title">${s.title}</span>
      </a></li>`,
    )
    .join("\n");

  const body = sections
    .map(
      (s) => `<section class="volume" id="${s.id}">
  <header class="volume-head">
    <p class="volume-label">${s.label}</p>
    <h1 class="volume-title">${s.title}</h1>
  </header>
  ${s.html}
</section>`,
    )
    .join("\n");

  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Fidato Hospitality Platform — Phase 1 Service Manual</title>
<style>${await readFile(path.join(HERE, "print.css"), "utf8")}</style>
</head>
<body>

<section class="cover">
  <div class="cover-mark"></div>
  <p class="cover-brand">Fidato Hotels</p>
  <h1>Hospitality Platform</h1>
  <p class="cover-sub">Phase 1 Service Manual</p>
  <div class="cover-rule"></div>
  <dl class="cover-meta">
    <dt>Build</dt><dd>Phase 1 — frontend, no backend, no authentication</dd>
    <dt>Date of record</dt><dd>29 July 2026</dd>
    <dt>Contents</dt><dd>15 volumes · 2 appendices</dd>
    <dt>Audience</dt><dd>Engineers, designers and reviewers joining the project</dd>
  </dl>
  <p class="cover-note">Internal document. Commercial figures in this manual are simulated.</p>
</section>

<section class="front">
  <h1>Before you start</h1>

  <p class="lead">This manual describes a system that exists and runs. Everything in it can be
  opened, clicked and checked against the code. If a statement here disagrees with the running
  application, the application is right and this manual has a bug — please report it.</p>

  <h2>What you are looking at</h2>
  <p>Fidato Hotels sells room nights into <strong>32 partner properties it does not own</strong>.
  This platform is the system that runs that business: the CRM, the reservations, the money and
  the reporting. It is not a property management system — each partner hotel already has one of
  those.</p>
  <p>That one fact explains a surprising number of decisions in this manual, so it is worth
  holding on to.</p>

  <h2>Phase 1 is the frontend only</h2>
  <p>There is <strong>no backend and no login</strong>. Every screen is finished and every
  interaction works, but the data comes from a simulation running in the browser rather than a
  database. This was deliberate: it lets the shape of the product be settled before any backend
  work is committed to. Volume I explains the reasoning; Volume III argues it against the
  alternatives.</p>
  <p>Two consequences you will notice immediately:</p>
  <ul>
    <li><strong>Data resets when you refresh.</strong> By design — every review starts from
    identical data.</li>
    <li><strong>There is no sign-in.</strong> Instead, a <em>"Viewing as…"</em> switcher in the
    top bar lets you become any of the eight roles in one second. Use it constantly; it is the
    fastest way to understand the product.</li>
  </ul>

  <h2>How this manual is written</h2>
  <p>It is written the way a service manual for an engine is written, not the way a product tour
  is written:</p>
  <ul>
    <li><strong>Every part is described on its own</strong> — inputs, outputs, failure modes —
    before it is described in context.</li>
    <li><strong>Every decision carries the options that lost.</strong> A decision without the
    roads not taken is just an assertion. Volume III is nothing but decisions and reasoning.</li>
    <li><strong>Diagnostics are organised by symptom</strong>, because when something is wrong
    you do not yet know which part it is.</li>
    <li><strong>The code is real.</strong> Every listing is quoted from the running source at the
    path given above it.</li>
  </ul>

  <h2>If you are new, read in this order</h2>
  <table class="reading-paths">
    <thead><tr><th>Day</th><th>Read</th><th>Then do this</th></tr></thead>
    <tbody>
      <tr><td>1</td><td>Volumes I and II</td><td>Run the app. Switch between all eight roles and notice what changes.</td></tr>
      <tr><td>2</td><td>Volume X, skimming</td><td>Open every screen it describes, in order. Do not read the code yet.</td></tr>
      <tr><td>3</td><td>Volumes IV and V</td><td>Open <code>/design-system</code> in the app and match it against the volume.</td></tr>
      <tr><td>4</td><td>Volume IX</td><td>Open <code>/admin/roles</code>. Then try to edit a rate plan as a Hotel Manager.</td></tr>
      <tr><td>5</td><td>Volumes VI, VII, VIII</td><td>Follow one query from a screen down to the store and back.</td></tr>
      <tr><td>6</td><td><strong>Volume XII</strong></td><td>The nine defects. This is the most instructive volume in the manual.</td></tr>
    </tbody>
  </table>
  <p>Volumes XI (diagnostics), XIII (what was tested), XIV (Phase 2) and the two appendices are
  reference. Read them when you need them, not front to back.</p>

  <h2>Conventions</h2>
  <table class="conventions">
    <tbody>
      <tr><td><code>src/path/file.ts</code></td><td>A real file in the repository</td></tr>
      <tr><td><strong>BR-01</strong></td><td>A numbered business rule — Volume IX</td></tr>
      <tr><td><strong>ADR-01</strong></td><td>A numbered decision — Volume III</td></tr>
      <tr><td><strong>D-01</strong></td><td>A numbered defect — Volume XII</td></tr>
      <tr><td>⚠️</td><td>A trap: something that looks correct and is not</td></tr>
      <tr><td>🔧</td><td>Something that must change in Phase 2</td></tr>
    </tbody>
  </table>

  <h2>Two honest warnings</h2>
  <p><strong>Twelve interactive flows were never click-tested.</strong> The reservation wizard
  end-to-end, the approve and cancel dialogs, the merge action and the import commit are built and
  typechecked, but the automated browser used for verification could not deliver real input
  events. Volume XIII, section 13.4 lists exactly what this leaves unproven. Do not read the rest
  of this manual as claiming otherwise.</p>
  <p><strong>There is no test suite.</strong> Volume III, ADR-24 explains why, and says plainly
  that it is the weakest decision in the log. If you are joining to work on Phase 2, writing tests
  over the rules layer is the first task and it is already scoped in Volume XIV.</p>
</section>

<section class="toc">
  <h1>Contents</h1>
  <ol class="toc-list">
${toc}
  </ol>
</section>

${body}

<pre class="mermaid-ready" hidden></pre>

<script>${mermaidJs}</script>
<script>
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    themeVariables: {
      fontFamily: "Inter, Segoe UI, sans-serif",
      fontSize: "13px",
      primaryColor: "#fdf1eb",
      primaryTextColor: "#031728",
      primaryBorderColor: "#df6128",
      lineColor: "#67737e",
      secondaryColor: "#eaf4f1",
      tertiaryColor: "#f7f8f9",
      background: "#ffffff",
      mainBkg: "#fdf1eb",
      nodeBorder: "#df6128",
      clusterBkg: "#f7f8f9",
      clusterBorder: "#ccd0d4",
      titleColor: "#031728",
      edgeLabelBackground: "#ffffff",
      /* Timeline and pie charts use their own scale, which otherwise
         ignores the palette above. */
      cScale0: "#fdf1eb", cScaleLabel0: "#031728",
      cScale1: "#eaf4f1", cScaleLabel1: "#031728",
      cScale2: "#ebf2f9", cScaleLabel2: "#031728",
      cScale3: "#fff8e6", cScaleLabel3: "#031728",
      pie1: "#df6128", pie2: "#eb8c00", pie3: "#ffb600",
      pie4: "#1f6f5c", pie5: "#2b6cb0", pie6: "#db536a",
    },
    flowchart: { curve: "basis", useMaxWidth: true },
    sequence: { useMaxWidth: true, mirrorActors: false },
    er: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
  });

  window.__mermaidDone = (async () => {
    const blocks = [...document.querySelectorAll("pre.mermaid")];
    let ok = 0, failed = 0;
    for (const [i, el] of blocks.entries()) {
      const src = el.textContent;
      try {
        const { svg } = await mermaid.render("mmd-" + i, src);
        const wrap = document.createElement("figure");
        wrap.className = "diagram";
        wrap.innerHTML = svg;
        el.replaceWith(wrap);
        ok++;
      } catch (err) {
        el.className = "code diagram-failed";
        el.textContent = src;
        failed++;
        console.error("Mermaid failed on block " + i + ": " + err.message);
      }
    }
    return { ok, failed, total: blocks.length };
  })();
</script>
</body>
</html>`;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_HTML, doc, "utf8");
  console.log(`→ HTML written (${(doc.length / 1024 / 1024).toFixed(1)} MB)`);

  /* ── Print ───────────────────────────────────────────────────── */

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
  });

  try {
    const page = await browser.newPage();
    page.on("console", (m) => {
      if (m.type() === "error") console.warn(`  browser: ${m.text()}`);
    });

    await page.goto(`file:///${OUT_HTML.replace(/\\/g, "/")}`, {
      waitUntil: "load",
      timeout: 120_000,
    });

    const stats = await page.evaluate(() => window.__mermaidDone);
    console.log(`→ diagrams rendered: ${stats.ok}/${stats.total}${stats.failed ? ` (${stats.failed} FAILED)` : ""}`);

    await page.emulateMediaType("print");

    await page.pdf({
      path: OUT_PDF,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
      headerTemplate: `
        <div style="font:9px Inter,'Segoe UI',sans-serif;color:#9aa2a9;width:100%;
                    padding:0 16mm;display:flex;justify-content:space-between;">
          <span>Fidato Hospitality Platform — Phase 1 Service Manual</span>
          <span>Internal</span>
        </div>`,
      footerTemplate: `
        <div style="font:9px Inter,'Segoe UI',sans-serif;color:#9aa2a9;width:100%;
                    padding:0 16mm;display:flex;justify-content:space-between;">
          <span>29 July 2026</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`,
      timeout: 180_000,
    });

    console.log(`✓ ${OUT_PDF}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
