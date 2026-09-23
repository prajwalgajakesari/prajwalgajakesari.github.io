import sys, numpy as np, trimesh, fast_simplification as fs

import sys
src = sys.argv[1] if len(sys.argv) > 1 else "input.stl"
out = sys.argv[2] if len(sys.argv) > 2 else "public/models/ktm.glb"

m = trimesh.load(src, force='mesh')
print("loaded:", len(m.vertices), "verts", len(m.faces), "faces")
print("extents(mm?):", m.extents, "  bounds:", m.bounds)

# merge close vertices (STL is unwelded triangle soup) so decimation works well
m.merge_vertices()
print("after weld:", len(m.vertices), "verts", len(m.faces), "faces")

target = 70000
if len(m.faces) > target:
    v, f = fs.simplify(m.vertices.astype(np.float32), m.faces.astype(np.int32),
                       target_count=target)
    m = trimesh.Trimesh(vertices=v, faces=f, process=True)
    print("decimated:", len(m.vertices), "verts", len(m.faces), "faces")

# center at origin (loader will re-center too, but keep it clean)
m.apply_translation(-m.bounds.mean(axis=0))
m.visual = trimesh.visual.ColorVisuals(mesh=m, vertex_colors=[230,96,0,255])

scene = trimesh.Scene(m)
scene.export(out)
import os
print("wrote", out, round(os.path.getsize(out)/1e6, 2), "MB")
# report axis lengths to guess up-axis / facing
e = m.extents
print("sorted axes (len):", sorted(enumerate(e), key=lambda t:-t[1]))
