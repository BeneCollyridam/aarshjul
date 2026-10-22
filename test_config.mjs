import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MONTHS, parseConfig, compilerData } from "./config.mjs";

assert.equal(MONTHS.length, 12);
assert.equal(MONTHS[2], "Marts");
assert.equal(MONTHS[4], "Maj");
assert.equal(MONTHS[11], "December");
assert.deepEqual(parseConfig("{}"), {});
assert.deepEqual(parseConfig('{"subtitle":"Legacy subtitle","footer":"Legacy footer"}'), { subtitle: "Legacy subtitle", footer: "Legacy footer" });
const example = await readFile(new URL("./example.json", import.meta.url), "utf8");
assert.deepEqual(parseConfig(example), JSON.parse(example));
assert.equal(JSON.parse(compilerData({})).year, new Date().getFullYear());
assert.equal(JSON.parse(compilerData({ year: 2030 })).year, 2030);
const custom = { title: "#text[not code]", custom: { keep: true }, events: [{ month: 1, title: "<script>alert(1)</script>", extra: 3 }] };
assert.deepEqual(parseConfig(JSON.stringify(custom)), custom);
for (const data of [null, [], { year: null }, { year: 0 }, { year: 10000 }, { title: 5 }, { events: {} }, { months: [] }, { months: Array(12).fill(5) }, { colors: ["bad", "#123456", "#123456", "#123456"] }, { events: [null] }, { events: [{ month: 0, title: "x" }] }, { events: [{ month: 13, title: "x" }] }, { events: [{ month: 1.5, title: "x" }] }, { events: [{ month: 1, title: "" }] }, { events: [{ month: 1, title: "x", description: 1 }] }]) {
  assert.throws(() => parseConfig(JSON.stringify(data)));
}
assert.throws(() => parseConfig("{"));
console.log("PASS: JSON validation, defaults, Danish months, and lossless custom fields.");
