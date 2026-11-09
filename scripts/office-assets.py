"""Turn the office art into what the browser loads (public/office/web/).

    python scripts/office-assets.py

Re-run after any change to the art in public/office (bg-*, fg-*, layout-guide,
characters/, seats.txt). Writes:
  bg-morning/afternoon/evening.webp   the backgrounds, WebP quality 80
  <slug>.webp                         each character sheet, WebP quality 90
  walkable.txt                        192x128 cells of 8 px: '.' open floor, '#' blocked
  objects.png                         1536x1024, pixel value = object id (0 = none)
  objects.json                        per object: id, bbox, baseline (lowest pixel), kind, seats

Objects are the things people walk or sit behind. Each fg-*.png is used only as
a mask: its connected parts (dilated 4 px) are one object each, and the browser
takes the pixels from whichever bg is showing. fg-lunch-chairs.png is one joined
shape, so it is split into one chair per seat (see split_chairs).

Needs Pillow + numpy + scipy.
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

OFFICE = Path(__file__).resolve().parent.parent / "public" / "office"
WEB = OFFICE / "web"
CELL = 8
ALPHA = 128
# Later files take over pixels that overlap an earlier one.
FG = [("fg-executive", "exec"), ("fg-desks-row1", "desk"), ("fg-desks-row2", "desk"),
      ("fg-plants", "plant"), ("fg-lounge", "lounge"), ("fg-lunch", "table"),
      ("fg-lunch-chairs", "chair")]
LUNCH = ["T1", "T2", "T3", "L1", "L2", "L3", "L4", "R1", "R2", "R3", "R4", "R5", "B1", "B2"]

# Each side's chairs are copies of its front-most chair (L4, R5) shifted along the
# table; a lower chair hides the one behind it, so later polygons win. Traced on
# 2026-11-09 from fg-lunch-chairs.png.
C4 = [(1216, 516), (1230, 516), (1236, 530), (1247, 576), (1284, 576), (1284, 618),
      (1242, 618), (1240, 662), (1224, 662), (1217, 625), (1215, 560)]
R5 = [(1446, 528), (1468, 528), (1477, 546), (1477, 600), (1475, 657), (1460, 657),
      (1455, 632), (1440, 632), (1440, 610), (1423, 610), (1423, 578), (1434, 560), (1438, 540)]


def shift(poly, dx, dy):
    return [(x + dx, y + dy) for x, y in poly]


def box(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


CHAIR_POLYS = {
    "L1": shift(C4, -43, -130), "L2": shift(C4, -31, -92), "L3": shift(C4, -16, -47), "L4": C4,
    "R1": shift(R5, -60, -139), "R2": shift(R5, -47, -107), "R3": shift(R5, -34, -75),
    "R4": shift(R5, -17, -39), "R5": R5,
    "B1": box(1284, 582, 1360, 690), "B2": box(1360, 582, 1437, 690),
}


def read_seats():
    seats = {}
    for line in (OFFICE / "seats.txt").read_text().splitlines():
        p = line.split()
        if not p or p[0].startswith("#"):
            continue
        nums = [int(t) for t in p[1:] if t.lstrip("-").isdigit()]
        seats[p[0]] = (nums[0], nums[1])
    return seats


def mask(name):
    return np.asarray(Image.open(OFFICE / f"{name}.png").convert("RGBA"))[..., 3] >= ALPHA


def write_webp():
    WEB.mkdir(exist_ok=True)
    for period in ("morning", "afternoon", "evening"):
        Image.open(OFFICE / f"bg-{period}.png").convert("RGB").save(WEB / f"bg-{period}.webp", quality=80)
    for sheet in sorted((OFFICE / "characters").glob("*.png")):
        Image.open(sheet).convert("RGBA").save(WEB / f"{sheet.stem}.webp", quality=90, method=6)


def walkable():
    a = np.asarray(Image.open(OFFICE / "layout-guide.png").convert("RGB")).astype(int)
    green = (a[..., 1] >= 200) & (a[..., 0] < 64) & (a[..., 2] < 64)
    h, w = green.shape
    cells = green.reshape(h // CELL, CELL, w // CELL, CELL).mean(axis=(1, 3)) >= 0.5
    (WEB / "walkable.txt").write_text("\n".join("".join("." if c else "#" for c in row) for row in cells) + "\n")
    return cells


def split_chairs(m):
    """One label per lunch seat for the joined chair mask (painter order, later wins)."""
    h, w = m.shape
    owner = np.zeros((h, w), dtype=np.int32)  # index into LUNCH, +1; 0 = unowned
    lab, n = ndimage.label(m)
    for i in range(1, n + 1):  # the three top-end chairs stand alone
        part = lab == i
        ys, xs = np.nonzero(part)
        if ys.max() < 420:
            code = "T1" if xs.mean() < 1260 else "T2" if xs.mean() < 1314 else "T3"
            owner[part] = LUNCH.index(code) + 1
    for code, poly in CHAIR_POLYS.items():
        pm = Image.new("L", (w, h), 0)
        ImageDraw.Draw(pm).polygon(poly, fill=1)
        not_top = (owner == 0) | (owner > 3)  # 1-3 are T1-T3; a later side/bottom chair wins
        owner[(np.asarray(pm) > 0) & m & not_top] = LUNCH.index(code) + 1
    left = m & (owner == 0)
    if left.any():  # stragglers go to the nearest owned pixel
        _, (iy, ix) = ndimage.distance_transform_edt(owner == 0, return_indices=True)
        owner[left] = owner[iy[left], ix[left]]
    return {code: owner == i + 1 for i, code in enumerate(LUNCH)}


def objects(seats):
    h, w = 1024, 1536
    ids = np.zeros((h, w), dtype=np.uint16)
    parts = []  # (kind, seat code or None) per id
    for name, kind in FG:
        m = mask(name)
        if kind == "chair":
            pieces = [(m_, code) for code, m_ in split_chairs(m).items()]
        else:
            lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=4))
            pieces = [((lab == i) & m, None) for i in range(1, n + 1)]
        for piece, code in pieces:
            if piece.sum() < 200 and code is None:
                continue
            parts.append((kind, code))
            ids[piece] = len(parts)
    assert len(parts) < 256, f"{len(parts)} objects; objects.png holds at most 255"
    out = []
    for i, (kind, code) in enumerate(parts, start=1):
        ys, xs = np.nonzero(ids == i)
        if len(ys) == 0:
            continue  # fully covered by a later file
        o = {"id": i, "x": int(xs.min()), "y": int(ys.min()), "w": int(xs.max() - xs.min() + 1),
             "h": int(ys.max() - ys.min() + 1), "baseline": int(ys.max()), "kind": kind, "seats": []}
        if code:
            o["seats"] = [code]
        if kind == "lounge":
            o["seats"] = [k for k in ("A1", "A2", "A3", "A4") if o["x"] <= seats[k][0] < o["x"] + o["w"]]
        out.append(o)
    Image.fromarray(ids.astype(np.uint8), "L").save(WEB / "objects.png", optimize=True)
    (WEB / "objects.json").write_text(json.dumps({"width": w, "height": h, "objects": out}, indent=1))
    return out


def check(objs, cells, seats):
    for code in LUNCH:
        n = sum(o["kind"] == "chair" and code in o["seats"] for o in objs)
        assert n == 1, f"lunch seat {code} has {n} chair objects"
    for code in ("A1", "A2", "A3", "A4"):
        n = sum(o["kind"] == "lounge" and code in o["seats"] for o in objs)
        assert n == 1, f"armchair {code} is in {n} lounge objects"
    assert sum(o["kind"] == "table" for o in objs) == 1, "expected exactly one lunch table object"
    rows, cols = np.nonzero(cells)
    for door in ("EXIT", "CR"):
        x, y = seats[door]
        d = np.hypot(cols * CELL + CELL / 2 - x, rows * CELL + CELL / 2 - y).min()
        assert d <= 40, f"no open floor within 40 px of {door} (nearest {d:.0f} px)"


def main():
    seats = read_seats()
    write_webp()
    cells = walkable()
    objs = objects(seats)
    check(objs, cells, seats)
    for f in sorted(WEB.iterdir()):
        print(f"  {f.relative_to(OFFICE.parent.parent)}  {f.stat().st_size // 1024} KB")
    kinds = {}
    for o in objs:
        kinds[o["kind"]] = kinds.get(o["kind"], 0) + 1
    print("objects:", ", ".join(f"{k} {n}" for k, n in kinds.items()))


if __name__ == "__main__":
    main()
