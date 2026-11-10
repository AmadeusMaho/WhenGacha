# Recorta la fuente de una skin a caracteres latinos y la pasa a woff2 (necesita: pip install fonttools brotli):
#   python scripts/skin-font.py ruta/al/font.ttf public/skins/<skin>/<skin>-font.woff2
# Recorta 印品鸿蒙体 a caracteres latinos y corrige los glifos de ancho completo (tildes, ñ, …, →): ajusta su avance al de la letra
# base (o a su contorno + márgenes) y centra el dibujo. Uso: fixfont.py <entrada.ttf> <salida.woff2>
import sys, unicodedata
from fontTools.ttLib import TTFont
from fontTools import subset
src, out = sys.argv[1], sys.argv[2]
f = TTFont(src)
cm = f.getBestCmap(); hm = f['hmtx']; glyf = f['glyf']
fixed = []
for cp, gname in cm.items():
    if not (0xA0 <= cp <= 0x24F or 0x2010 <= cp <= 0x2248 or cp in (0x2605, 0x2713, 0x20AC)): continue
    adv, lsb = hm[gname]
    if adv != 1000: continue
    g = glyf[gname]
    if g.numberOfContours == 0: continue
    g.recalcBounds(glyf)
    w = g.xMax - g.xMin
    base = unicodedata.normalize('NFD', chr(cp))[0]
    bg = cm.get(ord(base)) if base != chr(cp) else None
    new_adv = max(hm[bg][0], w + 80) if bg else w + 120
    dx = round((new_adv - w) / 2 - g.xMin)
    if g.isComposite():
        for c in g.components: c.x += dx
    else:
        for i, (x, y) in enumerate(g.coordinates): g.coordinates[i] = (x + dx, y)
    g.recalcBounds(glyf)
    hm[gname] = (new_adv, g.xMin)
    fixed.append(chr(cp))
print('corregidos', len(fixed), ''.join(fixed[:60]).encode('unicode_escape')[:200])
opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']
uni = list(range(0x20, 0x7F)) + list(range(0xA0, 0x250)) + list(range(0x2010, 0x2028)) + list(range(0x2030, 0x203B)) + list(range(0x2190, 0x2194)) + [0x2212, 0x2248, 0xD7, 0x2605, 0x2713, 0x20AC]
s = subset.Subsetter(opts); s.populate(unicodes=uni); s.subset(f)
f.flavor = 'woff2'; f.save(out)
