// The only runtime library: the pinned Typst WASM compiler, without typst.ts,
// a renderer, a bundler, a package manager, or a remote compilation service.
const PACKAGE = "https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/";
let ready;

async function resource(path, binary = false) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error(`Kunne ikke hente ${path} (HTTP ${response.status}).`);
  return binary ? new Uint8Array(await response.arrayBuffer()) : response.text();
}

async function initialize() {
  self.postMessage({ type: "progress", message: "Henter Typst-kompiler og skrifttyper …" });
  const [bindings, source, regular, bold] = await Promise.all([
    import(PACKAGE + "typst_ts_web_compiler.mjs"),
    resource("./arshjul.typ"),
    resource("./fonts/DejaVuSans.ttf", true),
    resource("./fonts/DejaVuSans-Bold.ttf", true),
  ]);
  await bindings.default({ module_or_path: PACKAGE + "typst_ts_web_compiler_bg.wasm" });
  const builder = new bindings.TypstCompilerBuilder();
  try {
    // All document files are supplied explicitly; no filesystem/package access.
    builder.set_dummy_access_model();
    await builder.add_raw_font(regular);
    await builder.add_raw_font(bold);
  } catch (error) {
    builder.free();
    throw error;
  }
  const compiler = await builder.build(); // consumes the builder
  compiler.add_source("/arshjul.typ", source);
  return compiler;
}

self.onmessage = async ({ data: { id, json } }) => {
  try {
    ready ??= initialize().catch(error => { ready = undefined; throw error; });
    const compiler = await ready;
    self.postMessage({ type: "progress", message: "Kompilerer PDF …" });
    const world = compiler.snapshot("/", "/arshjul.typ", [["data", json]]);
    try {
      // Native binding constants: PDF = 1; Unix/text diagnostics = 2.
      const output = world.get_artifact(1, 2);
      const diagnostics = (output?.diagnostics ?? []).join("\n");
      if (!output?.result?.length) throw new Error(diagnostics || "Typst kunne ikke generere en PDF.");
      const bytes = new Uint8Array(output.result);
      self.postMessage({ type: "result", id, bytes, diagnostics }, [bytes.buffer]);
    } finally {
      world.free();
    }
  } catch (error) {
    self.postMessage({ type: "error", id, message: error?.message ?? String(error) });
  }
};
