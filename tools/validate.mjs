// Offline checks: JSON parses, scripts parse, module effect builders produce compilable scripts,
// and every WFAM.* key the scripts use exists in lang/en.json.
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

let errors = 0;
const fail = msg => { errors++; console.error("✗", msg); };
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const rd = f => fs.readFileSync(path.join(root, f), "utf8");

for (const f of ["module.json", "lang/en.json", "package.json"]) {
  try { JSON.parse(rd(f)); } catch (e) { fail(`${f}: ${e.message}`); }
}
const lang = JSON.parse(rd("lang/en.json"));
const scripts = fs.readdirSync(path.join(root, "scripts")).filter(f => f.endsWith(".mjs"));
for (const f of scripts) {
  try { execFileSync(process.execPath, ["--check", path.join(root, "scripts", f)], { stdio: "pipe" }); }
  catch (e) { fail(`scripts/${f}: ${String(e.stderr || e.message).split("\n").slice(0, 5).join(" ")}`); }
}

const used = new Set();
for (const f of scripts) for (const m of rd(`scripts/${f}`).matchAll(/["'`](WFAM\.[A-Za-z0-9_.]+?)["'`]/g)) used.add(m[1]);

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const data = await import(path.join(root, "scripts/miscast-data.mjs"));
const i18n = k => { used.add(k); return k; };
const compile = (where, src) => { try { new AsyncFunction("args", src); } catch (e) { fail(`${where}: ${e.message}`); } };
let effects = 0;
for (const [source, table] of Object.entries(data.MODULE_EFFECTS)) {
  for (const [name, build] of Object.entries(table)) {
    const e = build({ img: "x.webp", i18n });
    effects++;
    if (!e.name || !e.system?.transferData?.type) fail(`${source}/${name}: missing name or transferData`);
    for (const s of e.system.scriptData ?? []) {
      if (!s.trigger) fail(`${source}/${name}: script without trigger`);
      if (s.script && !/^\s*\[Script\.\w+\]\s*$/.test(s.script)) compile(`${source}/${name} "${s.label}"`, s.script);
      for (const k of ["hideScript", "activateScript", "submissionScript"]) if (s.options?.[k]) compile(`${source}/${name} "${s.label}" ${k}`, s.options[k]);
      for (const m of String(s.script).matchAll(/["'`](WFAM\.[A-Za-z0-9_.]+?)["'`]/g)) used.add(m[1]);
    }
  }
}
for (const n of data.OVERRIDE_NAMES) if (!Object.values(data.MODULE_EFFECTS).some(t => t[n])) fail(`OVERRIDE_NAMES "${n}" has no module effect`);
for (const [source, table] of Object.entries(data.MODULE_PATCHES ?? {})) {
  for (const [name, build] of Object.entries(table)) {
    const built = build({ i18n });
    for (const s of Array.isArray(built) ? built : built.scripts) {
      compile(`patch ${source}/${name} "${s.label}"`, s.script);
      for (const m of String(s.script).matchAll(/["'`](WFAM\.[A-Za-z0-9_.]+?)["'`]/g)) used.add(m[1]);
    }
  }
}
// Lore colours: valid hex, and the "no Lore" colours are not used by any Lore.
const lore = await import(path.join(root, "scripts/miscast-lore.mjs"));
for (const [k, a] of Object.entries(lore.LORE_ATTRIBUTES)) if (a.note) used.add(a.note); else if (!a.auto) fail(`lore attribute ${k}: neither auto nor note`);
const isHex = h => /^#[0-9a-f]{6}$/i.test(h);
const loreHex = new Set();
for (const [k, l] of Object.entries(lore.LORE_COLOURS)) {
  if (!l.colours?.length) fail(`lore ${k}: no colours`);
  for (const [h, n] of l.colours) { if (!isHex(h) || !n) fail(`lore ${k}: bad colour ${h}`); loreHex.add(h.toLowerCase()); }
}
for (const [h] of lore.NO_LORE_COLOURS) { if (!isHex(h)) fail(`no-lore colour ${h}`); if (loreHex.has(h.toLowerCase())) fail(`no-lore colour ${h} is a Lore colour`); }
if (lore.blend(["#ff0000", "#0000ff"]).length !== 7) fail("blend");
for (const m of fs.readFileSync(path.join(root, "scripts/miscast-lore.mjs"), "utf8").matchAll(/["'`](WFAM\.[A-Za-z0-9_.]+?)["'`]/g)) used.add(m[1]);

for (const k of used) if (!(k in lang) && !k.endsWith(".")) fail(`missing lang key ${k}`);

if (errors) { console.error(`${errors} problem(s)`); process.exit(1); }
console.log(`ok: ${scripts.length} scripts, ${effects} module effects, ${used.size} lang keys checked`);
