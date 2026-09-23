# Bike model

The hero/orbit bike is the real **2023 KTM 890 Adventure R**, built from a print
STL by `tools/stl_to_glb.py`. That script:

- splits the print into connected solids and groups them into
  `body` / `wheel_front` / `wheel_rear`;
- paints each part by role (white bodywork, orange frame, black tyres, gunmetal
  rims, dark engine) as baked vertex colours;
- bakes orientation (up→+Y, forward→+X), scale (length 1.95 m) and ground
  contact into the geometry;
- centres each wheel on its axle and records the axle world positions in
  `ktm.parts.json` (trimesh drops node translations on GLB export), so the site
  can spin the wheels about their hubs.

Regenerate from a new STL:

```
pip install trimesh numpy fast-simplification pillow scipy
python tools/stl_to_glb.py "<file>.stl"   # → public/models/ktm.glb + ktm.parts.json
```

`ktm.json` points the site at the GLB + parts config and carries the credit
line. With no `ktm.json`, the loader stays off and a procedural KTM 890 is used
(see `src/bike.js`). A GLB without the named wheel nodes falls back to a legacy
single-skin loader.

**Licence:** the STL's source, author and licence are still unconfirmed — the
footer credit is a placeholder until that's settled. Confirm the licence permits
public web use before deploying.
