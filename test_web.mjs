// Real-browser smoke tests using Node's built-in WebSocket and Chromium's CDP.
// No npm dependencies. Run with Chromium on PATH (or set CHROMIUM).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createStaticServer } from "./serve.mjs";
import { createServer } from "node:http";

const profile = await mkdtemp(join(tmpdir(), "arshjul-browser-"));
const assets = createStaticServer("/hjul/"); // Exercise GitHub Pages project paths.
const originalTemplate = await readFile(new URL("./arshjul.typ", import.meta.url), "utf8");
let template = originalTemplate;
const templateRequests = [];
const server = createServer((request, response) => {
  if (new URL(request.url, "http://localhost").pathname === "/hjul/arshjul.typ") {
    templateRequests.push(request.url);
    // Deliberately cacheable: fresh template URLs must defeat stale worker caches.
    response.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "public, max-age=86400" });
    response.end(template);
  } else {
    assets.emit("request", request, response);
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/hjul/`;
const browser = spawn(process.env.CHROMIUM ?? "chromium", ["--headless", "--no-sandbox", "--disable-gpu", "--no-first-run", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
let socket;
let nextID = 0;
const pending = new Map();
let sessionId;
const exceptions = [];

try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Chromium did not start: " + output)), 15000);
    browser.on("error", reject);
    browser.stderr.on("data", chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const callback = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
      else callback.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails);
    if (message.method === "Page.javascriptDialogOpening") command("Page.handleJavaScriptDialog", { accept: true });
  };
  function command(method, params = {}, session = sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++nextID;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
    });
  }
  async function evaluate(expression) {
    const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function until(expression, timeout = 120000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(`Timed out: ${expression}\n` + await evaluate('document.getElementById("status").textContent + "\\n" + document.getElementById("error").textContent'));
  }
  async function editJSON(source) {
    await evaluate(`document.getElementById('json-tab').click(); document.getElementById('json').value = ${JSON.stringify(source)}; document.getElementById('json').dispatchEvent(new Event('input', { bubbles: true }));`);
  }
  const target = await command("Target.createTarget", { url: "about:blank" }, undefined);
  ({ sessionId } = await command("Target.attachToTarget", { targetId: target.targetId, flatten: true }, undefined));
  await command("Runtime.enable");
  await command("Page.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command("Page.navigate", { url: base });
  await until('document.getElementById("download")?.getAttribute("aria-disabled") === "false"');
  const signature = await evaluate('(async () => new TextDecoder().decode((await (await fetch(document.getElementById("download").href)).arrayBuffer()).slice(0, 5)))()');
  assert.equal(signature, "%PDF-");
  if (process.env.PDF_OUTPUT) {
    const base64 = await evaluate('(async () => btoa(Array.from(new Uint8Array(await (await fetch(document.getElementById("download").href)).arrayBuffer()), byte => String.fromCharCode(byte)).join("")))()');
    await writeFile(process.env.PDF_OUTPUT, Buffer.from(base64, "base64"));
  }
  assert.equal(await evaluate('document.getElementById("error").textContent'), "");
  assert.equal(await evaluate('document.getElementById("subtitle") === null && document.getElementById("footer") === null'), true);
  assert.equal(await evaluate('/\\bJSON\\b/.test(document.body.innerText)'), false);
  assert.equal(await evaluate('[...document.getElementById("months").children].every(month => month.open)'), true);
  console.log("PASS: Real WASM compilation and downloadable PDF under /hjul/.");
  if (process.env.SCREENSHOT) {
    await delay(5000); // Let the browser's asynchronous native PDF viewer paint.
    const image = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(process.env.SCREENSHOT, Buffer.from(image.data, "base64"));
  }

  await evaluate(`document.getElementById('auto').click(); document.getElementById('months').children[0].open = true;`);
  template = '#panic("template-update-check")';
  await evaluate('document.getElementById("compile").click()');
  await until('document.getElementById("error").textContent.includes("template-update-check")');
  template = originalTemplate;
  await evaluate('document.getElementById("compile").click()');
  await until('document.getElementById("download").getAttribute("aria-disabled") === "false"');
  assert.equal(templateRequests.length, 3);
  assert.equal(new Set(templateRequests).size, 3);
  console.log("PASS: Template updates bypass warm browser/worker caches without reloading the page.");
  await evaluate('document.getElementById("months").children[1].open = false; document.getElementById("json-tab").click(); document.getElementById("form-tab").click()');
  assert.equal(await evaluate('document.getElementById("months").children[1].open'), false);
  // Two edits to the same field catch stale references after JSON validation.
  for (const title of ["Ændring", "Dansk æøå"]) {
    await evaluate(`{ const input = document.querySelector('[data-key="title"]'); input.value = ${JSON.stringify(title)}; input.dispatchEvent(new Event('input', { bubbles: true })); }`);
  }
  assert.equal(await evaluate('JSON.parse(document.getElementById("json").value).events[0].title'), "Dansk æøå");
  assert.equal(await evaluate('document.getElementById("download").getAttribute("aria-disabled")'), "true");
  await evaluate('document.getElementById("compile").click()');
  await until('document.getElementById("download").getAttribute("aria-disabled") === "false"');
  console.log("PASS: Form edits synchronize JSON; manual recompilation updates the PDF.");

  await evaluate('document.getElementById("example").click()');
  await until('document.getElementById("example").disabled === false && document.getElementById("download").getAttribute("aria-disabled") === "false"');
  assert.deepEqual(await evaluate('JSON.parse(document.getElementById("json").value)'), JSON.parse(await readFile(new URL("./example.json", import.meta.url), "utf8")));
  console.log("PASS: Reset restores example.json and recompiles even with automatic updates off.");

  await evaluate(`window.__originalFetch = window.fetch;
    window.__exampleRequests = [];
    window.__exampleStatus = 200;
    window.fetch = (url, options) => {
      if (new URL(url).pathname.endsWith('/example.json')) {
        window.__exampleRequests.push(options?.cache);
        return Promise.resolve(new Response('{"title":"Opdateret eksempel","year":2042,"events":[]}', { status: window.__exampleStatus }));
      }
      return window.__originalFetch(url, options);
    };
    document.getElementById('example').click();`);
  await until('document.getElementById("example").disabled === false && document.getElementById("download").getAttribute("aria-disabled") === "false"');
  assert.equal(await evaluate('JSON.parse(document.getElementById("json").value).title'), "Opdateret eksempel");
  assert.deepEqual(await evaluate('window.__exampleRequests'), ["no-cache"]);
  assert.equal(await evaluate('localStorage.getItem("arshjul.draft.v1:/hjul/")'), null);
  await evaluate('window.__exampleStatus = 503; document.getElementById("example").click()');
  await until('document.getElementById("example").disabled === false && document.getElementById("error").textContent.includes("503")');
  assert.equal(await evaluate('JSON.parse(document.getElementById("json").value).title'), "Opdateret eksempel");
  await evaluate('window.fetch = window.__originalFetch');
  console.log("PASS: Reset revalidates the latest example, clears stale defaults, and preserves data on network failure.");

  const oldHref = await evaluate('document.getElementById("download").href');
  await evaluate('document.getElementById("compile").click(); document.getElementById("title").value = "Nyere ændring"; document.getElementById("title").dispatchEvent(new Event("input"))');
  await until('document.getElementById("compile").disabled === false');
  assert.equal(await evaluate('document.getElementById("download").getAttribute("aria-disabled")'), "true");
  assert.equal(await evaluate('document.getElementById("download").href'), oldHref);
  console.log("PASS: Stale compiler responses cannot overwrite newer edits.");

  await editJSON('{"title":"Brugerdata","custom":{"keep":true},"events":[{"month":1,"title":"Møde","extra":7}]}');
  await evaluate('document.getElementById("form-tab").click(); document.getElementById("title").value = "Ny titel"; document.getElementById("title").dispatchEvent(new Event("input"))');
  assert.equal(await evaluate('JSON.parse(document.getElementById("json").value).custom.keep'), true);
  assert.equal(await evaluate('JSON.parse(document.getElementById("json").value).events[0].extra'), 7);
  await evaluate('document.querySelector(".add-event").click()');
  assert.equal(await evaluate('JSON.parse(document.getElementById("json").value).events.length'), 2);
  await evaluate('document.querySelector(".remove-event").click()');
  assert.equal(await evaluate('JSON.parse(document.getElementById("json").value).events.length'), 1);
  console.log("PASS: Add/remove activities and preserve unknown JSON fields.");

  const importPath = join(profile, "import.json");
  await writeFile(importPath, '{"year":2040,"title":"Importeret","events":[]}');
  await command("DOM.enable");
  const document = await command("DOM.getDocument");
  const fileInput = await command("DOM.querySelector", { nodeId: document.root.nodeId, selector: "#file" });
  await command("DOM.setFileInputFiles", { nodeId: fileInput.nodeId, files: [importPath] });
  await until('document.getElementById("title").value === "Importeret"');
  await command("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: profile }, undefined);
  await evaluate('document.getElementById("export").click()');
  let exported;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { exported = JSON.parse(await readFile(join(profile, "arshjul.json"), "utf8")); break; }
    catch { await delay(100); }
  }
  assert.deepEqual(exported, { year: 2040, title: "Importeret", events: [] });
  await writeFile(importPath, "{");
  await command("DOM.setFileInputFiles", { nodeId: fileInput.nodeId, files: [importPath] });
  await until('document.getElementById("error").hidden === false');
  assert.equal(await evaluate('JSON.parse(document.getElementById("json").value).title'), "Importeret");
  console.log("PASS: JSON file import/export; invalid imports preserve the current draft.");

  await editJSON("{");
  assert.equal(await evaluate('document.getElementById("compile").disabled'), true);
  assert.equal(await evaluate('document.getElementById("json").getAttribute("aria-invalid")'), "true");
  await evaluate('window.__beforeReload = true');
  await command("Page.reload");
  await until('window.__beforeReload === undefined && document.getElementById("json")?.disabled === false');
  assert.equal(await evaluate('document.getElementById("json").value'), "{");
  assert.equal(await evaluate('document.getElementById("json-panel").hidden'), false);
  console.log("PASS: Invalid JSON is reported and drafts survive reloads.");

  await editJSON('{"events":[{"month":1,"title":"ThisTitleIsFarTooLongToFitInOneYearWheelSectorEvenAtTheMinimumFontSize"}]}');
  await until('document.getElementById("error").textContent.includes("too long for A4")');
  assert.equal(await evaluate('document.getElementById("download").getAttribute("aria-disabled")'), "true");
  await editJSON('{"year":2035,"events":[]}');
  await until('document.getElementById("download").getAttribute("aria-disabled") === "false"');
  assert.equal(await evaluate('document.getElementById("download").download'), "arshjul-2035.pdf");
  console.log("PASS: Compiler diagnostics, automatic recompilation, and recovery after errors.");

  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  await evaluate('document.getElementById("form-tab").click()');
  if (process.env.SCREENSHOT) {
    await evaluate('document.getElementById("example").click()');
    await until('document.getElementById("example").disabled === false && document.getElementById("download").getAttribute("aria-disabled") === "false"');
    await delay(5000);
    const image = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile(process.env.SCREENSHOT.replace(/\.png$/, "") + "-mobile.png", Buffer.from(image.data, "base64"));
  }
  assert.deepEqual(exceptions, []);
  console.log("PASS: Mobile layout and no uncaught browser errors.");
} finally {
  socket?.close();
  browser.kill();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => { if (browser.exitCode !== null || browser.signalCode !== null) resolve(); else browser.once("exit", resolve); });
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
