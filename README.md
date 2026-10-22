# Årshjul

A single-page **A4 landscape** year planner in Typst:

- **Left:** January–June, with event titles, dates and descriptions.
- **Middle:** a clockwise, twelve-sector year wheel with event titles.
- **Right:** July–December, with event titles, dates and descriptions.

## Web editor

The Danish web editor is entirely static: no backend, npm install, or build step. It provides:

- Document settings and per-month event forms, plus a raw JSON editor.
- Automatic (debounced) or manual PDF recompilation in a Web Worker.
- An embedded PDF preview and downloadable PDF/JSON files.
- JSON import, browser-local draft recovery, validation, and compiler diagnostics.

Run locally with Node.js (22 or newer):

```sh
node serve.mjs
```

Open **http://127.0.0.1:8080**. `PORT=3000 node serve.mjs` changes the port. Any other static HTTP server also works. Do not open `index.html` via `file://`: module workers and fetches need HTTP or HTTPS. `nix develop` includes Node.js and Typst.

### GitHub Pages

Commit the files, then select **Settings → Pages → Deploy from a branch**, choose your branch, and use **/ (root)**. No Actions workflow is needed. `.nojekyll` disables Jekyll processing. All local URLs are relative, so both `username.github.io/` and `username.github.io/repository/` work.

The public application files are `index.html`, `style.css`, `app.mjs`, `config.mjs`, `compiler-worker.mjs`, `arshjul.typ`, `example.json`, `.nojekyll`, and `fonts/` (including its license). No precompiled PDF is needed. Node.js is only a local development/test tool, not a deployment requirement.

### Dependencies and privacy

The **only runtime library** is `@myriaddreamin/typst-ts-web-compiler`, pinned to **0.7.0**, loaded as JavaScript/WebAssembly from jsDelivr. No UI framework, PDF renderer, or bundler is used. The browser's native PDF viewer displays the result; downloading also works if embedded viewing is unavailable. An up-to-date browser with module-worker and WebAssembly support is required. First compilation downloads the compiler and may take longer; later compilations reuse the worker and compiler caches.

The existing `arshjul.typ` is compiled directly, with JSON passed through `sys.inputs.data`. DejaVu Sans regular/bold are self-hosted in `fonts/` to match the command-line layout. Browser and CLI compiler versions may differ, so output is not promised to be byte-identical.

Your JSON and generated PDFs **are not uploaded**. The CDN receives requests for compiler assets only. Draft JSON is stored in this site's `localStorage`; use JSON export for a durable backup. This is not a guaranteed offline app. To self-host the compiler too, download the pinned package's two files (`typst_ts_web_compiler.mjs` and `typst_ts_web_compiler_bg.wasm`) and change `PACKAGE` in `compiler-worker.mjs` to their directory URL (e.g. `new URL("./vendor/typst/", import.meta.url).href`). Serve WASM as `application/wasm`.

The web editor accepts years 1–9999 and quarter colors in `#RRGGBB` notation; CLI Typst accepts additional color/year representations.

## Command-line template

Requires Typst (tested with 0.15.1). No external Typst packages are required.

## Compile

From this directory, using the included example:

```sh
typst compile arshjul.typ arshjul.pdf
```

Use your own JSON file (path relative to `arshjul.typ`, inside the Typst project root):

```sh
typst compile --input data-file=plan.json arshjul.typ arshjul.pdf
```

Or supply JSON from stdin, without needing to put the input file inside the project:

```sh
cat /path/to/plan.json | typst compile --input "data=$(cat)" arshjul.typ arshjul.pdf
```

The inline `data` input takes precedence over `data-file`. These are Typst compile-time inputs; the JSON is treated as data, not Typst markup.

## JSON format

```json
{
  "title": "Årshjul",
  "year": 2027,
  "events": [
    {
      "month": 1,
      "title": "Kick-off",
      "date": "12 Jan",
      "description": "Agree on goals, responsibilities and priorities."
    },
    { "month": 1, "title": "Workshop", "description": "Review the roadmap." }
  ]
}
```

All top-level fields are optional. Defaults: `Årshjul`, current year, Danish month names, no events. There is no subtitle. The footer always shows the current compilation date as `DD.MM.YYYY`; legacy JSON `subtitle` and `footer` values are ignored. Each event requires an integer `month` (1–12) and a nonempty `title`; `date` and `description` are optional strings. Multiple events per month appear in input order. Dates are display labels, not parsed calendar dates.

Optional customization:

- `months`: exactly twelve nonempty month-name strings, January first.
- `colors`: four color strings, one per quarter, e.g. `["#527C96", "#588570", "#B78743", "#966476"]`.

Descriptions stay in the side columns; only titles appear in the wheel. Text shrinks modestly to accommodate longer content. If a month still cannot fit legibly, compilation fails with the month's name instead of silently clipping text. Keep wheel titles short and descriptions concise: this is a one-page overview, not an unlimited calendar. The fixed-height header is intended for a short, single-line title.

## Checks

```sh
bash test_render.sh
node test_config.mjs
```

The real-browser smoke test uses Node's built-in WebSocket client and Chromium (no npm dependencies). It compiles with the actual WASM compiler, checks form/JSON synchronization, automatic/manual recompilation, invalid-input recovery, draft persistence, mobile width, and a `/hjul/` project-site URL:

```sh
nix shell nixpkgs#nodejs nixpkgs#chromium --command node test_web.mjs
```

Or run `node test_web.mjs` with Chromium on `PATH` (set `CHROMIUM=/path/to/chromium` if needed). The test needs internet access for jsDelivr. `SCREENSHOT=/path/to/screenshot.png` optionally saves desktop and `screenshot-mobile.png` screenshots.
