"""gray.inc のサンプルの絵と、テストで比べる画面を作る（python make_data.py）。

作るもの
  pic_hi.lcd、pic_lo.lcd  4 階調の絵。濃さのビット 1 の面と、ビット 0 の面（ドットエディタで開ける）
  ball.gsp                 4 階調のキャラクタ（16 × 16 ドット、2 コマ）
  test/*.pixels            gray_show で送った 1 枚ずつの画面
  screens/aim.png          目で見たときに狙う見え方（3 枚を平均した濃さ）
"""
import math
import os
import struct
import zlib

W, H = 240, 32
HERE = os.path.dirname(os.path.abspath(__file__))
BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

BALL_X, BALL_ROW = 128, 2          # graydemo.asm と同じ
BALL2_X = 152
CLIP_X, CLIP_ROW = 230, 3          # テスト: はみ出すキャラクタ
LINE = [(190 + i, 16 + i // 4, i % 4) for i in range(50)]   # gray_pset の点（graydemo.asm と同じ）


def dither(v, levels, x, y):
    t = (BAYER4[y % 4][x % 4] + 0.5) / 16
    q = v * (levels - 1)
    base = int(q)
    if base >= levels - 1:
        return levels - 1
    return base + (1 if q - base > t else 0)


def shade(dx, dy):
    """光が左上から当たる球の濃さ（0.0〜1.0）。外なら None"""
    d2 = dx * dx + dy * dy
    if d2 > 1.0:
        return None
    dz = math.sqrt(1.0 - d2)
    lx, ly, lz = -0.55, -0.6, 0.58
    n = math.sqrt(lx * lx + ly * ly + lz * lz)
    lit = max(0.0, (dx * lx + dy * ly + dz * lz) / n)
    return 1.0 - (0.15 + 0.85 * lit), d2


def picture():
    img = [[0] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            lv = 0
            if x < 64:                                   # 4 段の帯（枠つき）
                lv = x // 16
                if x == 0 or x == 63 or y == 0 or y == 31:
                    lv = 3
            elif 70 <= x < 110:                          # 球
                s = shade((x - 89.5) / 15.5, (y - 15.5) / 15.5)
                if s is not None:
                    lv = 3 if s[1] > 0.85 else dither(s[0], 4, x, y)
            elif x >= 114 and y < 15:                    # 横のグラデーション（ディザ）
                lv = dither((x - 114) / (W - 1 - 114), 4, x, y)
                if y == 0 or y == 14 or x == 114 or x == W - 1:
                    lv = 3
            img[y][x] = lv
    return img


def ball(frame):
    """16 × 16 の球。None は透明（描かない）"""
    out = [[None] * 16 for _ in range(16)]
    for y in range(16):
        for x in range(16):
            s = shade((x - 7.5) / 7.5, (y - 7.5) / 7.5)
            if s is None:
                continue
            v = s[0] if frame == 0 else 1.0 - s[0] * 0.8
            out[y][x] = 3 if s[1] > 0.8 else dither(v, 4, x, y)
    return out


def gsp(frames):
    """4 階調のキャラクタのデータ（gray_sprite の形）"""
    w, h = len(frames[0][0]), len(frames[0])
    b = bytearray([w, h // 8, len(frames), 0])
    for f in frames:
        for r in range(h // 8):
            for x in range(w):
                col = [f[r * 8 + k][x] for k in range(8)]
                b.append(sum((v is not None) << k for k, v in enumerate(col)))
                b.append(sum((v is not None and v & 2 != 0) << k for k, v in enumerate(col)))
                b.append(sum((v is not None and v & 1 != 0) << k for k, v in enumerate(col)))
    return bytes(b)


def lcd(dots):
    """dots[y][x] = 0/1 を .lcd（1024 バイト、表示 RAM の並び）にする"""
    b = bytearray(1024)
    for y in range(H):
        for x in range(W):
            if dots[y][x]:
                c = 1 if x < 64 or x >= 176 else 0
                col = x if x < 64 else x - 64 if x < 120 else 175 - x if x < 176 else 239 - x
                row = y + (32 if x >= 120 else 0)
                b[c * 512 + row // 8 * 64 + col] |= 1 << (row % 8)
    return bytes(b)


def put(img, spr, x0, row0):
    """gray_sprite と同じく、行単位で描き、右と下にはみ出す所は描かない"""
    for y in range(len(spr)):
        for x in range(len(spr[0])):
            v = spr[y][x]
            X, Y = x0 + x, row0 * 8 + y
            if v is not None and X < W and Y < H:
                img[Y][X] = v


def frame(img, k):
    """k 枚目の画面: (k − (x + y) mod 3) mod 3 が濃さより小さい点が点く"""
    return bytes(1 if (k - (x + y) % 3) % 3 < img[y][x] else 0 for y in range(H) for x in range(W))


def png(path, img, scale=3):
    bg, fg = (176, 190, 160), (28, 36, 30)
    rows = []
    for y in range(H):
        line = bytearray()
        for x in range(W):
            g = img[y][x] / 3
            line += bytes(round(bg[i] + (fg[i] - bg[i]) * g) for i in range(3)) * scale
        rows += [b"\x00" + bytes(line)] * scale

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W * scale, H * scale, 8, 2, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


def write(name, data):
    path = os.path.join(HERE, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def main():
    pic = picture()
    write("pic_hi.lcd", lcd([[v >> 1 & 1 for v in row] for row in pic]))
    write("pic_lo.lcd", lcd([[v & 1 for v in row] for row in pic]))
    balls = [ball(0), ball(1)]
    write("ball.gsp", gsp(balls))

    # graydemo.asm の画面: 絵、球 2 つ、gray_pset の点
    demo = [row[:] for row in pic]
    put(demo, balls[0], BALL_X, BALL_ROW)
    put(demo, balls[1], BALL2_X, BALL_ROW)
    for x, y, lv in LINE:
        demo[y][x] = lv
    for k in range(3):
        write(f"test/demo{k}.pixels", frame(demo, k))
    # 行 0 と 2 だけ送る（ほかの行は白のまま）
    rows = frame(demo, 1)
    write("test/rows02.pixels", bytes(v if (i // W) // 8 in (0, 2) else 0 for i, v in enumerate(rows)))
    # はみ出すキャラクタ
    clip = [[0] * W for _ in range(H)]
    put(clip, balls[1], CLIP_X, CLIP_ROW)
    write("test/clip0.pixels", frame(clip, 0))
    os.makedirs(os.path.join(HERE, "screens"), exist_ok=True)
    png(os.path.join(HERE, "screens", "aim.png"), demo)
    print("ok")


if __name__ == "__main__":
    main()
