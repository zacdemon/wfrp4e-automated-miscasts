// Compile the JSON sources in src/packs/<pack> into LevelDB compendium packs (packs/<pack>), or extract them back.
// Usage: node tools/packs.mjs compile|extract
import { extractPack, compilePack } from "@foundryvtt/foundryvtt-cli";
import fs from "node:fs";
import path from "node:path";

const PACKS = ["macros"];
const mode = process.argv[2];
const slug = (s) => String(s ?? "").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");

for (const pack of PACKS) {
  const dbPath = path.join("packs", pack);
  const srcPath = path.join("src", "packs", pack);
  if (mode === "compile") {
    fs.rmSync(dbPath, { recursive: true, force: true });
    await compilePack(srcPath, dbPath, { log: false, recursive: true });
    console.log(`Compiled ${srcPath} -> ${dbPath}`);
  } else if (mode === "extract") {
    fs.rmSync(srcPath, { recursive: true, force: true });
    await extractPack(dbPath, srcPath, { log: false, clean: true, transformName: (doc) => `${slug(doc.name)}_${doc._id}.json` });
    console.log(`Extracted ${dbPath} -> ${srcPath}`);
  } else {
    console.error("Usage: node tools/packs.mjs compile|extract");
    process.exit(1);
  }
}
