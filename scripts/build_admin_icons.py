"""Render separate Svitlo Office PWA icons with Python's standard library only.

Icons are generated into the public build folder, not stored in Git history.
"""
from pathlib import Path
import struct
import zlib


def _polygon(points, x, y):
    hit = False
    j = len(points) - 1
    for i in range(len(points)):
        xi, yi = points[i]
        xj, yj = points[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


SHIELD = ((.50, .14), (.78, .265), (.75, .565), (.70, .675),
          (.50, .86), (.30, .675), (.25, .565), (.22, .265))
BOLT = ((.55, .28), (.365, .535), (.487, .535), (.438, .735),
        (.657, .437), (.527, .437))


def _sample(x, y):
    # Transparent, rounded outer edges; generous safe area for maskable icons.
    radius = .225
    dx = max(abs(x - .5) - (.5 - radius), 0)
    dy = max(abs(y - .5) - (.5 - radius), 0)
    if dx * dx + dy * dy > radius * radius:
        return (0, 0, 0, 0)
    if _polygon(BOLT, x, y):
        return (255, 255, 255, 255)
    if _polygon(SHIELD, x, y):
        return (61, 194, 234, 255)
    return (round(20 + 21 * y), round(36 + 32 * y), round(64 + 55 * y), 255)


def _chunk(tag, data):
    return (struct.pack('!I', len(data)) + tag + data +
            struct.pack('!I', zlib.crc32(tag + data) & 0xffffffff))


def _png(size):
    pixels = bytearray()
    sub = 2 if size < 300 else 1
    for y in range(size):
        pixels.append(0)
        for x in range(size):
            samples = [_sample((x + (sx + .5) / sub) / size,
                               (y + (sy + .5) / sub) / size)
                       for sy in range(sub) for sx in range(sub)]
            pixels.extend(round(sum(p[k] for p in samples) / len(samples))
                          for k in range(4))
    header = struct.pack('!2I5B', size, size, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + _chunk(b'IHDR', header) +
            _chunk(b'IDAT', zlib.compress(pixels, 7)) + _chunk(b'IEND', b''))


def build_icons(folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    for size in (180, 192, 512):
        (folder / ('icon-%d.png' % size)).write_bytes(_png(size))


if __name__ == '__main__':
    build_icons(Path(__file__).resolve().parent.parent / '_site' / 'admin-app')
