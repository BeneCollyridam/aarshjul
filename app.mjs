import { MONTHS, parseConfig, compilerData } from "./config.mjs";

const $ = id => document.getElementById(id);
const STORAGE_KEY = "arshjul.draft.v1:" + new URL("./", import.meta.url).pathname;
let data = {};
let example;
let revision = 0;
let worker;
let busy = false;
let queued = false;
let debounce;
let timeout;
let pdfURL;
let valid = false;

function status(message) { $("status").textContent = message; }
function error(message = "") {
  $("error").textContent = message;
  $("error").hidden = !message;
}
function downloadEnabled(enabled) {
  $("download").setAttribute("aria-disabled", String(!enabled));
  $("download").tabIndex = enabled ? 0 : -1;
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, $("json").value); }
  catch { $("storage").textContent = "Browseren kan ikke gemme kladden. Brug »Gem fil« for at beholde en kopi."; }
}
function validate() {
  try {
    data = parseConfig($("json").value);
    valid = true;
    $("json").setAttribute("aria-invalid", "false");
    error();
  } catch (exception) {
    valid = false;
    $("json").setAttribute("aria-invalid", "true");
    error(exception.message);
  }
  $("compile").disabled = busy || !valid;
  $("export").disabled = !valid;
  return valid;
}
function changed() {
  revision++;
  persist();
  downloadEnabled(false);
  status(pdfURL ? "Ændringer er ikke med i den viste PDF endnu." : "Klar til at kompilere.");
  clearTimeout(debounce);
  if (validate() && $("auto").checked) debounce = setTimeout(compile, 650);
}
function fromForm() {
  $("json").value = JSON.stringify(data, null, 2);
  changed();
}

function renderForm() {
  for (const key of ["title", "year"]) {
    $(key).value = data[key] ?? (key === "year" ? new Date().getFullYear() : key === "title" ? "Årshjul" : "");
  }
  const expanded = new Map([...$("months").children].map(element => [element.dataset.month, element.open]));
  $("months").replaceChildren();
  (data.months ?? MONTHS).forEach((name, index) => {
    const month = $("month-template").content.firstElementChild.cloneNode(true);
    month.dataset.month = String(index + 1);
    month.open = expanded.get(String(index + 1)) ?? true;
    month.querySelector(".month-name").textContent = name;
    const entries = (data.events ?? []).map((event, eventIndex) => ({ event, eventIndex })).filter(({ event }) => event.month === index + 1);
    month.querySelector(".event-count").textContent = `${entries.length} ${entries.length === 1 ? "aktivitet" : "aktiviteter"}`;
    for (const { event, eventIndex } of entries) {
      const card = $("event-template").content.firstElementChild.cloneNode(true);
      for (const input of card.querySelectorAll("[data-key]")) {
        input.value = event[input.dataset.key] ?? "";
        input.addEventListener("input", () => { data.events[eventIndex][input.dataset.key] = input.value; fromForm(); });
      }
      card.querySelector(".remove-event").setAttribute("aria-label", `Fjern aktivitet i ${name}`);
      card.querySelector(".remove-event").addEventListener("click", () => {
        data.events.splice(eventIndex, 1);
        fromForm();
        renderForm();
        $("months").children[index].querySelector(".add-event").focus();
      });
      month.querySelector(".event-list").append(card);
    }
    month.querySelector(".add-event").addEventListener("click", () => {
      (data.events ??= []).push({ month: index + 1, title: "Ny aktivitet", description: "" });
      month.open = true;
      fromForm();
      renderForm();
      const inputs = $("months").children[index].querySelectorAll('[data-key="title"]');
      inputs[inputs.length - 1].focus();
      inputs[inputs.length - 1].select();
    });
    $("months").append(month);
  });
}

function tab(name) {
  if (name === "form" && !validate()) { $("json").focus(); return; }
  if (name === "form") renderForm();
  for (const key of ["form", "json"]) {
    $(key + "-panel").hidden = key !== name;
    $(key + "-tab").setAttribute("aria-selected", String(key === name));
    $(key + "-tab").tabIndex = key === name ? 0 : -1;
  }
}

function finish() {
  clearTimeout(timeout);
  busy = false;
  $("preview-container").setAttribute("aria-busy", "false");
  $("compile").disabled = !valid;
  if (queued && $("auto").checked) { queued = false; compile(); }
}
function failed(message) {
  queued = false;
  error(message);
  status("PDF kunne ikke opdateres. Ret fejlen og prøv igen.");
  finish();
}
function createWorker() {
  const instance = new Worker(new URL("./compiler-worker.mjs", import.meta.url), { type: "module" });
  instance.onmessage = ({ data: result }) => {
    if (result.type === "progress") { if (busy) status(result.message); return; }
    if (result.id !== revision) { finish(); return; } // Never show an out-of-date result as current.
    if (result.type === "error") { failed(result.message); return; }
    const oldURL = pdfURL;
    pdfURL = URL.createObjectURL(new Blob([result.bytes], { type: "application/pdf" }));
    $("pdf").onload = () => { if (oldURL) URL.revokeObjectURL(oldURL); };
    $("pdf").src = pdfURL + "#view=FitH&navpanes=0&toolbar=0";
    $("pdf").hidden = false;
    $("placeholder").hidden = true;
    $("download").href = pdfURL;
    $("download").download = `arshjul-${data.year ?? new Date().getFullYear()}.pdf`;
    downloadEnabled(true);
    error(result.diagnostics);
    status("PDF er opdateret og klar til at hente.");
    finish();
  };
  instance.onerror = event => {
    event.preventDefault();
    instance.terminate();
    worker = undefined;
    failed("Kompileren kunne ikke køre. Kontrollér internetforbindelsen, og brug en opdateret browser med WebAssembly. " + (event.message ?? ""));
  };
  return instance;
}
function compile() {
  clearTimeout(debounce);
  if (!validate()) return;
  if (busy) { queued = true; return; }
  queued = false;
  busy = true;
  downloadEnabled(false);
  $("compile").disabled = true;
  $("preview-container").setAttribute("aria-busy", "true");
  status("Klargør PDF …");
  try {
    worker ??= createWorker();
    worker.postMessage({ id: revision, json: compilerData(data) });
    timeout = setTimeout(() => {
      worker.terminate();
      worker = undefined;
      failed("Kompileringen tog mere end to minutter og blev stoppet. Prøv igen, eller forkort indholdet.");
    }, 120_000);
  } catch (exception) { failed(exception.message); }
}

function saveJSON() {
  if (!validate()) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "arshjul.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

for (const key of ["title", "year"]) {
  $(key).addEventListener("input", () => {
    data[key] = key === "year" ? $(key).valueAsNumber : $(key).value;
    fromForm();
  });
}
for (const name of ["form", "json"]) {
  $(name + "-tab").addEventListener("click", () => tab(name));
  $(name + "-tab").addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "form" : event.key === "End" ? "json" : name === "form" ? "json" : "form";
    tab(next);
    if ($(next + "-tab").getAttribute("aria-selected") === "true") $(next + "-tab").focus();
  });
}
$("json").addEventListener("input", changed);
$("compile").addEventListener("click", compile);
$("download").addEventListener("click", event => { if ($("download").getAttribute("aria-disabled") === "true") event.preventDefault(); });
$("format").addEventListener("click", () => {
  if (validate()) { $("json").value = JSON.stringify(data, null, 2); persist(); }
});
$("auto").addEventListener("change", () => {
  clearTimeout(debounce);
  queued = false;
  if ($("auto").checked) compile();
});
$("export").addEventListener("click", saveJSON);
$("import").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async () => {
  const file = $("file").files[0];
  $("file").value = "";
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error("Filen må højst være 1 MB.");
    const source = await file.text();
    parseConfig(source); // A bad import must not replace the current draft.
    if (!confirm("Erstat den nuværende kladde med årshjulet fra denne fil?")) return;
    $("json").value = source;
    changed();
    renderForm();
  } catch (exception) { error(exception.message); }
});
$("example").addEventListener("click", () => {
  if (!confirm("Nulstil til eksemplet? Dine nuværende ændringer bliver erstattet.")) return;
  $("json").value = example;
  changed();
  renderForm();
  compile();
});

async function start() {
  try {
    const response = await fetch(new URL("./example.json", import.meta.url));
    if (!response.ok) throw new Error(`Eksemplet kunne ikke indlæses (HTTP ${response.status}).`);
    example = await response.text();
    parseConfig(example);
    let draft;
    try { draft = localStorage.getItem(STORAGE_KEY); } catch { /* Saving reports storage restrictions. */ }
    $("json").value = draft ?? example;
    for (const id of ["settings", "json", "format", "import", "example"]) $(id).disabled = false;
    if (validate()) { renderForm(); compile(); }
    else { tab("json"); status("Den gemte kladde indeholder en fejl. Ret indstillingerne under »Avanceret«, eller nulstil til eksemplet."); }
  } catch (exception) {
    error(exception.message);
    status("Siden kunne ikke indlæses. Genindlæs siden for at prøve igen.");
  }
}
start();
