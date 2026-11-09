"""Build an office character sprite sheet from its ChatGPT chunk files.

    python scripts/office-sprite.py                 # every character in public/office/_chunks
    python scripts/office-sprite.py kevin-spann     # just one

Input  public/office/_chunks/<name>-A.png, -B.png, -C.png (4x4 frames each) and an
       optional -D.png (4 poses side by side, any width: they are found by the
       empty gaps between them, not by dividing the image into quarters). Any
       size; the letter may be upper or lower case.
Output public/office/characters/<name>.png: 4 columns of 144x144 frames,
       rows A0-3, B4-7, C8-11 (+ D12): 576x1728, or 576x1872 with D.

Every frame is re-placed, not just resized: the figure is cut out of its cell
(the cell edges are moved to the emptiest line near where they should be, so an
uneven grid doesn't slice a hand off), then put back with the feet on the same
bottom line and the body centred. The office code relies on that: the "feet"
x/y in seats.txt is where the bottom centre of a frame is drawn.

D (sit-eat in profile) is scaled so the person is as tall as in their B row 1
(sit-eat facing the viewer), which keeps the seated rows the same size. A
character without D gets a 12-row sheet; the office falls back to row 5 for
side seats until the D chunk is added and the script is re-run.

Needs Pillow + numpy (pip install pillow numpy).
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

FRAME = 144
COLS = 4
FEET_MARGIN = 4  # empty pixels under the shoes, so smoothing never clips them
STANDING = 131  # height of every person standing, in px (checked against the doors and desks)
ALPHA_MIN = 24  # alpha below this is background-removal haze: ignored when measuring
OFFICE = Path(__file__).resolve().parent.parent / "public" / "office"
CHUNKS = OFFICE / "_chunks"
OUT = OFFICE / "characters"
# (chunk letter, rows of frames, which row shows the person standing still)
# The standing row is used to size every chunk alike, because ChatGPT draws the
# person a little bigger or smaller in each image it makes.
PARTS = [("A", 4, 0), ("B", 4, 3), ("C", 4, 3), ("D", 1, None)]


def find_chunk(name, letter):
    for p in CHUNKS.glob(f"{name}-*.png"):
        if p.stem[len(name) + 1 :].upper() == letter:
            return p
    return None


def load(path):
    a = np.array(Image.open(path).convert("RGBA"))
    corners = [a[0, 0], a[0, -1], a[-1, 0], a[-1, -1]]
    if all(c[3] > 200 and c[0] > 200 and c[1] < 80 and c[2] > 200 for c in corners):
        # Solid magenta background: key it out. shortcut: a hard colour key, so a
        # pink fringe can survive on soft edges; ask for transparent PNGs instead.
        dist = np.abs(a[..., :3].astype(int) - [255, 0, 255]).sum(-1)
        a[dist < 150, 3] = 0
        print(f"  {path.name}: removed magenta background")
    elif a[..., 3].min() == 255:
        sys.exit(f"  {path.name}: has no transparent background (and it isn't magenta)")
    a[a[..., 3] < ALPHA_MIN] = 0  # background-removal haze becomes real transparency
    return a


def cuts(profile, parts):
    """Split a line into `parts` at the emptiest point near each nominal boundary."""
    length = len(profile)
    out = [0]
    for i in range(1, parts):
        nominal = round(length * i / parts)
        win = length // parts // 4
        out.append(min(range(nominal - win, nominal + win), key=lambda p: (profile[p], abs(p - nominal))))
    return out + [length]


def gap_cuts(profile, parts):
    """Cut points in the middle of the `parts - 1` widest empty gaps between figures."""
    xs = np.nonzero(profile)[0]
    gaps = []  # (width, middle) of each empty run inside the content
    start = None
    for x in range(xs[0], xs[-1] + 1):
        if profile[x] == 0 and start is None:
            start = x
        elif profile[x] and start is not None:
            gaps.append((x - start, (start + x) // 2))
            start = None
    if len(gaps) < parts - 1:
        sys.exit(f"  found {len(gaps) + 1} figures side by side, expected {parts}")
    mids = sorted(m for _, m in sorted(gaps, reverse=True)[: parts - 1])
    return [0] + mids + [len(profile)]


def figures(a, rows):
    """Yield the figure in every cell as (rgba crop, head-centre x within the crop)."""
    mask = a[..., 3] >= ALPHA_MIN
    ycuts = cuts(mask.sum(1), rows) if rows > 1 else [0, a.shape[0]]
    grid = []
    for r in range(rows):
        band = mask[ycuts[r] : ycuts[r + 1]]
        xcuts = cuts(band.sum(0), COLS) if rows > 1 else gap_cuts(band.sum(0), COLS)
        row = []
        for c in range(COLS):
            m = band[:, xcuts[c] : xcuts[c + 1]]
            ys, xs = np.nonzero(m)
            if len(ys) == 0:
                row.append(None)
                continue
            top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            # Centre on the head (top fifth of the figure): it stays put across
            # walk, talk and wave frames, where feet and arms swing.
            head = m[top : top + max(1, (bottom - top) // 5), left:right]
            head_x = np.nonzero(head)[1].mean()
            crop = a[ycuts[r] + top : ycuts[r] + bottom, xcuts[c] + left : xcuts[c] + right]
            row.append((crop, head_x))
        grid.append(row)
    return grid


def standing_height(grid, row):
    return float(np.median([f[0].shape[0] for f in grid[row] if f]))


def build(name):
    print(name)
    chunks = []
    for letter, rows, standing_row in PARTS:
        path = find_chunk(name, letter)
        if path is None:
            if letter != "D":
                sys.exit(f"  missing {name}-{letter}.png in {CHUNKS}")
            continue
        a = load(path)
        chunks.append((letter, figures(a, rows), standing_row))

    # A, B and C are scaled so the person stands STANDING px tall. D has no
    # standing row: its seated figure is made as tall as B row 1 (sit-eat, front).
    _, grid_a, row_a = chunks[0]
    scale_a = STANDING / standing_height(grid_a, row_a)
    scales = {}
    sheet_rows = []
    for letter, grid, standing_row in chunks:
        if standing_row is None:
            _, grid_b, _ = chunks[1]
            seated_b = standing_height(grid_b, 1) * scales["B"]
            scale = seated_b / standing_height(grid, 0)
        else:
            scale = STANDING / standing_height(grid, standing_row)
            if abs(scale / scale_a - 1) > 0.03:
                print(f"  {letter}: person drawn {scale_a / scale:.2f}x the size of A, rescaled to match")
        scales[letter] = scale
        for row in grid:
            frames = []
            for fig in row:
                frame = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
                if fig:
                    crop, head_x = fig
                    w = max(1, round(crop.shape[1] * scale))
                    h = max(1, round(crop.shape[0] * scale))
                    img = Image.fromarray(crop).resize((w, h), Image.LANCZOS)
                    x = round(FRAME / 2 - head_x * scale)
                    y = FRAME - FEET_MARGIN - h
                    if x < 0 or y < 0 or x + w > FRAME:
                        print(f"  {letter}: a frame is {w}x{h}px and doesn't fit in {FRAME}px; edges cut off")
                    frame.paste(img, (x, y), img)
                frames.append(frame)
            sheet_rows.append(frames)

    sheet = Image.new("RGBA", (FRAME * COLS, FRAME * len(sheet_rows)), (0, 0, 0, 0))
    for r, frames in enumerate(sheet_rows):
        for c, frame in enumerate(frames):
            sheet.paste(frame, (c * FRAME, r * FRAME))
    OUT.mkdir(exist_ok=True)
    dest = OUT / f"{name}.png"
    sheet.save(dest, optimize=True)
    print(f"  -> {dest.relative_to(OFFICE.parent.parent)} ({sheet.width}x{sheet.height})")


def main():
    names = sys.argv[1:] or sorted({p.stem.rsplit("-", 1)[0] for p in CHUNKS.glob("*-[aAbBcCdD].png")})
    if not names:
        sys.exit(f"no chunk files in {CHUNKS}")
    for name in names:
        build(name)


if __name__ == "__main__":
    main()
