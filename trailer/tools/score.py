#!/usr/bin/env python3
"""
Trailer score, synthesised from scratch with numpy and locked to the edit:
every hit, drum and riser is placed from src/timeline.json (30 fps,
120 BPM: one beat = 15 frames), and the game's own sounds (screams, thunder,
the music box...) are mixed in at the cuts they belong to.

    python3 tools/score.py            ->  public/score.wav
"""
import json
import os
import subprocess

import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
GAME_AUDIO = os.path.join(ROOT, "..", "public", "audio")
TL = json.load(open(os.path.join(ROOT, "src", "timeline.json")))
FPS = TL["fps"]
BEAT = 60 / TL["bpm"]
DUR = TL["duration"] / FPS + 1.5
S = {k: v / FPS for k, v in TL["sections"].items()}
rng = np.random.default_rng(1993)

mix = np.zeros((int(DUR * SR), 2))


def sec(f):
    return f / FPS


def t_axis(d):
    return np.arange(int(d * SR)) / SR


def env(n, a=0.005, d=0.3, curve=4.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-curve * t / max(d, 1e-4))
    return e


def lowpass(x, cutoff):
    """one-pole lowpass; cutoff may be an array (time-varying)"""
    cutoff = np.broadcast_to(cutoff, x.shape[:1]) if np.ndim(cutoff) == 0 else cutoff
    a = np.exp(-2 * np.pi * np.asarray(cutoff) / SR)
    y = np.zeros_like(x)
    acc = np.zeros(x.shape[1:]) if x.ndim > 1 else 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def fft_band(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))


def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= len(mix):
        return
    sig = sig[: len(mix) - i]
    if sig.ndim == 1:
        l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
        mix[i : i + len(sig), 0] += sig * gain * l * 1.41
        mix[i : i + len(sig), 1] += sig * gain * r * 1.41
    else:
        mix[i : i + len(sig)] += sig * gain


def saw(freq, d, detune=0.0):
    t = t_axis(d)
    ph = (freq * (1 + detune)) * t
    return 2 * (ph - np.floor(ph + 0.5))


def game(name, rate=1.0):
    """decode one of the game's sounds (mono, resampled = pitch/speed change)"""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(GAME_AUDIO, name + ".ogg"), "-f", "f32le", "-ac", "1", "-ar", str(int(SR / rate)), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


# ---------------------------------------------------------------- instruments
def kick(gain=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7)
    click = rng.standard_normal(n) * np.exp(-t * 400) * 0.3
    return np.tanh((body + click) * 1.6) * gain


def snare():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = fft_band(rng.standard_normal(n), 900, 9000) * np.exp(-t * 16)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 25)
    return np.tanh((noise * 0.9 + tone * 0.7) * 1.4)


def tick():
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    return fft_band(rng.standard_normal(n), 6000, 16000) * np.exp(-t * 120) * 0.6


def boom(d=3.0):
    t = t_axis(d)
    f = 34 + 40 * np.exp(-t * 3)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    crack = fft_band(rng.standard_normal(len(t)), 200, 6000) * np.exp(-t * 18) * 0.6
    return np.tanh((s + crack) * 1.8)


def braam(d=3.2, root=55.0):
    """the low brass 'BRAAM': stacked detuned saws, distorted, filter closing"""
    sig = np.zeros(int(d * SR))
    for mul, g in ((1, 1.0), (1.5, 0.55), (2, 0.6), (3, 0.25)):
        for dt in (-0.006, 0.0, 0.007):
            sig += saw(root * mul, d, dt) * g
    t = t_axis(d)
    sig = np.tanh(sig * 0.9)
    cut = 180 + 2600 * np.exp(-t * 2.2)
    sig = lowpass(sig, cut)
    e = np.minimum(1, t / 0.03) * np.exp(-t * 0.9)
    return sig * e * 0.55


def riser(d):
    t = t_axis(d)
    k = t / d
    noise = rng.standard_normal(len(t))
    nz = lowpass(noise, 300 + 9000 * k ** 2) * (0.15 + 0.85 * k ** 2)
    f = 180 * 2 ** (k * 3.2)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.35 * k ** 1.5
    tone2 = np.sin(2 * np.pi * np.cumsum(f * 1.498) / SR) * 0.2 * k ** 2
    return (nz * 0.6 + tone + tone2) * 0.8


def whoosh(d=0.45):
    t = t_axis(d)
    k = np.sin(np.pi * t / d)
    return lowpass(rng.standard_normal(len(t)), 400 + 5000 * k) * k * 0.9


def pluck(freq, d=0.22):
    t = t_axis(d)
    s = saw(freq, d) * 0.6 + saw(freq, d, 0.004) * 0.4
    s = lowpass(s, 600 + 3000 * np.exp(-t * 18))
    return s * np.exp(-t * 9)


def drone(d, f0=55.0, open_at=None):
    t = t_axis(d)
    s = saw(f0, d, -0.004) + saw(f0, d, 0.005) + 0.6 * saw(f0 * 1.5, d, 0.002)
    s += 0.25 * np.sin(2 * np.pi * f0 / 2 * t)
    cut = 120 + (open_at(t) if open_at else 0)
    return lowpass(s * 0.35, cut)


# ---------------------------------------------------------------- the score
cold, build, rush, silence, jump = S["cold"], S["build"], S["rush"], S["silence"], S["jump"]
title, stinger, ai, end = S["title"], S["stinger"], S["ai"], S["end"]

# cold open: the music box, slow and out of tune, a party chime... then cut
mb = game("musicbox", 0.82)[: int((sec(105) - sec(4)) * SR)]
mb *= np.minimum(1, np.arange(len(mb)) / (SR * 0.6))
mb[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))
add(mb, sec(4), 0.9)
add(game("chime"), sec(15), 0.5)
add(drone(sec(105) - sec(40), 55, lambda t: 300 * t / 2.2), sec(40), 0.5)
# the light snaps on: it is right there
add(game("relay"), sec(114), 0.9, 0.5)
add(braam(3.6, 55), sec(116), 1.0)
add(boom(2.5), sec(116), 0.8)

# build: a pulse at 120 BPM, a clock tick, the drone opening up
n_beats = int(round((rush - build) / BEAT))
for b in range(n_beats):
    at = build + b * BEAT
    add(kick(0.9 if b % 2 == 0 else 0.6), at, 0.85)
    add(tick(), at + BEAT / 2, 0.45, 0.3 if b % 2 else -0.3)
add(drone(rush - build + 0.5, 55, lambda t: 200 + 900 * t / (rush - build)), build, 0.55)
# second half: a minor ostinato in 16ths (A minor, then F, then E)
pattern = [57, 60, 64, 69, 64, 60, 57, 60]
chords = [0, 0, -4, -5]
start_osc = build + 8 * 2 * BEAT
steps = int((rush - start_osc) / (BEAT / 4))
for i in range(steps):
    bar = int(i / 16) % 4
    note = pattern[i % 8] + chords[bar]
    add(pluck(440 * 2 ** ((note - 69) / 12)), start_osc + i * BEAT / 4, 0.22 + 0.18 * i / steps, 0.4 if i % 2 else -0.4)
# sound under the shots
add(game("step_heavy"), sec(192), 1.0, -0.6)
add(game("greet_pip", 0.9), sec(214), 0.8, 0.6)
add(game("thunder"), sec(300), 1.1)
add(whoosh(), sec(364), 0.9, -0.3)
add(game("greet_sunny"), sec(372), 0.8, -0.7)
add(game("musicbox", 0.66)[: int(1.0 * SR)] * np.linspace(0, 1, int(1.0 * SR)), sec(420), 0.7, -0.5)
add(game("creak", 0.8), sec(452), 0.9)
add(game("scream"), sec(481), 0.9)
add(boom(1.6), sec(480), 1.0)
add(braam(2.6, 49), sec(510), 0.8)
add(game("zap", 0.6), sec(512), 0.8)
add(game("relay"), sec(540), 0.7)
add(game("horn", 0.55), sec(570), 0.8)

# rush: drums double, snare on 2 and 4, then 16th rolls; one long riser
beats = int((silence - rush) / BEAT)
for b in range(beats):
    at = rush + b * BEAT
    add(kick(1.0), at, 0.9)
    add(kick(0.7), at + BEAT / 2, 0.7)
    if b % 2 == 1:
        add(snare(), at, 0.55)
    add(tick(), at + BEAT / 4, 0.4)
    add(tick(), at + 3 * BEAT / 4, 0.4)
roll_from = sec(750)
k = 0
while roll_from + k * BEAT / 4 < sec(846):
    add(snare(), roll_from + k * BEAT / 4, 0.25 + 0.35 * k / 24)
    k += 1
k = 0
while sec(846) + k * BEAT / 8 < silence:
    add(snare(), sec(846) + k * BEAT / 8, 0.6)
    k += 1
add(drone(silence - rush, 55, lambda t: 1100 + 2500 * t / (silence - rush)), rush, 0.55)
add(riser(silence - rush), rush, 1.0)
for f in (750, 798, 838):           # the jumpscare flashes in the montage
    add(game("scream", 1.2)[: int(0.25 * SR)], sec(f), 0.5)
    add(boom(0.8), sec(f), 0.6)

# silence. a breath. then it lunges
add(game("back_breath", 1.1), sec(908), 0.5)
add(game("scream"), sec(938), 1.0)
add(boom(2.2), sec(938), 1.0)
add(braam(1.6, 61.7), sec(938), 0.6)

# title: the big hit and a sub drop
add(braam(4.0, 55), sec(985), 1.1)
add(boom(3.5), sec(985), 1.0)
t = t_axis(2.5)
add(np.sin(2 * np.pi * np.cumsum(70 * np.exp(-t * 1.2) + 28) / SR) * np.exp(-t * 1.0), sec(985), 0.7)

# stinger: the music box winds down while the head turns to you
mb2 = game("musicbox", 0.7)[: int(3.4 * SR)]
slow = np.interp(np.cumsum(np.linspace(1.0, 0.45, len(mb2)) ** 1.2), np.arange(len(mb2)), mb2)
slow *= np.linspace(1, 0.2, len(slow))
add(slow, sec(1095), 0.9)
add(game("servo", 0.7), sec(1112), 0.8, 0.4)
add(boom(2.0), sec(1170), 0.6)

# AI card + end card: a low bed and one last hit
add(drone(end + 6 - ai, 55, lambda t: 250 * np.exp(-t / 3)), ai, 0.4)
add(boom(3.0), sec(1290), 0.7)
add(braam(4.5, 55), sec(1290), 0.5)

# ---------------------------------------------------------------- master
out = np.tanh(mix * 0.9)
out /= max(1e-9, np.abs(out).max()) / 0.89
pcm = (out * 32767).astype(np.int16)
os.makedirs(os.path.join(ROOT, "public"), exist_ok=True)
import wave

with wave.open(os.path.join(ROOT, "public", "score.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("public/score.wav", round(len(pcm) / SR, 1), "s")
