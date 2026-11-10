"""Icônes de capacités au style moderne et lisse (silhouettes game-icons.net, CC BY 3.0 :
Lorc, Delapouite, Felbrigg). Dégradé doux, reflet, ombre portée et halo coloré, en 128 px."""
import io, json, os, sys, re
import cairosvg
from PIL import Image, ImageFilter, ImageChops

GI = sys.argv[1]; OUT = sys.argv[2]
N = 128
ICONS = {
    'i_attack': ('lorc/sword-slice.svg', '#ffffff', '#9fb0d0', '#ffd27a'),
    'i_charge': ('delapouite/charging-bull.svg', '#ffe0b0', '#d0702a', '#ff8a3a'),
    'i_whirl': ('lorc/spinning-sword.svg', '#ffffff', '#a0b0d8', '#ff6a5a'),
    'i_potion': ('lorc/heart-bottle.svg', '#ffb0b8', '#d02040', '#ff5a6a'),
    'i_fire': ('lorc/fireball.svg', '#fff4b0', '#ff5a1a', '#ff9a3a'),
    'i_blink': ('lorc/teleport.svg', '#f4e4ff', '#9a5af0', '#c08aff'),
    'i_nova': ('lorc/frozen-orb.svg', '#ffffff', '#4aa8f0', '#8ad8ff'),
    'i_roll': ('felbrigg/dodge.svg', '#ffffff', '#8ad0a0', '#7affb0'),
    'i_shout': ('lorc/shouting.svg', '#ffe0b0', '#e05a2a', '#ff7a3a'),
    'i_bag': ('lorc/knapsack.svg', '#ffe8c8', '#b07a4a', None),
    'i_coin': ('delapouite/two-coins.svg', '#fff4b0', '#e0a020', None),
    'i_key': ('lorc/key.svg', '#fff4b0', '#e0a020', None),
    'i_warrior': ('lorc/visored-helm.svg', '#ffffff', '#b0b8d0', '#ff6a4a'),
    'i_mage': ('delapouite/wizard-face.svg', '#f0e8ff', '#8a7ae0', '#9a8aff'),
    # guerrier v5
    'i_mortal': ('lorc/bloody-sword.svg', '#ffffff', '#c03030', '#ff3a2a'),
    'i_execute': ('lorc/decapitation.svg', '#ffd0c0', '#a01818', '#ff2a1a'),
    'i_leap': ('lorc/heavy-fall.svg', '#ffe8c0', '#d08030', '#ffaa3a'),
    'i_parry': ('lorc/sword-clash.svg', '#ffffff', '#8aa8e0', '#8ac8ff'),
    'i_avatar': ('lorc/muscle-up.svg', '#fff0c0', '#e07020', '#ffb030'),
    'i_shieldslam': ('delapouite/shield-bash.svg', '#ffffff', '#7090c0', '#6ab0ff'),
    'i_arms': ('lorc/crossed-swords.svg', '#ffffff', '#b0a080', '#ffcf6a'),
    'i_fury': ('lorc/spinning-blades.svg', '#ffd8c0', '#d04020', '#ff5a2a'),
    'i_prot': ('lorc/shield-reflect.svg', '#ffffff', '#5a8ad0', '#6ab0ff'),
    'i_blood': ('lorc/bleeding-wound.svg', '#ffb0a0', '#a01010', '#ff2a2a'),
    'i_stun': ('lorc/stoned-skull.svg', '#fff4c0', '#c0a040', '#ffe060'),
    'i_fire2': ('lorc/burning-skull.svg' if False else 'lorc/fireball.svg', '#fff4b0', '#ff5a1a', '#ff9a3a'),
    'i_wave': ('lorc/anvil-impact.svg', '#ffe8c0', '#c06a20', '#ffaa3a'),
    'i_heart': ('lorc/heart-tower.svg', '#ffd0d8', '#c02040', '#ff5a6a'),
    'i_armor': ('lorc/spiked-armor.svg', '#ffffff', '#909ab8', '#9ab0ff'),
    'i_skull': ('lorc/crowned-skull.svg', '#fff0d0', '#b0a070', '#ffcf6a'),
    'i_blades': ('lorc/winged-sword.svg', '#ffffff', '#a0b0e0', '#c0d0ff'),
    'i_fist': ('lorc/mailed-fist.svg', '#ffffff', '#a0a0b0', '#ffaa3a'),
}
hexc = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

def alpha_of(path):
    svg = open(os.path.join(GI, path)).read()
    svg = re.sub(r'<path d="M0 0h512v512H0z"[^>]*/>', '', svg)
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=N, output_height=N)
    return Image.open(io.BytesIO(png)).convert('RGBA').getchannel('A')

out = {}
for name, (f, c1, c2, glow) in ICONS.items():
    a = alpha_of(f)
    pad = 12; inner = N - pad * 2
    a = a.resize((inner, inner), Image.LANCZOS)
    A = Image.new('L', (N, N), 0); A.paste(a, (pad, pad))
    # dégradé vertical doux
    g = Image.new('RGB', (N, N)); G = g.load(); k1, k2 = hexc(c1), hexc(c2)
    for y in range(N):
        t = max(0, min(1, (y - pad) / inner))
        col = tuple(int(k1[i] + (k2[i] - k1[i]) * t) for i in range(3))
        for x in range(N): G[x, y] = col
    body = g.convert('RGBA'); body.putalpha(A)
    # reflet : bord haut-gauche éclairci
    shifted = ImageChops.offset(A, 2, 2)
    rim = ImageChops.subtract(A, shifted).filter(ImageFilter.GaussianBlur(0.6))
    hl = Image.new('RGBA', (N, N), (255, 255, 255, 0)); hl.putalpha(rim.point(lambda v: int(v * 0.7)))
    # ombre portée
    sh = Image.new('RGBA', (N, N), (10, 5, 20, 0)); sh.putalpha(ImageChops.offset(A, 0, 4).filter(ImageFilter.GaussianBlur(3)).point(lambda v: int(v * 0.8)))
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    if glow:
        gl = Image.new('RGBA', (N, N), hexc(glow) + (0,)); gl.putalpha(A.filter(ImageFilter.GaussianBlur(7)).point(lambda v: int(min(255, v * 0.9))))
        im.alpha_composite(gl)
    im.alpha_composite(sh); im.alpha_composite(body); im.alpha_composite(hl)
    out[name] = im

atlas = Image.new('RGBA', (N * len(out), N), (0, 0, 0, 0)); rects = {}
for i, (name, im) in enumerate(out.items()):
    atlas.paste(im, (i * N, 0)); rects[name] = [i * N, 0, N, N]
atlas.save(os.path.join(OUT, 'assets', 'icons_hd.png'), optimize=True)
json.dump(rects, open(os.path.join(OUT, 'assets', 'icons_hd.json'), 'w'), separators=(',', ':'))
print('icônes :', len(rects), atlas.size)
