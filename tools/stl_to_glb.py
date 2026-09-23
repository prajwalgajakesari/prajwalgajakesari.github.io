# Turn the real 2023 KTM 890 Adventure R print STL into a web-ready GLB.
#
# What it does that a plain decimation doesn't:
#   • splits the print into connected solids and groups them into
#       body / wheel_front / wheel_rear
#   • paints each solid by role (paint, frame, engine, seat, tyre, rim) so the
#       bike reads as a real 890 instead of a monochrome blob
#   • BAKES orientation (up→+Y, forward→+X), scale (length 1.95 m) and ground
#       contact into the geometry, so the site loader needs no up/front config
#   • exports wheel_front / wheel_rear as separate nodes whose origin sits on the
#       axle, so three.js can spin them (rotation.z) without wobble
#
# Slow step (connected-components + per-part decimation) is cached to the
# scratchpad, so re-running to tweak the PALETTE below is fast.
#
#   pip install trimesh numpy fast-simplification pillow scipy
#   python tools/stl_to_glb.py "<src.stl>" [out.glb] [--fresh]
import sys, os, json, hashlib
import numpy as np, trimesh, fast_simplification as fs
from scipy.spatial import cKDTree

_pos = [a for a in sys.argv[1:] if not a.startswith("--")]
SRC = _pos[0] if len(_pos) > 0 else os.path.expanduser("~/Downloads/2023 KTM 890 Adventure R-2.stl")
OUT = _pos[1] if len(_pos) > 1 else "public/models/ktm.glb"
FRESH = "--fresh" in sys.argv
LENGTH = 1.95  # target wheelbase-ish length in metres

# role ids and their sRGB colours — tweak freely, re-run is fast (cache reused).
# Matches the real 2023 KTM 890 Adventure R "Atlantic" livery: white upper
# bodywork, big KTM-orange lower shrouds + frame, blue graphic accents, black
# plastics (handguards/seat/beak edge), silver skid plate + exhaust, dark
# engine, black wheels, and a translucent smoke windscreen.
PAINT, FRAME, ENGINE, SEAT, TYRE, RIM, BLUE, BLACK, METAL, GLASS = range(10)
PALETTE = {
    PAINT:  0xEDECE8,  # white bodywork
    FRAME:  0xFF5A00,  # vivid KTM racing orange (frame + lower shrouds + graphics)
    ENGINE: 0x24262A,  # LC8c dark metal
    SEAT:   0x121214,  # seat / tail
    TYRE:   0x0B0B0D,  # rubber
    RIM:    0x34373C,  # dark spoked rim (the R runs black rims)
    BLUE:   0x1E49A0,  # KTM Atlantic blue graphic accent
    BLACK:  0x161719,  # black plastics: handguards, beak edge, panels
    METAL:  0x9CA0A6,  # brushed aluminium skid plate / exhaust
    GLASS:  0x86A6BE,  # smoke windscreen tint (loader gives it a glass material)
}
# per-role material hint: 0=paint(clearcoat) 1=metal 2=rubber 3=glass
MATCLASS = {PAINT: 0, FRAME: 0, ENGINE: 1, SEAT: 2, TYRE: 2, RIM: 1, BLUE: 0, BLACK: 2, METAL: 1, GLASS: 3}


def srgb_to_linear(hexcol):
    c = np.array([(hexcol >> 16) & 255, (hexcol >> 8) & 255, hexcol & 255], float) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return lin


def roundness(c):
    ey, ez = c.extents[1], c.extents[2]
    return abs(ey - ez) / max(ey, ez)


def cache_key():
    st = os.stat(SRC)
    return hashlib.md5(f"{SRC}:{st.st_size}:{int(st.st_mtime)}:{LENGTH}".encode()).hexdigest()[:12]


CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".cache")
os.makedirs(CACHE_DIR, exist_ok=True)
CACHE = os.path.join(CACHE_DIR, f"ktm_dec_{cache_key()}.npz")


def build_cache():
    print("loading", SRC)
    m = trimesh.load(SRC, force="mesh")
    m.merge_vertices()
    print("welded:", len(m.vertices), "verts", len(m.faces), "faces")
    comps = m.split(only_watertight=False)
    print("connected solids:", len(comps))

    # STL axes here: x = width, y = fore/aft (length, longest), z = up
    def seed(sign):
        best = None
        for c in comps:
            ct, ex = c.centroid, c.extents
            if sign * ct[1] > 6 and abs(ct[0]) < 3 and ct[2] < 2 and roundness(c) < 0.2 and max(ex[1], ex[2]) > 6:
                if best is None or len(c.faces) > len(best.faces):
                    best = c
        return best
    fs_c, rs_c = seed(1), seed(-1)
    faxle = np.array([0.0, fs_c.centroid[1], fs_c.centroid[2]])
    raxle = np.array([0.0, rs_c.centroid[1], rs_c.centroid[2]])
    frad = max(fs_c.extents[1], fs_c.extents[2]) / 2
    rrad = max(rs_c.extents[1], rs_c.extents[2]) / 2
    print("front axle", np.round(faxle[1:], 2), "r", round(frad, 2), "| rear axle", np.round(raxle[1:], 2), "r", round(rrad, 2))

    def near(ct, axle):  # concentric wheel parts sit ~0 from the axle; calipers/forks don't
        return abs(ct[0]) < 4.5 and np.hypot(ct[1] - axle[1], ct[2] - axle[2]) < 1.8

    def wheel_role(c, maxrad):
        r = max(c.extents[1], c.extents[2]) / 2
        return TYRE if r > 0.82 * maxrad else RIM

    # windscreen = the front panel that reaches the very top of the bike
    def is_glass(c):
        b = c.bounds
        return b[1][2] > 12.0 and abs(c.centroid[0]) < 2.0

    # STL axes: x=width, y=front(+)/back, z=up (ground z≈-7.3, top z≈13.6).
    # KEY: everything mechanical (engine, cases, radiators, brackets, cables,
    # subframe, linkages, small hardware) must be DARK. So the DEFAULT is ENGINE,
    # and WHITE is only assigned to positively-identified outer bodywork panels
    # (large, up on the skin: fairing mask, tank top, upper shrouds, fender/beak,
    # rear side panels). This stops white leaking onto mechanical parts.
    def body_role(c):
        ex = np.sort(c.extents)[::-1]  # L, M, S
        L, M, S = ex
        cx, cy, cz = c.centroid
        b = c.bounds; zmin = b[0][2]
        faces = len(c.faces)
        tube = M < 0.5 * L and S < 0.6 * L and L > 6
        big = faces >= 2500               # a real panel, not small hardware

        # ── mechanical / structural first ──
        if abs(cx) > 1.0 and cy < -3 and cz < 2.5 and L > 5 and S < 3:
            return METAL                   # silver exhaust (long, one-sided, low, rear)
        if tube:
            return FRAME                   # orange trellis rails / down-tubes
        if abs(cx) > 3.8 and cz > 8 and cy > 3:
            return BLACK                   # handguards out by the bars
        if abs(cx) < 2.0 and cy < -6 and cz > 3.5:
            return SEAT                    # central seat / tail = black

        # ── outer bodywork panels: only sizeable parts up on the skin ──
        if big:
            if abs(cx) > 1.8 and cy > 7 and cz > 6:
                return BLUE                # small blue graphic flash on the fairing wings
            if cy > 6.5 and cz > 3.0:
                return PAINT               # white front mask / fairing / beak / fender
            if cz > 4.0 and zmin > 0.5 and abs(cx) < 4.5:
                return PAINT               # white tank top / upper shrouds
            if cy < -6 and cz > 3.5:
                return PAINT               # white rear side panels
            if abs(cx) > 1.8 and 0.5 < cy < 7.5 and zmin < 2.0 and cz < 4.5:
                return FRAME               # orange lower radiator shrouds

        return ENGINE   # default: engine, cases, radiators, brackets, cables, hardware = dark

    groups = {"body": [], "wheel_front": [], "wheel_rear": [], "glass": []}
    for c in comps:
        if near(c.centroid, faxle):
            groups["wheel_front"].append(c)
        elif near(c.centroid, raxle):
            groups["wheel_rear"].append(c)
        elif is_glass(c):
            groups["glass"].append(c)
        else:
            groups["body"].append(c)
    # true tyre radius = widest part in each wheel (seed may be the rim, not the tyre)
    def grp_maxrad(parts):
        return max(max(p.extents[1], p.extents[2]) / 2 for p in parts)
    fmax, rmax = grp_maxrad(groups["wheel_front"]), grp_maxrad(groups["wheel_rear"])
    roles = {
        "wheel_front": [wheel_role(c, fmax) for c in groups["wheel_front"]],
        "wheel_rear": [wheel_role(c, rmax) for c in groups["wheel_rear"]],
        "glass": [GLASS for _ in groups["glass"]],
        "body": [body_role(c) for c in groups["body"]],
    }

    # decimation budget per group (wheels keep spokes/tread so spin reads)
    budget = {"body": 50000, "wheel_front": 11000, "wheel_rear": 11000, "glass": 9000}
    out = {"faxle": faxle, "raxle": raxle}
    for name in groups:
        parts, rids = groups[name], roles[name]
        # per-vertex role id on the pre-decimation mesh
        V = np.vstack([p.vertices for p in parts])
        F, off, rv = [], 0, []
        for p, rid in zip(parts, rids):
            F.append(p.faces + off); rv.append(np.full(len(p.vertices), rid)); off += len(p.vertices)
        F = np.vstack(F); rv = np.concatenate(rv)
        tot = len(F)
        tgt = min(budget[name], tot)
        if tot > tgt:
            v2, f2 = fs.simplify(V.astype(np.float32), F.astype(np.int32), target_count=tgt)
        else:
            v2, f2 = V, F
        # carry role ids to the decimated verts via nearest original vertex
        rv2 = rv[cKDTree(V).query(v2)[1]]
        out[name + "_v"] = v2.astype(np.float32)
        out[name + "_f"] = f2.astype(np.int32)
        out[name + "_r"] = rv2.astype(np.int8)
        print(f"  {name:12s} {tot:6d} → {len(f2):6d} faces")
    np.savez(CACHE, **out)
    print("cached", CACHE)
    return out


data = None
if not FRESH and os.path.exists(CACHE):
    print("reusing decimation cache", CACHE)
    data = dict(np.load(CACHE))
else:
    data = build_cache()

# ── bake orientation / scale / ground from the whole model ────────────────────
# stl(x=width, y=fore/aft, z=up) → world(x=forward, y=up, z=width)
Rrot = np.array([[0, 1, 0], [0, 0, 1], [1, 0, 0]], float)
allV = np.vstack([data[n + "_v"] for n in ("body", "wheel_front", "wheel_rear", "glass")])
w = allV @ Rrot.T
s = LENGTH / (w[:, 0].max() - w[:, 0].min())
w *= s
# ground to y=0, centre x & z
gx = (w[:, 0].max() + w[:, 0].min()) / 2
gz = (w[:, 2].max() + w[:, 2].min()) / 2
gy = w[:, 1].min()
shift = np.array([gx, gy, gz])


def to_world(v):
    return (v @ Rrot.T) * s - shift


def axle_world(axle):
    return (axle @ Rrot.T) * s - shift


scene = trimesh.Scene()
axles = {}
for name in ("body", "wheel_front", "wheel_rear", "glass"):
    v = to_world(data[name + "_v"])
    f = data[name + "_f"]
    rid = data[name + "_r"]
    cols = np.zeros((len(v), 4), np.float32)
    cols[:, 3] = 1.0
    for role, hexc in PALETTE.items():
        cols[rid == role, :3] = srgb_to_linear(hexc)
    origin = np.zeros(3)
    if name == "wheel_front":
        origin = axle_world(data["faxle"]); axles["front"] = origin.tolist()
    elif name == "wheel_rear":
        origin = axle_world(data["raxle"]); axles["rear"] = origin.tolist()
    v = v - origin  # centre geometry on the axle so the node can spin cleanly
    mesh = trimesh.Trimesh(vertices=v, faces=f, process=False)
    mesh.visual = trimesh.visual.ColorVisuals(mesh=mesh, vertex_colors=(cols * 255).astype(np.uint8))
    T = np.eye(4); T[:3, 3] = origin
    scene.add_geometry(mesh, node_name=name, geom_name=name, transform=T)
    print(f"  node {name:12s} verts {len(v):6d}  origin {np.round(origin,3).tolist()}")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
scene.export(OUT)
print("wrote", OUT, round(os.path.getsize(OUT) / 1e6, 2), "MB")

# stash the material-class map next to the model for the loader
mc_path = os.path.join(os.path.dirname(OUT), "ktm.parts.json")
with open(mc_path, "w") as fh:
    json.dump({
        "axles": axles,
        "palette": {str(k): v for k, v in PALETTE.items()},
        "matclass": {str(k): v for k, v in MATCLASS.items()},
    }, fh, indent=1)
print("wrote", mc_path, "axles", {k: [round(x, 3) for x in v] for k, v in axles.items()})
