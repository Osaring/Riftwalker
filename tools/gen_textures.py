# Génère des textures de pierre réalistes et raccordables (couleur + relief) pour Riftwalker.
# Tout est calculé : aucune image externe, donc pas de problème de droits.
import numpy as np
from scipy import ndimage
from PIL import Image
import sys, os

OUT = sys.argv[1]
N = 512
rng = np.random.default_rng(7)

def noise(sigma, seed):
    r = np.random.default_rng(seed).standard_normal((N, N))
    n = ndimage.gaussian_filter(r, sigma, mode='wrap')
    n -= n.min(); n /= n.max(); return n

def fbm(seed, sigmas=(48, 24, 12, 6, 3, 1.5), weights=None):
    weights = weights or [1, .6, .4, .25, .15, .1]
    acc = sum(w * noise(s, seed + i) for i, (s, w) in enumerate(zip(sigmas, weights)))
    acc -= acc.min(); return acc / acc.max()

yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)

def warp(amount, seed):
    return xx + (noise(18, seed) - .5) * amount, yy + (noise(18, seed + 50) - .5) * amount

def voronoi(pts, X, Y):
    # distances au point le plus proche et au 2e (avec raccord : on teste les 9 copies de la tuile)
    F1 = np.full((N, N), 1e9, np.float32); F2 = F1.copy(); ID = np.zeros((N, N), np.int32)
    for k, (px, py) in enumerate(pts):
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                d = np.hypot(X - (px + ox), Y - (py + oy))
                m1 = d < F1
                F2 = np.where(m1, F1, np.minimum(F2, d)); ID = np.where(m1, k, ID); F1 = np.where(m1, d, F1)
    return F1, F2, ID

def relax(pts, it=3):
    # relaxation de Lloyd : les pierres prennent des tailles régulières
    for _ in range(it):
        _, _, ID = voronoi(pts, xx, yy)
        new = []
        for k, (px, py) in enumerate(pts):
            m = ID == k
            if not m.any(): new.append((px, py)); continue
            # moyenne circulaire (raccord)
            ax = np.angle(np.exp(1j * 2 * np.pi * xx[m] / N).mean()) / (2 * np.pi) * N % N
            ay = np.angle(np.exp(1j * 2 * np.pi * yy[m] / N).mean()) / (2 * np.pi) * N % N
            new.append((ax, ay))
        pts = new
    return pts

def tints(r, n, var):
    l = r.uniform(-1, 1, (n, 1)) * var * 2.2
    c = r.uniform(-1, 1, (n, 3)) * var * .22
    return 1 + l + c

def grain(seed):
    # grain fin de la pierre (cristaux, porosité)
    return (.55 * noise(.6, seed) + .3 * noise(1.3, seed + 1) + .15 * noise(3, seed + 2))

def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

def normal_map(h, strength):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nz = np.ones_like(h)
    l = np.sqrt(gx * gx + gy * gy + nz * nz)
    n = np.stack([-gx / l, gy / l, nz / l], -1)  # convention OpenGL (vert vers le haut)
    return ((n * .5 + .5) * 255).astype(np.uint8)

def save(name, col, h, strength):
    col = np.clip(col, 0, 1)
    Image.fromarray((col * 255).astype(np.uint8)).save(os.path.join(OUT, name + '_c.jpg'), quality=86)
    Image.fromarray(normal_map(h, strength)).save(os.path.join(OUT, name + '_n.jpg'), quality=90)

# ---------------- dalles de pierre (sol) ----------------
def flagstones(name, n_stones, base, var, grout, seed, moss=0):
    r = np.random.default_rng(seed)
    pts = relax([(r.uniform(0, N), r.uniform(0, N)) for _ in range(n_stones)])
    X, Y = warp(14, seed)
    F1, F2, ID = voronoi(pts, X, Y)
    edge = F2 - F1
    rough = fbm(seed + 3)
    stone = sstep(3, 11 + rough * 6, edge)                     # bord biseauté et irrégulier
    tilt = r.uniform(-.12, .12, n_stones)[ID]                    # chaque dalle un peu plus haute/basse
    detail = fbm(seed + 9, (8, 4, 2, 1), [1, .7, .5, .35])
    chips = (noise(2.5, seed + 20) > .82) * stone * .25          # petits éclats
    crack = np.abs(noise(10, seed + 80) - .5) < .012
    crack = ndimage.gaussian_filter(crack.astype(np.float32), .7, mode='wrap') * stone * (fbm(seed + 81) > .7)
    h = stone * (.75 + tilt) + detail * .18 * stone - chips * .3 - crack * .5
    # couleur : chaque dalle a sa teinte, marbrée, avec saleté dans les joints
    tint = tints(r, n_stones, var)
    col = np.array(base)[None, None, :] * tint[ID]
    mott = fbm(seed + 30)[..., None]
    col = col * (.72 + .5 * mott) * (.8 + .3 * detail[..., None]) * (.7 + .6 * grain(seed + 70)[..., None])
    col = col * (.55 + .45 * stone[..., None]) + np.array(grout)[None, None, :] * (1 - stone[..., None])
    wear = sstep(.55, .8, fbm(seed + 40))[..., None] * stone[..., None]
    col = col * (1 - .25 * wear) + .08 * wear                     # zones usées plus claires
    if moss:
        m = sstep(.58, .75, fbm(seed + 50)) * (1 - stone * .7)
        col = col * (1 - m[..., None] * moss) + np.array([.18, .26, .1])[None, None, :] * m[..., None] * moss
    col *= (.75 + .25 * sstep(0, 14, edge))[..., None]            # ombre dans les joints
    col *= (1 - .3 * np.clip(crack * 2, 0, 1))[..., None]
    save(name, col, h, 3.2)

# ---------------- murs en blocs de pierre ----------------
def blockwall(name, rows, base, var, mortar, seed, moss=0):
    r = np.random.default_rng(seed)
    rh = N / rows
    X, Y = warp(6, seed)
    row = np.floor(Y / rh).astype(int) % rows
    inrow = (Y % rh)
    h = np.zeros((N, N), np.float32); ID = np.zeros((N, N), np.int32); ed = np.zeros((N, N), np.float32)
    bid = 0
    for k in range(rows):
        widths = []; tot = 0
        while tot < N - 90:
            w = r.uniform(90, 170); widths.append(w); tot += w
        widths = np.array(widths) * N / sum(widths)
        cuts = np.concatenate([[0], np.cumsum(widths)]) + r.uniform(0, N)
        m = row == k
        xs = X[m] % N
        # position dans le bloc : on teste chaque bloc (avec raccord horizontal)
        best_d = np.full(xs.shape, 1e9); best_i = np.zeros(xs.shape, int)
        for i in range(len(widths)):
            a, b = cuts[i] % N, (cuts[i] + widths[i])
            for off in (-N, 0, N):
                inside = (xs >= a + off) & (xs < a + off + widths[i])
                d = np.minimum(xs - (a + off), a + off + widths[i] - xs)
                best_d = np.where(inside, d, best_d); best_i = np.where(inside, bid + i, best_i)
        ev = np.minimum(inrow[m], rh - inrow[m])
        ed[m] = np.minimum(best_d, ev); ID[m] = best_i
        bid += len(widths)
    rough = fbm(seed + 3)
    block = sstep(2.5, 9 + rough * 9, ed)
    detail = fbm(seed + 9, (10, 5, 2.5, 1.2), [1, .7, .5, .35])
    bulge = r.uniform(-.1, .1, bid + 1)[ID]
    chips = (noise(3, seed + 21) > .8) * block * .3
    h = block * (.7 + bulge) + detail * .22 * block - chips * .35
    tint = tints(r, bid + 1, var)
    col = np.array(base)[None, None, :] * tint[ID]
    mott = fbm(seed + 30)[..., None]
    col = col * (.68 + .55 * mott) * (.8 + .3 * detail[..., None]) * (.7 + .6 * grain(seed + 70)[..., None])
    col = col * (.5 + .5 * block[..., None]) + np.array(mortar)[None, None, :] * (1 - block[..., None])
    # coulures sombres verticales (humidité) et salissure en bas de la tuile
    streak = ndimage.gaussian_filter(np.random.default_rng(seed + 60).standard_normal((N, N)), (60, 5), mode='wrap')
    streak = sstep(.5, 2.0, streak / streak.std()) * fbm(seed + 61)
    col *= (1 - .3 * streak)[..., None]
    if moss:
        m = sstep(.55, .72, fbm(seed + 50)) * (1 - block * .6)
        col = col * (1 - m[..., None] * moss) + np.array([.16, .24, .09])[None, None, :] * m[..., None] * moss
    col *= (.7 + .3 * sstep(0, 10, ed))[..., None]
    save(name, col, h, 3.6)

# ---------------- roche / éboulis ----------------
def rock(name, n, base, var, seed, dark=1.0):
    r = np.random.default_rng(seed)
    pts = [(r.uniform(0, N), r.uniform(0, N)) for _ in range(n)]
    X, Y = warp(30, seed)
    F1, F2, ID = voronoi(pts, X, Y)
    big = fbm(seed + 1)
    cob = sstep(0, 22, F2 - F1) * (1 - F1 / (F1.max() + 1))
    detail = fbm(seed + 9, (6, 3, 1.5, .8), [1, .7, .5, .4])
    h = big * .6 + cob * .55 + detail * .25
    tint = tints(r, n, var)
    col = np.array(base)[None, None, :] * tint[ID]
    col = col * (.45 + .75 * h[..., None]) * (.8 + .3 * detail[..., None]) * (.7 + .6 * grain(seed + 70)[..., None]) * dark
    save(name, col, h, 4.2)

os.makedirs(OUT, exist_ok=True)
flagstones('crypt_floor', 26, [.42, .40, .39], .07, [.06, .05, .05], 11)
blockwall('crypt_wall', 6, [.40, .37, .35], .08, [.07, .06, .06], 12)
flagstones('ruins_floor', 20, [.44, .42, .35], .08, [.08, .08, .05], 21, moss=.75)
blockwall('ruins_wall', 5, [.46, .43, .37], .08, [.09, .08, .06], 22, moss=.8)
rock('cave_floor', 70, [.31, .31, .34], .08, 31)
rock('cave_wall', 40, [.29, .29, .33], .08, 32)
rock('rubble', 90, [.21, .20, .19], .1, 41, .9)
print('ok')
