#!/bin/bash
# Build the release zip into /workspace/out/miscasts (or $1).
set -e
cd "$(dirname "$0")/.."
OUT=${1:-/workspace/out/miscasts}
python3 - "$OUT" <<'P'
import json, os, sys, zipfile
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
mid = json.load(open("module.json"))["id"]
files = ["module.json", "README.md"]
for d in ["lang", "scripts", "styles"]:
    for r, _, fs in os.walk(d): files += [os.path.join(r, f) for f in fs]
path = os.path.join(out, f"{mid}.zip")
with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(files): z.write(f, f)
import shutil; shutil.copy("module.json", os.path.join(out, "module.json"))
print(path, len(files))
P
