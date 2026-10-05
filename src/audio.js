// Audio: spatial ambience through THREE's WebAudio listener, plus the
// terminal's piezo buzzer synthesised live (square waves through a tiny
// band-limited "speaker"), emitted from the monitor's position.
import * as THREE from 'three';

const FILES = ['musicbox', 'ambience', 'fan', 'buzz', 'roomtone', 'clank', 'creak', 'thud', 'drip', 'zap', 'relay', 'chime'];

export class AudioSys {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.buffers = {};
    this.pool = [];
  }

  async load(onProgress) {
    let n = 0;
    await Promise.all(
      FILES.map(async (f) => {
        const res = await fetch(`audio/${f}.ogg`);
        const arr = await res.arrayBuffer();
        this.buffers[f] = await this.ctx.decodeAudioData(arr);
        onProgress?.(++n / FILES.length);
      }),
    );
  }

  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  // looping ambient source. parent = Object3D for positional, else global
  loop(name, { parent, volume = 1, ref = 1, rolloff = 1, lowpass, rate = 1, offset } = {}) {
    const a = parent ? new THREE.PositionalAudio(this.listener) : new THREE.Audio(this.listener);
    a.setBuffer(this.buffers[name]);
    a.setLoop(true);
    a.setVolume(volume);
    a.setPlaybackRate(rate);
    if (parent) {
      a.setRefDistance(ref);
      a.setRolloffFactor(rolloff);
      a.setDistanceModel('inverse');
      parent.add(a);
    }
    if (lowpass) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      a.setFilter(f);
      a.lp = f;
    }
    a.offset = offset ?? Math.random() * this.buffers[name].duration;
    a.play();
    return a;
  }

  // positional one-shot at a world position
  shot(name, pos, { volume = 1, ref = 2, lowpass = 0, rate = 1, scene } = {}) {
    const holder = new THREE.Object3D();
    holder.position.copy(pos);
    scene.add(holder);
    const a = new THREE.PositionalAudio(this.listener);
    a.setBuffer(this.buffers[name]);
    a.setRefDistance(ref);
    a.setRolloffFactor(1.2);
    a.setVolume(volume);
    a.setPlaybackRate(rate);
    if (lowpass) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      a.setFilter(f);
    }
    holder.add(a);
    a.onEnded = () => {
      a.isPlaying = false;
      holder.remove(a);
      scene.remove(holder);
      a.disconnect();
    };
    a.play();
    return a;
  }

  // fade a THREE.Audio's gain smoothly
  fade(a, v, time = 0.4) {
    const g = a.gain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(v, now + time);
  }
}

// ---------------------------------------------------------------- buzzer
export class Buzzer {
  constructor(audio, parent) {
    const ctx = audio.ctx;
    this.ctx = ctx;
    // piezo / PC-speaker character: band limited, a little resonant
    this.out = ctx.createGain();
    this.out.gain.value = 0.22;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 280;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3600;
    lp.Q.value = 2.5;
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 2400;
    peak.gain.value = 6;
    peak.Q.value = 3;
    this.out.connect(hp);
    hp.connect(peak);
    peak.connect(lp);
    const pa = new THREE.PositionalAudio(audio.listener);
    pa.setRefDistance(0.6);
    pa.setRolloffFactor(1);
    pa.setNodeSource(lp);
    parent.add(pa);
    this.pa = pa;
    this.lastHover = 0;
  }

  // one square-wave beep, optional pitch glide
  tone(freq, dur = 0.06, vol = 0.6, to = null, delay = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.linearRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.setValueAtTime(vol, t + dur - 0.004);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  hover() {
    const now = performance.now();
    if (now - this.lastHover < 40) return;
    this.lastHover = now;
    this.tone(2400, 0.008, 0.18);
  }

  click() {
    this.tone(1800, 0.018, 0.5);
  }

  tick() {
    this.tone(3000, 0.006, 0.35);
  }

  blip(f = 1000) {
    this.tone(f, 0.03, 0.4);
  }

  select() {
    this.tone(1320, 0.03, 0.45);
  }

  page() {
    this.tone(880, 0.035, 0.45);
    this.tone(1320, 0.04, 0.45, null, 0.045);
  }

  on() {
    this.tone(660, 0.04, 0.5);
    this.tone(990, 0.06, 0.5, null, 0.05);
  }

  off() {
    this.tone(990, 0.04, 0.5);
    this.tone(495, 0.07, 0.5, null, 0.05);
  }

  ok() {
    this.tone(1046, 0.05, 0.5);
    this.tone(1568, 0.08, 0.5, null, 0.06);
  }

  error() {
    this.tone(196, 0.09, 0.7);
    this.tone(196, 0.12, 0.7, null, 0.13);
  }

  success() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.07, 0.5, null, i * 0.08));
  }

  post() {
    // the classic single POST beep
    this.tone(1000, 0.18, 0.55, null, 0.1);
  }
}
