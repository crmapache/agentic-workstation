import sys, wave, numpy as np
def f0_track(path):
    w = wave.open(path); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float)
    hop, win = int(sr*0.01), int(sr*0.04)
    out = []
    for i in range(0, len(x)-win, hop):
        f = x[i:i+win]; f = f - f.mean()
        e = np.sqrt((f**2).mean())
        if e < 300: out.append((i/sr, None)); continue
        ac = np.correlate(f, f, 'full')[win-1:]
        lo, hi = int(sr/400), int(sr/75)
        lag = lo + np.argmax(ac[lo:hi])
        if ac[lag] / ac[0] < 0.45: out.append((i/sr, None)); continue
        out.append((i/sr, sr/lag))
    return out
for path in sys.argv[1:]:
    t = f0_track(path)
    voiced = [(s, f) for s, f in t if f]
    if not voiced: print(path, 'no voice'); continue
    end = voiced[-1][0]
    allf = np.array([f for _, f in voiced])
    last = [f for s, f in voiced if s > end - 0.25]
    prev = [f for s, f in voiced if end - 0.6 < s <= end - 0.25]
    med = np.median(allf)
    # контур последних 0.6 с по 0.1 с
    bins = []
    for k in range(6, 0, -1):
        seg = [f for s, f in voiced if end - k*0.1 < s <= end - (k-1)*0.1]
        bins.append(int(np.median(seg)) if seg else 0)
    print(f"{path}: median {med:.0f} Hz, last0.25s {np.median(last):.0f}, before {np.median(prev) if prev else 0:.0f}, tail contour {bins}")
