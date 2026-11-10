# Construit assets/sfx/sfx.wav (tous les bruitages bout à bout) + sfx.json (début/durée de chaque son).
# Sources CC0 : packs Kenney (impact-sounds, rpg-audio, interface-sounds) et OpenGameArt
# (rpg sound pack d'artisticdude, zombies d'artisticdude, battle sound effects d'Ogrebane).
import subprocess, numpy as np, json, sys, os, glob, wave
A = sys.argv[1]; OUT = sys.argv[2]
SR = 22050
def g(p): return sorted(glob.glob(os.path.join(A, p)))
BANK = {
  'swing':  g('oga-battle/battle_sound_effects/swish_*.wav') + g('oga-rpg-pack/RPG Sound Pack/battle/swing*.wav'),
  'hit':    g('impact-sounds/impactPunch_medium_*.ogg'),
  'slice':  g('rpg-audio/knifeSlice*.ogg') + g('rpg-audio/chop.ogg'),
  'heavy':  g('impact-sounds/impactPunch_heavy_*.ogg'),
  'metal':  g('impact-sounds/impactMetal_heavy_*.ogg'),
  'metalm': g('impact-sounds/impactMetal_medium_*.ogg')[:3],
  'bell':   g('impact-sounds/impactBell_heavy_*.ogg')[:3],
  'thud':   g('impact-sounds/impactSoft_heavy_*.ogg'),
  'step':   g('impact-sounds/footstep_concrete_*.ogg'),
  'cloth':  g('rpg-audio/cloth*.ogg'),
  'coin':   g('rpg-audio/handleCoins*.ogg') + g('oga-rpg-pack/RPG Sound Pack/inventory/coin*.wav'),
  'pickup': g('oga-rpg-pack/RPG Sound Pack/inventory/metal-small*.wav'),
  'equip':  g('oga-rpg-pack/RPG Sound Pack/inventory/armor-light.wav') + g('oga-rpg-pack/RPG Sound Pack/inventory/chainmail*.wav'),
  'bottle': g('oga-rpg-pack/RPG Sound Pack/inventory/bottle.wav') + g('oga-rpg-pack/RPG Sound Pack/inventory/bubble*.wav'),
  'creak':  g('rpg-audio/creak*.ogg') + g('rpg-audio/metalLatch.ogg'),
  'rubble': g('impact-sounds/impactMining_*.ogg') + g('impact-sounds/impactWood_heavy_*.ogg')[:2],
  'click':  g('interface-sounds/click_00[1-3].ogg') + g('interface-sounds/select_00[1-2].ogg'),
  'zombie': g('oga-zombies/zombies/zombie-*.wav')[:12],
  'shade':  g('oga-rpg-pack/RPG Sound Pack/NPC/shade/shade*.wav')[:8],
  'ogre':   g('oga-rpg-pack/RPG Sound Pack/NPC/ogre/ogre*.wav'),
  'beast':  g('oga-rpg-pack/RPG Sound Pack/NPC/gutteral beast/mnstr*.wav')[:8],
  'giant':  g('oga-rpg-pack/RPG Sound Pack/NPC/giant/giant*.wav'),
  'draw':   g('oga-rpg-pack/RPG Sound Pack/battle/sword-unsheathe*.wav')[:3],
  'magic':  g('oga-rpg-pack/RPG Sound Pack/battle/magic1.wav'),
}
MAXLEN = {'zombie': 1.6, 'shade': 1.4, 'ogre': 1.6, 'beast': 1.4, 'giant': 2.2, 'bottle': 1.0, 'creak': 1.2, 'magic': 1.0}
def load(f):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()
chunks, meta, pos = [], {}, 0
gap = np.zeros(int(SR * 0.05), np.float32)
for key, files in BANK.items():
    meta[key] = []
    for f in files:
        x = load(f)
        if not len(x): continue
        a = np.abs(x); thr = a.max() * 0.03
        i0 = max(0, int(np.argmax(a > thr)) - int(SR * 0.004))  # on coupe le silence du début
        x = x[i0:]
        L = int(SR * MAXLEN.get(key, 0.9)); x = x[:L]
        i1 = len(x) - int(np.argmax(np.abs(x[::-1]) > thr * 0.3)); x = x[:max(i1, int(SR * 0.05))]
        fo = min(len(x), int(SR * 0.06)); x[-fo:] *= np.linspace(1, 0, fo)  # fondu de fin
        x = x / (np.abs(x).max() + 1e-9) * 0.89  # même volume crête pour tous
        meta[key].append([round(pos / SR, 4), round(len(x) / SR, 4)])
        chunks += [x, gap]; pos += len(x) + len(gap)
    print(key, len(meta[key]))
data = np.concatenate(chunks)
pcm = (np.clip(data, -1, 1) * 32767).astype('<i2')
with wave.open(os.path.join(OUT, 'sfx.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
json.dump(meta, open(os.path.join(OUT, 'sfx.json'), 'w'), separators=(',', ':'))
print('durée totale', round(len(data) / SR, 1), 's')
