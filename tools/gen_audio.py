#!/usr/bin/env python3
"""
Procedural audio for the night-shift demo.

Everything here is synthesised from scratch with numpy (no samples), then
encoded to Ogg Vorbis with ffmpeg. Run:  python3 tools/gen_audio.py

Outputs (public/audio/):
  musicbox.ogg   - original detuned music-box waltz, distant + reverberant (loop)
  ambience.ogg   - low drone / air / bowed-metal bed (loop)
  fan.ogg        - desk fan: motor hum + blade chop + air (loop)
  buzz.ogg       - mains hum of a tired light fixture (loop)
  roomtone.ogg   - HVAC rumble / room tone (loop)
  clank.ogg, creak.ogg, thud.ogg, drip.ogg, zap.ogg, relay.ogg - one-shots
"""
import os
import subprocess
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "audio")
TMP = os.path.join(os.path.dirname(__file__), "..", ".audio_tmp")
rng = np.random.default_rng(1987)


# ---------------------------------------------------------------- helpers
def t_axis(sec):
    return np.arange(int(sec * SR)) / SR


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def fft_filter(x, fn):
    """Static zero-phase filter: fn(freqs) -> magnitude response."""
    n = len(x)
    nfft = 1 << (n - 1).bit_length()
    X = np.fft.rfft(x, nfft)
    f = np.fft.rfftfreq(nfft, 1 / SR)
    return np.fft.irfft(X * fn(f), nfft)[:n]


def lowpass(x, fc, order=2):
    return fft_filter(x, lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order)))


def highpass(x, fc, order=2):
    return fft_filter(x, lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order)))


def bandpass(x, fc, q):
    bw = fc / q
    return fft_filter(x, lambda f: 1 / np.sqrt(1 + ((f - fc) / (bw / 2)) ** 2))


def peaks(x, centers, q, gain):
    """Add resonant peaks (for body / cabinet colour)."""
    def fn(f):
        r = np.ones_like(f)
        for c in centers:
            bw = c / q
            r += gain / (1 + ((f - c) / (bw / 2)) ** 2)
        return r
    return fft_filter(x, fn)


def white(sec):
    return rng.standard_normal(int(sec * SR))


def pink(sec):
    w = white(sec)
    return fft_filter(w, lambda f: 1 / np.sqrt(np.maximum(f, 10)))


def brown(sec):
    w = white(sec)
    return fft_filter(w, lambda f: 1 / np.maximum(f, 8))


def norm(x, peak=0.9):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def smooth_noise(sec, rate, seed_shift=0):
    """Slowly varying random control signal in [-1, 1]."""
    n = int(sec * SR)
    k = max(4, int(sec * rate) + 4)
    pts = rng.uniform(-1, 1, k)
    xs = np.linspace(0, n, k)
    # cosine interpolation
    idx = np.arange(n)
    j = np.clip(np.searchsorted(xs, idx) - 1, 0, k - 2)
    fr = (idx - xs[j]) / (xs[j + 1] - xs[j])
    fr = (1 - np.cos(fr * np.pi)) / 2
    return pts[j] * (1 - fr) + pts[j + 1] * fr


def make_ir(sec, decay, damp_hz=3500, pre=0.0, seed=0):
    """Stereo synthetic room impulse response (decaying, darkening noise)."""
    r = np.random.default_rng(seed)
    n = int(sec * SR)
    t = np.arange(n) / SR
    out = []
    for ch in range(2):
        nz = r.standard_normal(n) * np.exp(-t * 6.9 / decay)
        # darken over time: crossfade between bright and dark versions
        dark = lowpass(nz, damp_hz * 0.25, 1)
        bright = lowpass(nz, damp_hz, 1)
        mix = np.clip(t / decay, 0, 1)
        ir = bright * (1 - mix) + dark * mix
        if pre > 0:
            ir = np.concatenate([np.zeros(int(pre * SR)), ir])[:n]
        # a few early reflections
        for _ in range(8):
            d = int(r.uniform(0.008, 0.07) * SR)
            if d < n:
                ir[d] += r.uniform(-0.6, 0.6)
        out.append(ir / np.sqrt(np.sum(ir ** 2)))
    return np.stack(out)


def convolve(x, ir, circular=False):
    """x: mono or (2,n). ir: (2,m). Returns (2, n[+m])."""
    if x.ndim == 1:
        x = np.stack([x, x])
    n, m = x.shape[1], ir.shape[1]
    L = n + m - 1
    nfft = 1 << (L - 1).bit_length()
    out = []
    for ch in range(2):
        y = np.fft.irfft(np.fft.rfft(x[ch], nfft) * np.fft.rfft(ir[ch], nfft), nfft)[:L]
        if circular:
            # fold the tail back onto the start -> seamless loop
            yy = y[:n].copy()
            tail = y[n:]
            while len(tail):
                k = min(len(tail), n)
                yy[:k] += tail[:k]
                tail = tail[k:]
            y = yy
        out.append(y)
    return np.stack(out)


def loopify(x, fade_sec=1.0):
    """Crossfade the end into the start so the file loops seamlessly.
    x is generated `fade_sec` longer than the target loop length."""
    f = int(fade_sec * SR)
    if x.ndim == 1:
        x = x[None, :]
    body = x[:, :-f].copy()
    tail = x[:, -f:]
    w = np.sin(np.linspace(0, np.pi / 2, f)) ** 2
    body[:, :f] = body[:, :f] * w + tail * (1 - w)
    return body


def stereo(x, width=0.0, delay_ms=0.0):
    if x.ndim == 2:
        return x
    if delay_ms:
        d = int(delay_ms * SR / 1000)
        r = np.concatenate([np.zeros(d), x[:-d]])
        return np.stack([x, x * (1 - width) + r * width])
    return np.stack([x, x])


def write(name, x, peak=0.9, q=6):
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    x = stereo(np.asarray(x))
    x = norm(x, peak)
    pcm = (np.clip(x.T, -1, 1) * 32767).astype("<i2")
    wav = os.path.join(TMP, name + ".wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    ogg = os.path.join(OUT, name + ".ogg")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav,
                    "-c:a", "libvorbis", "-q:a", str(q), ogg], check=True)
    print(f"  {name}.ogg  {x.shape[1] / SR:.1f}s")


# ---------------------------------------------------------------- music box
def tine(freq, dur, vel=1.0):
    """Music-box tine: cantilever beam partials (1, ~5.9, ~17) + pluck click."""
    t = t_axis(dur)
    detune = 2 ** (rng.normal(0, 7) / 1200)  # each tine a bit off
    f = freq * detune
    s = np.sin(2 * np.pi * f * t) * np.exp(-t / 2.6)
    s += 0.35 * np.sin(2 * np.pi * f * 2.0 * t + 0.3) * np.exp(-t / 0.9)
    s += 0.22 * np.sin(2 * np.pi * f * 5.93 * t) * np.exp(-t / 0.25)
    s += 0.08 * np.sin(2 * np.pi * f * 17.1 * t) * np.exp(-t / 0.05)
    click = white(0.006) * np.exp(-np.arange(int(0.006 * SR)) / (0.0015 * SR))
    s[:len(click)] += 0.25 * click
    att = np.minimum(1, t / 0.0015)
    return s * att * vel


def music_box():
    # Original waltz in D minor, 3/4, ~58 bpm. (beat, midi, velocity)
    bpm = 58
    beat = 60 / bpm
    A4, Bb4, B4, C5, Cs5, D5, E5, F5, G5, Gs4, A5, G4 = 69, 70, 71, 72, 73, 74, 76, 77, 79, 68, 81, 67
    mel_bars = [
        [(0, A4), (1, D5), (2, F5)],
        [(0, E5), (2, D5)],
        [(0, Cs5), (1, D5), (2, E5)],
        [(0, A4)],
        [(0, Bb4), (1, D5), (2, G5)],
        [(0, F5), (2, E5)],
        [(0, D5), (1, Cs5), (2, Bb4)],
        [(0, A4)],
        [(0, A4), (1, D5), (2, F5)],
        [(0, A5), (2, G5)],
        [(0, F5), (1, E5), (2, D5)],
        [(0, Cs5), (2, A4)],
        [(0, Bb4), (1, A4), (2, Gs4)],      # the chromatic sag
        [(0, A4), (1, F5), (2, E5)],
        [(0, D5), (1, Cs5), (1.5, E5), (2, Cs5)],
        [(0, D5)],
    ]
    # waltz accompaniment (root on 1, chord on 2 & 3), music-box low register
    chords = [
        (62, (65, 69)), (57, (64, 67)), (57, (64, 67)), (62, (65, 69)),
        (55, (62, 70)), (57, (62, 65)), (57, (64, 67)), (62, (65, 69)),
        (62, (65, 69)), (58, (62, 67)), (62, (65, 69)), (57, (64, 67)),
        (52, (58, 64)), (62, (65, 69)), (57, (64, 67)), (62, (65, 69)),
    ]
    bars = len(mel_bars)
    loop = bars * 3 * beat
    n = int(loop * SR)
    buf = np.zeros(n + int(6 * SR))

    def put(time, midi, vel):
        time += rng.normal(0, 0.012)  # mechanical sloppiness
        s = tine(midi_hz(midi), 5.0, vel)
        i = int(max(0, time) * SR)
        buf[i:i + len(s)] += s[:len(buf) - i]

    for b in range(bars):
        t0 = b * 3 * beat
        for (bt, m) in mel_bars[b]:
            put(t0 + bt * beat, m, 0.9 * rng.uniform(0.85, 1.0))
            if rng.random() < 0.18:   # occasional ghost octave
                put(t0 + bt * beat + 0.02, m + 12, 0.18)
        root, (c1, c2) = chords[b]
        put(t0, root - 12, 0.55)
        for bt in (1, 2):
            put(t0 + bt * beat, c1 - 12, 0.28)
            put(t0 + bt * beat + 0.015, c2 - 12, 0.25)

    # fold tail (ringing notes) back onto start -> seamless
    dry = buf[:n].copy()
    tail = buf[n:]
    dry[:len(tail)] += tail

    # wow & flutter: tired spring motor. Resample along a wobbling time base.
    t = np.arange(n) / SR
    wow = 0.0045 * np.sin(2 * np.pi * t / loop * 7) + 0.0012 * np.sin(2 * np.pi * t * 5.3 / loop * 12)
    pos = np.arange(n) + np.cumsum(wow) * SR / 40
    pos = np.mod(pos, n)
    dry = np.interp(pos, np.arange(n), dry, period=n)

    # tiny tinny speaker / box body, then distance
    dry = peaks(dry, [900, 2300], 3, 1.2)
    dry = highpass(dry, 250, 2)
    dry = lowpass(dry, 4200, 2)

    ir = make_ir(4.5, 3.8, damp_hz=2600, pre=0.03, seed=3)
    wet = convolve(dry, ir, circular=True)
    out = 0.55 * stereo(dry) + 0.9 * wet
    # faint record-ish crackle
    cr = np.zeros(n)
    idx = rng.integers(0, n, 900)
    cr[idx] = rng.uniform(-1, 1, 900)
    cr = highpass(cr, 2000)
    out += 0.05 * np.max(np.abs(out)) * stereo(cr)
    write("musicbox", out, 0.8)


# ---------------------------------------------------------------- ambience bed
def ambience():
    L = 64.0
    fade = 2.0
    sec = L + fade
    t = t_axis(sec)
    n = len(t)

    # sub drone: D1 cluster with slow beating
    drone = np.zeros(n)
    for f, a in [(36.71, 1.0), (36.95, 0.8), (55.0, 0.5), (73.4, 0.25), (77.8, 0.12)]:
        drone += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28))
    drone *= 0.75 + 0.25 * np.sin(2 * np.pi * t / 16)

    # air / wind through vents: pink noise in a wandering band
    air = np.zeros(n)
    nz = pink(sec)
    blk = 4096
    ctrl = smooth_noise(sec, 0.15)
    for i in range(0, n, blk):
        seg = nz[i:i + blk]
        fc = 220 + 160 * ctrl[i]
        air[i:i + blk] = seg
    air = bandpass(air, 260, 1.2) * (0.6 + 0.4 * smooth_noise(sec, 0.1))

    # bowed metal: inharmonic partials that swell in and out
    metal = np.zeros(n)
    base = 196.0
    for k, ratio in enumerate([1.0, 1.414, 2.31, 2.76, 3.52, 4.13]):
        f = base * ratio * (1 + rng.normal(0, 0.002))
        env = np.clip(smooth_noise(sec, 0.08), 0, 1) ** 2
        metal += env * np.sin(2 * np.pi * f * t + 0.6 * np.sin(2 * np.pi * 0.11 * t + k)) / (k + 1)
    metal = lowpass(metal, 1800)

    bed = 1.0 * drone + 0.55 * norm(air, 1) + 0.18 * norm(metal, 1)
    ir = make_ir(5.0, 4.5, damp_hz=1500, seed=7)
    wet = convolve(bed * 0.5, ir)[:, :n]
    out = stereo(bed) * 0.7 + wet * 0.6
    out = loopify(out, fade)
    write("ambience", out, 0.85)


# ---------------------------------------------------------------- desk fan
def fan():
    L = 8.0
    sec = L
    t = t_axis(sec)
    n = len(t)
    # make every periodic component an integer number of cycles in L -> seamless
    def hz(f):
        return round(f * L) / L
    rps = hz(19.5)       # ~1170 rpm
    bpf = 3 * rps        # 3 blades
    air = pink(sec)
    air = bandpass(air, 900, 0.7)
    # blade chop modulates the air
    chop = 1 + 0.35 * np.sin(2 * np.pi * bpf * t) + 0.1 * np.sin(2 * np.pi * rps * t)
    air *= chop
    motor = (np.sin(2 * np.pi * hz(100) * t) * 0.5 + np.sin(2 * np.pi * hz(200) * t) * 0.2 +
             np.sin(2 * np.pi * hz(300) * t) * 0.05)
    whine = 0.06 * np.sin(2 * np.pi * hz(bpf * 23) * t)
    # loose cage rattle, once per revolution, slightly random
    rattle = np.zeros(n)
    per = int(SR / rps)
    for i in range(0, n, per):
        if rng.random() < 0.55:
            k = min(400, n - i)
            rattle[i:i + k] += rng.standard_normal(k) * np.exp(-np.arange(k) / 60)
    rattle = bandpass(rattle, 3200, 2)
    out = norm(air, 1) * 0.9 + motor * 0.35 + whine + 0.12 * norm(rattle, 1)
    out = lowpass(out, 7000)
    # circular smoothing is implicit since all tones fit the loop; crossfade noise seam
    x = np.concatenate([out, out[:SR]])
    out = loopify(np.stack([x, np.roll(x, 337)]), 1.0)
    write("fan", out, 0.8)


# ---------------------------------------------------------------- light buzz
def buzz():
    L = 4.0
    t = t_axis(L + 0.5)
    n = len(t)
    s = np.zeros(n)
    for h, a in [(1, 0.4), (2, 1.0), (3, 0.3), (4, 0.5), (6, 0.25), (8, 0.12), (10, 0.06)]:
        s += a * np.sin(2 * np.pi * 50 * h * t + h)
    # ballast grit: clipped sine harmonics
    grit = np.tanh(6 * np.sin(2 * np.pi * 100 * t)) * 0.15
    grit = highpass(grit, 1500)
    flick = 1 + 0.08 * smooth_noise(L + 0.5, 3)
    s = (s + grit) * flick
    s = peaks(s, [1200], 4, 0.6)
    write("buzz", loopify(stereo(s), 0.5), 0.7)


# ---------------------------------------------------------------- room tone
def roomtone():
    L = 10.0
    sec = L + 1
    t = t_axis(sec)
    r = brown(sec)
    r = lowpass(r, 180)
    hvac = pink(sec)
    hvac = bandpass(hvac, 120, 0.8)
    hum = 0.2 * np.sin(2 * np.pi * 60 * t) + 0.1 * np.sin(2 * np.pi * 120 * t)
    out = norm(r, 1) * 0.8 + norm(hvac, 1) * 0.4 + hum
    out = np.stack([out, np.roll(out, 1500)])
    write("roomtone", loopify(out, 1.0), 0.8)


# ---------------------------------------------------------------- one-shots
def clank():
    """Distant metal pipe struck somewhere in the building."""
    sec = 5.0
    t = t_axis(sec)
    s = np.zeros(len(t))
    for ratio, dec, a in [(1, 1.2, 1), (2.76, 0.9, 0.7), (5.40, 0.6, 0.5), (8.93, 0.35, 0.35),
                          (13.34, 0.2, 0.25), (1.51, 1.0, 0.4)]:
        s += a * np.sin(2 * np.pi * 180 * ratio * t) * np.exp(-t / dec)
    s[:200] += white(200 / SR) * np.linspace(1, 0, 200)
    s = lowpass(s, 1600)  # far away
    ir = make_ir(4.0, 3.5, damp_hz=1200, pre=0.04, seed=11)
    wet = convolve(s, ir)[:, :len(t)]
    write("clank", stereo(s) * 0.25 + wet, 0.7)


def creak():
    """Slow creak: stick-slip friction pulses exciting a wooden resonance."""
    sec = 3.5
    n = int(sec * SR)
    s = np.zeros(n)
    tpos = 0.15
    rate = 28.0
    while tpos < sec - 0.6:
        i = int(tpos * SR)
        k = 300
        s[i:i + k] += np.exp(-np.arange(k) / 40) * rng.uniform(0.6, 1)
        rate += rng.normal(0.4, 2.0)
        rate = np.clip(rate, 14, 60)
        tpos += 1 / rate
    env = np.sin(np.linspace(0, np.pi, n)) ** 0.7
    s *= env
    s = peaks(s, [420, 870, 1430], 8, 6)
    s = bandpass(s, 700, 0.8)
    ir = make_ir(3.0, 2.5, damp_hz=1500, seed=12)
    write("creak", stereo(s) * 0.4 + convolve(s, ir)[:, :n], 0.6)


def thud():
    sec = 3.0
    t = t_axis(sec)
    f = 55 * np.exp(-t * 3) + 38
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t / 0.35)
    s += lowpass(white(sec), 300) * np.exp(-t / 0.08) * 0.6
    ir = make_ir(3.0, 2.8, damp_hz=600, seed=13)
    write("thud", stereo(s) * 0.5 + convolve(s, ir)[:, :len(t)], 0.8)


def drip():
    sec = 1.6
    t = t_axis(sec)
    f = 1400 + 1600 * np.exp(-t / 0.012)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t / 0.03)
    ir = make_ir(1.5, 1.3, damp_hz=4000, seed=14)
    write("drip", stereo(s) * 0.3 + convolve(s, ir)[:, :len(t)], 0.5)


def zap():
    """Electrical arc when a light flickers."""
    sec = 0.6
    t = t_axis(sec)
    n = len(t)
    s = np.tanh(8 * np.sin(2 * np.pi * 100 * t)) * white(sec) * 0.6
    gate = (smooth_noise(sec, 60) > -0.1).astype(float)
    s *= gate * np.exp(-t / 0.25)
    s = highpass(s, 600)
    write("zap", s, 0.5)


def relay():
    """Heavy relay / breaker clack (door light switching)."""
    sec = 0.5
    t = t_axis(sec)
    s = white(sec) * np.exp(-t / 0.004)
    s += 0.6 * np.sin(2 * np.pi * 1900 * t) * np.exp(-t / 0.02)
    s += 0.5 * np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.05)
    s2 = np.zeros_like(s)
    d = int(0.035 * SR)
    s2[d:] = s[:-d] * 0.4   # bounce
    s = lowpass(s + s2, 5000)
    ir = make_ir(0.6, 0.4, damp_hz=3000, seed=15)
    write("relay", stereo(s) + 0.3 * convolve(s, ir)[:, :len(t)], 0.6)


def chime():
    """Building PA lure: a tired two-tone party chime from a cheap ceiling speaker."""
    sec = 4.0
    t = t_axis(sec)
    s = np.zeros(len(t))
    for start, f in [(0.0, 784.0), (0.42, 622.25), (0.84, 523.25)]:
        i = int(start * SR)
        tt = t[: len(t) - i]
        tone = (np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt / 0.2)
                + 0.2 * np.sin(2 * np.pi * f * 5.4 * tt) * np.exp(-tt / 0.08))
        s[i:] += tone * np.exp(-tt / 0.9) * np.minimum(1, tt / 0.003)
    # warped tape + tiny speaker distortion
    wob = 1 + 0.004 * np.sin(2 * np.pi * 3.1 * t)
    s = np.interp(np.cumsum(wob) - 1, np.arange(len(s)), s)
    s = np.tanh(2.5 * s)
    s = bandpass(s, 1400, 0.9)
    ir = make_ir(3.0, 2.6, damp_hz=2000, pre=0.02, seed=16)
    write("chime", stereo(s) * 0.4 + convolve(s, ir)[:, :len(t)], 0.7)


# ---------------------------------------------------------------- animatronics
def formant_voice(syll, f0=110, dur=0.18, crush=8, ring=0, gap=0.05, glide=0.0):
    """Robotic sing-song voice: sawtooth through vowel formants, bit-crushed."""
    VOW = {'a': (730, 1090, 2440), 'e': (530, 1840, 2480), 'i': (270, 2290, 3010),
           'o': (570, 840, 2410), 'u': (300, 870, 2240)}
    out = []
    for k, v in enumerate(syll):
        t = t_axis(dur)
        f = f0 * (1 + glide * k) * (1 + 0.04 * np.sin(2 * np.pi * 5 * t))
        ph = 2 * np.pi * np.cumsum(f) / SR
        saw = 2 * ((ph / (2 * np.pi)) % 1) - 1
        sig = np.zeros(len(t))
        for fm, a in zip(VOW[v], (1, 0.6, 0.25)):
            sig += a * bandpass(saw, fm, 8)
        env = np.minimum(1, t / 0.01) * np.minimum(1, (dur - t) / 0.04)
        out.append(sig * env)
        out.append(np.zeros(int(gap * SR)))
    x = np.concatenate(out)
    if ring:
        x *= np.sin(2 * np.pi * ring * np.arange(len(x)) / SR)
    # bit crush + sample-and-hold for a cheap speaker chip
    q = 2 ** crush
    x = np.round(norm(x, 1) * q) / q
    hold = 3
    x = np.repeat(x[::hold], hold)[:len(x)]
    return x


def speaker(x, lo=350, hi=3800):
    x = highpass(x, lo)
    x = lowpass(x, hi)
    return np.tanh(2.0 * x)


def step_heavy():
    sec = 0.9
    t = t_axis(sec)
    thump = np.sin(2 * np.pi * (60 + 40 * np.exp(-t / 0.03)) * t) * np.exp(-t / 0.12)
    clank = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, a, d in [(420, 0.4, 0.15), (1130, 0.25, 0.08), (2710, 0.12, 0.05)])
    whirr = bandpass(white(sec), 1800, 6) * np.exp(-((t - 0.25) / 0.12) ** 2) * 0.5
    s = thump + 0.6 * clank + whirr
    ir = make_ir(1.2, 1.0, damp_hz=2500, seed=21)
    write("step_heavy", stereo(s) * 0.7 + 0.5 * convolve(s, ir)[:, :len(t)], 0.8)


def step_light():
    sec = 0.6
    t = t_axis(sec)
    s = np.zeros(len(t))
    for off in (0.0, 0.11):
        i = int(off * SR)
        tt = t[: len(t) - i]
        s[i:] += (np.sin(2 * np.pi * 180 * tt) * np.exp(-tt / 0.04) + 0.5 * bandpass(white(len(tt) / SR), 2500, 3) * np.exp(-tt / 0.015))
    ir = make_ir(1.0, 0.8, damp_hz=3000, seed=22)
    write("step_light", stereo(s) * 0.7 + 0.4 * convolve(s, ir)[:, :len(t)], 0.7)


def greet_sunny():
    v = formant_voice('aeo', f0=92, dur=0.26, crush=6, gap=0.04, glide=-0.06)
    v = np.concatenate([np.zeros(int(0.05 * SR)), v, np.zeros(int(0.8 * SR))])
    v = speaker(v, 250, 3200)
    ir = make_ir(1.5, 1.2, damp_hz=2200, seed=23)
    write("greet_sunny", stereo(v) * 0.7 + 0.5 * convolve(v, ir)[:, :len(v)], 0.8)


def greet_pip():
    v = formant_voice('eieie', f0=210, dur=0.09, crush=5, gap=0.06, glide=0.05)
    v = np.concatenate([v, np.zeros(int(0.6 * SR))])
    v = speaker(v, 500, 4500)
    ir = make_ir(1.2, 1.0, damp_hz=3000, seed=24)
    write("greet_pip", stereo(v) * 0.7 + 0.5 * convolve(v, ir)[:, :len(v)], 0.8)


def horn():
    """Out-of-tune party horn (Tootie)."""
    sec = 1.4
    t = t_axis(sec)
    f = 520 + 60 * np.sin(2 * np.pi * 3 * t) - 120 * t
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sign(np.sin(ph)) * 0.6 + np.sin(ph * 2.01) * 0.3
    s += 0.3 * np.sign(np.sin(ph * 1.06))
    env = np.minimum(1, t / 0.03) * np.exp(-t / 0.9)
    s = speaker(s * env, 400, 3000)
    ir = make_ir(1.8, 1.5, damp_hz=2500, seed=25)
    write("horn", stereo(s) * 0.6 + 0.5 * convolve(s, ir)[:, :len(t)], 0.75)


def servo():
    sec = 0.7
    t = t_axis(sec)
    f = 900 + 500 * np.sin(np.pi * t / sec)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = (np.sign(np.sin(ph)) * 0.3 + np.sin(ph * 3) * 0.2) * np.sin(np.pi * t / sec) ** 0.5
    s += 0.2 * bandpass(white(sec), 3000, 4) * np.sin(np.pi * t / sec)
    write("servo", lowpass(s, 6000), 0.5)


def scream():
    """Jumpscare: detuned square cluster + servo screech + noise burst."""
    sec = 1.5
    t = t_axis(sec)
    s = np.zeros(len(t))
    for f in (311, 330, 466, 622, 659):
        f_t = f * (1 + 0.06 * np.sin(2 * np.pi * 7 * t)) * (1 + 0.15 * t)
        s += np.sign(np.sin(2 * np.pi * np.cumsum(f_t) / SR)) * 0.2
    sc = 2400 + 1600 * np.sin(2 * np.pi * 2.3 * t)
    s += 0.4 * np.sin(2 * np.pi * np.cumsum(sc) / SR)
    s += 0.6 * white(sec) * np.exp(-t / 0.4)
    env = np.minimum(1, t / 0.005) * np.exp(-t / 0.7)
    s = np.tanh(3 * s * env)
    write("scream", s, 0.89)


def heartbeat():
    L = 1.2   # 50 bpm loop, one lub-dub
    t = t_axis(L)
    s = np.zeros(len(t))
    for off, a in ((0.0, 1.0), (0.24, 0.7)):
        i = int(off * SR)
        tt = t[: len(t) - i]
        s[i:] += a * np.sin(2 * np.pi * (55 + 20 * np.exp(-tt / 0.02)) * tt) * np.exp(-tt / 0.09)
    write("heartbeat", lowpass(s, 200), 0.9)


def tension():
    """Tension layer: pulsing low cluster + slow metallic scrape (loop)."""
    L = 16.0
    fade = 1.0
    t = t_axis(L + fade)
    pulse = 0.5 + 0.5 * np.sin(2 * np.pi * t / 2.0) ** 8
    low = sum(np.sin(2 * np.pi * f * t) for f in (49.0, 51.9, 73.4)) * pulse
    scrape = bandpass(pink(L + fade), 2200, 3) * (0.5 + 0.5 * np.sin(2 * np.pi * t / 8.0)) ** 3
    s = norm(low, 1) * 0.8 + norm(scrape, 1) * 0.35
    ir = make_ir(3.0, 2.5, damp_hz=1500, seed=26)
    out = stereo(s) * 0.6 + convolve(s * 0.6, ir)[:, :len(t)] * 0.6
    write("tension", loopify(out, fade), 0.8)


def bell6():
    sec = 3.0
    t = t_axis(sec)
    s = sum(a * np.sin(2 * np.pi * 523.25 * r * t) * np.exp(-t / d) for r, a, d in [(1, 1, 1.6), (2.0, 0.5, 0.9), (2.76, 0.4, 0.6), (5.4, 0.2, 0.3), (0.5, 0.3, 2.0)])
    ir = make_ir(2.5, 2.2, damp_hz=4000, seed=27)
    write("bell6", stereo(s) * 0.5 + convolve(s, ir)[:, :len(t)] * 0.6, 0.7)


def shutter():
    sec = 2.2
    t = t_axis(sec)
    rattle = bandpass(white(sec), 900, 1.5) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 22 * t)))
    env = np.minimum(1, t / 0.1) * np.where(t < 1.6, 1.0, np.exp(-(t - 1.6) / 0.08))
    s = rattle * env
    s[int(1.6 * SR):int(1.6 * SR) + 3000] += np.sin(2 * np.pi * 70 * t[:3000]) * np.exp(-t[:3000] / 0.05) * 3
    ir = make_ir(2.0, 1.8, damp_hz=1200, seed=28)
    write("shutter", stereo(s) * 0.4 + convolve(s, ir)[:, :len(t)] * 0.6, 0.7)


def back_drag():
    """Something heavy dragging a thick cable over concrete."""
    sec = 2.2
    t = t_axis(sec)
    n = len(t)
    grit = bandpass(white(sec), 700, 1.2) * (0.5 + 0.5 * smooth_noise(sec, 18))
    env = np.sin(np.pi * t / sec) ** 1.5
    clunk = np.zeros(n)
    for off in (0.35, 1.25):
        i = int(off * SR)
        tt = t[: n - i]
        clunk[i:] += np.sin(2 * np.pi * 90 * tt) * np.exp(-tt / 0.08)
    s = grit * env + 0.6 * clunk
    ir = make_ir(1.6, 1.3, damp_hz=1200, seed=31)
    write("back_drag", stereo(s) * 0.5 + 0.6 * convolve(s, ir)[:, :n], 0.7)


def back_scratch():
    """Fingers (or something) scraping down a steel door."""
    sec = 1.8
    t = t_axis(sec)
    n = len(t)
    s = np.zeros(n)
    for k in range(3):
        start = 0.1 + k * 0.45
        i = int(start * SR)
        d = int(0.38 * SR)
        tt = np.arange(d) / SR
        f = 2600 - 1400 * tt / 0.38 + 300 * np.sin(2 * np.pi * 37 * tt)
        sq = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.3 + bandpass(white(0.38), 3500, 2) * 0.7
        s[i:i + d] += sq * np.sin(np.pi * tt / 0.38)
    s = peaks(s, [1800, 3200], 6, 2)
    ir = make_ir(0.8, 0.6, damp_hz=4000, seed=32)
    write("back_scratch", stereo(s) * 0.6 + 0.5 * convolve(s, ir)[:, :n], 0.75)


def back_breath():
    """A slow hydraulic hiss that sounds far too much like breathing."""
    sec = 3.0
    t = t_axis(sec)
    n = len(t)
    hiss = bandpass(white(sec), 900, 0.9)
    env = np.zeros(n)
    for start, dur, a in ((0.1, 1.1, 1.0), (1.5, 1.3, 0.8)):
        m = (t >= start) & (t < start + dur)
        env[m] = a * np.sin(np.pi * (t[m] - start) / dur) ** 2
    valve = np.sin(2 * np.pi * 52 * t) * 0.15 * env
    s = hiss * env + valve
    write("back_breath", lowpass(s, 2500), 0.6)


def wind_gust():
    sec = 3.5
    t = t_axis(sec)
    s = bandpass(pink(sec), 500, 0.7) * np.sin(np.pi * t / sec) ** 2 * (0.7 + 0.3 * smooth_noise(sec, 4))
    write("wind_gust", stereo(s), 0.7)


def generator():
    """Diesel generator idling in the power room (loop)."""
    L = 4.0
    t = t_axis(L + 0.5)
    fire = 25.0
    s = np.zeros(len(t))
    for h, a in [(1, 1.0), (2, 0.6), (3, 0.35), (4, 0.25), (6, 0.12)]:
        s += a * np.sin(2 * np.pi * fire * h * t + h)
    s *= 0.7 + 0.3 * np.sign(np.sin(2 * np.pi * fire * t))
    mech = bandpass(white(L + 0.5), 1500, 2) * (0.5 + 0.5 * np.sin(2 * np.pi * fire * t) ** 2)
    out = lowpass(s, 400) + 0.25 * mech
    write("generator", loopify(stereo(out), 0.5), 0.8)


def thunder():
    sec = 5.0
    t = t_axis(sec)
    crack = white(sec) * np.exp(-t / 0.05)
    rumble = lowpass(brown(sec), 120) * np.exp(-t / 1.8) * (0.6 + 0.4 * smooth_noise(sec, 3))
    s = highpass(crack, 800) * 0.4 + norm(rumble, 1)
    ir = make_ir(3.5, 3.0, damp_hz=800, seed=41)
    write("thunder", stereo(s) * 0.6 + convolve(s, ir)[:, :len(t)] * 0.5, 0.9)


def duct():
    """Something crawling inside sheet-metal ductwork."""
    sec = 1.6
    t = t_axis(sec)
    n = len(t)
    taps = np.zeros(n)
    for off in np.sort(rng.uniform(0, sec - 0.2, 7)):
        i = int(off * SR)
        k = min(2000, n - i)
        taps[i:i + k] += rng.standard_normal(k) * np.exp(-np.arange(k) / 300)
    scrape = bandpass(white(sec), 2200, 4) * np.sin(np.pi * t / sec) * 0.4
    s = taps + scrape
    # duct resonance: comb filter
    d = int(SR / 310)
    y = s.copy()
    for i in range(d, n):
        y[i] += 0.7 * y[i - d]
    write("duct", lowpass(y, 5000), 0.7)


if __name__ == "__main__":
    print("synthesising audio ->", os.path.abspath(OUT))
    music_box()
    ambience()
    fan()
    buzz()
    roomtone()
    clank()
    creak()
    thud()
    drip()
    zap()
    relay()
    chime()
    for fn in (step_heavy, step_light, greet_sunny, greet_pip, horn, servo, scream, heartbeat, tension, bell6, shutter,
               back_drag, back_scratch, back_breath, wind_gust, generator, thunder, duct):
        fn()
    import shutil
    shutil.rmtree(TMP, ignore_errors=True)
    print("done")
