import math, sys
from PIL import Image, ImageDraw, ImageFilter
def grow(m, px):
    return m.filter(ImageFilter.GaussianBlur(px)).point(lambda v: 255 if v > 8 else 0)
S = 2  # supersample
N = 1024 * S
ORANGE = (255, 122, 26)
BLUE = (90, 162, 255)

def ring_mask(cx, cy, r, w):
    m = Image.new('L', (N, N), 0)
    d = ImageDraw.Draw(m)
    d.ellipse([cx - r - w/2, cy - r - w/2, cx + r + w/2, cy + r + w/2], fill=255)
    d.ellipse([cx - r + w/2, cy - r + w/2, cx + r - w/2, cy + r - w/2], fill=0)
    return m

def mark(scale=1.0, size=N):
    """Two interlocked rings on transparent background."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    c = size / 2
    r = 0.215 * size * scale
    w = 0.085 * size * scale
    off = 0.118 * size * scale
    global N
    old = N; N = size
    blue = ring_mask(c + off, c, r, w)
    orange = ring_mask(c - off, c, r, w)
    N = old
    img.paste(Image.new('RGBA', (size, size), BLUE + (255,)), (0, 0), blue)
    img.paste(Image.new('RGBA', (size, size), ORANGE + (255,)), (0, 0), orange)
    # interlock: blue passes over orange at the top crossing
    top = Image.new('L', (size, size), 0)
    ImageDraw.Draw(top).rectangle([0, 0, size, c], fill=255)
    from PIL import ImageChops
    over = ImageChops.multiply(ImageChops.multiply(blue, orange), top)
    # thin dark gap around the overlapping part so the weave reads
    gap = grow(over, 0.006 * size)
    img.paste(Image.new('RGBA', (size, size), (14, 15, 18, 255)), (0, 0), ImageChops.multiply(gap, orange))
    img.paste(Image.new('RGBA', (size, size), BLUE + (255,)), (0, 0), ImageChops.multiply(blue, top))
    # bottom crossing: orange passes over blue, with the same dark gap
    bottom = ImageChops.invert(top)
    over2 = ImageChops.multiply(ImageChops.multiply(blue, orange), bottom)
    gap2 = grow(over2, 0.006 * size)
    img.paste(Image.new('RGBA', (size, size), (14, 15, 18, 255)), (0, 0), ImageChops.multiply(gap2, ImageChops.multiply(blue, bottom)))
    img.paste(Image.new('RGBA', (size, size), ORANGE + (255,)), (0, 0), ImageChops.multiply(orange, bottom))
    return img

def background(size):
    bg = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(bg)
    for y in range(size):
        t = y / size
        col = tuple(int(a + (b - a) * t) for a, b in zip((30, 32, 40), (12, 13, 16)))
        d.line([(0, y), (size, y)], fill=col)
    return bg

full = background(N)
m = mark(1.0, N)
full.paste(m, (0, 0), m)
full.resize((1024, 1024), Image.LANCZOS).save('assets/icon.png')
# splash: mark only, transparent
mark(1.0, N).resize((1024, 1024), Image.LANCZOS).save('assets/splash-icon.png')
# android adaptive foreground: keep inside the safe zone
mark(0.7, N).resize((1024, 1024), Image.LANCZOS).save('assets/android-icon-foreground.png')
Image.new('RGB', (1024, 1024), (14, 15, 18)).save('assets/android-icon-background.png')
mono = mark(0.7, N).resize((1024, 1024), Image.LANCZOS)
a = mono.split()[3]
Image.merge('RGBA', (a.point(lambda v: 255), a.point(lambda v: 255), a.point(lambda v: 255), a)).save('assets/android-icon-monochrome.png')
full.resize((48, 48), Image.LANCZOS).save('assets/favicon.png')
print('ok')
