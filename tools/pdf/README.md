# Manual → PDF build

Turns `docs/manual/*.md` into a single print-ready PDF at
`docs/Fidato-Platform-Phase-1-Manual.pdf`.

```bash
cd "D:\fidato crs\tools\pdf"
npm install        # first time only — run from PowerShell
npm run build
```

## What it does

1. Concatenates the 17 manual files in reading order (volumes, then appendices).
2. Strips the web-only navigation lines and rewrites cross-document links into in-PDF anchors.
3. Adds a cover, a "Before you start" orientation section written for new joiners, and a table
   of contents.
4. **Renders every Mermaid diagram in a real browser** — this is why the build needs Chrome.
5. Prints to A4 with running headers, footers and page numbers.

## Requirements

- Node 18+
- Chrome or Edge installed. The build uses `puppeteer-core`, which drives the browser already
  on the machine rather than downloading its own Chromium.

`build.mjs` looks for Chrome in the usual Windows locations, then falls back to Edge. Add a path
to `findChrome()` if yours is elsewhere.

## Checking the output

```bash
node preview.mjs 1 6 42        # rasterise those pages to preview/*.png
```

Useful for confirming that a diagram fits on the page or that a wide table has not clipped,
without opening the PDF.

## Editing the manual

Edit the markdown in `docs/manual/`, then re-run `npm run build`. Nothing else needs changing —
new files must be added to the `ORDER` array in `build.mjs`.

## Gotchas

**Semicolons in Mermaid.** A `;` inside a sequence-diagram message is treated as a statement
separator and breaks the parse. Use an em dash instead. The build reports
`diagrams rendered: N/M` — if those numbers differ, a diagram failed and has been rendered as
plain text with a red left border so it is visible in the PDF.

**Tall diagrams.** Diagrams use `page-break-inside: avoid`, so one that will not fit is pushed
to the next page, sometimes leaving white space. That is deliberate: half a diagram is worse
than a short page.

**Fonts.** The PDF uses whatever Inter/Segoe UI the printing machine has. Output is
deterministic on this machine; on another, metrics may shift slightly and the page count can
move by one or two.

## Files

| File | Purpose |
|---|---|
| `build.mjs` | The build — concatenate, render diagrams, print |
| `print.css` | Print stylesheet: A4 page setup, typography, page-break rules |
| `preview.mjs` | Rasterises chosen pages to PNG for checking |
| `manual.html` | Intermediate output. Open in a browser to debug layout |
| `.npmrc` + `win-ca-bundle.pem` | TLS trust for this machine's proxy |
