"""Pack MotoGenie data into tiny binaries for the site.

Only coordinates ship: no names, ids or other properties.
Run from repo root: python3 tools/build_data.py
"""
import ast, gzip, json, struct
from pathlib import Path

SRC = Path.home() / "repos/data_scrap_motogenie/out_app"
OUT = Path(__file__).resolve().parent.parent / "public/data"
OUT.mkdir(parents=True, exist_ok=True)

GRID = 0.05  # degrees (~5 km): enough for the art, too coarse to be a usable extract

def snap(v):
    return round(v / GRID) * GRID

def q(lon, lat):
    lon, lat = snap(lon), snap(lat)
    # quantize to Int16 over India's bbox
    x = round((lon - 68.0) / (98.0 - 68.0) * 65535 - 32768)
    y = round((lat - 6.0) / (37.5 - 6.0) * 65535 - 32768)
    return max(-32768, min(32767, x)), max(-32768, min(32767, y))

feats = json.load(gzip.open(SRC / "all_features.geojson.gz"))["features"]
pts = [f["geometry"]["coordinates"] for f in feats if f["geometry"]["type"] == "Point"]
lines = [f["geometry"]["coordinates"] for f in feats if f["geometry"]["type"] == "LineString"]

# de-duplicate after snapping so the file is a density map, not a place list
cells = sorted({(snap(lon), snap(lat)) for lon, lat in pts})
with open(OUT / "places.bin", "wb") as fh:
    for lon, lat in cells:
        fh.write(struct.pack("<hh", *q(lon, lat)))

# routes: keep every ~12th vertex; format = [u16 count][count * (i16,i16)] ...
nverts = 0
with open(OUT / "routes.bin", "wb") as fh:
    for line in lines:
        step = max(1, len(line) // 10)
        s = line[::step]
        if s[-1] != line[-1]:
            s.append(line[-1])
        fh.write(struct.pack("<H", len(s)))
        for lon, lat in s:
            fh.write(struct.pack("<hh", *q(lon, lat)))
        nverts += len(s)

# Manali -> Khardung La via Leh elevation profile (reddit_00085)
prof = None
for raw in gzip.open(SRC / "route_elevation_profiles.jsonl.gz"):
    r = json.loads(raw)
    if r["route_id"] == "reddit_00085":
        p = r["profile"]
        prof = ast.literal_eval(p) if isinstance(p, str) else p
        break
step = max(1, len(prof) // 256)
peak_i = max(range(len(prof)), key=lambda i: prof[i]["elev_m"])
keep = sorted(set(range(0, len(prof), step)) | {peak_i, len(prof) - 1})
prof = [prof[i] for i in keep]
json.dump(
    {"name": "Manali – Khardung La via Leh",
     "km": [round(p["km"], 2) for p in prof],
     "m": [round(p["elev_m"]) for p in prof]},
    open(OUT / "khardungla.json", "w"),
)
meta = {"places": len(pts), "routes": len(lines), "routeVerts": nverts, "cells": len(cells),
        "peak_m": round(max(p["elev_m"] for p in prof))}
json.dump(meta, open(OUT / "meta.json", "w"))
print(meta)
