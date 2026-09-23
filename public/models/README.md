# Real bike model (optional)

The site ships a procedural KTM 890 Adventure. To use a real scan instead:

1. Download a CC-licensed glTF/GLB, e.g. the CC-BY KTM 790 Adv R Rally scan:
   https://sketchfab.com/3d-models/none-0ec0d02e4ae949ba8840207aca8e5c3c
   (Sketchfab → Download 3D Model → glTF/GLB. Free login required.)
2. Save it here as `ktm.glb`.
3. Create `ktm.json` next to it (copy `ktm.json.example`), filling in the
   attribution the licence requires and, if needed, a `yaw` so the bike faces
   right (+x). The site auto-scales and drops it to the ground.

With no `ktm.json`, the loader stays off and the procedural bike is used.
Keep the model under a few MB (decimate/Draco-compress a heavy scan first).
