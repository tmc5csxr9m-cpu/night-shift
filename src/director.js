// Ambient director: purely cosmetic distant sounds, light flickers and
// terminal interference. It never touches the simulation (which owns all
// gameplay-relevant sounds), so it uses Math.random freely.
import * as THREE from 'three';
import { roomWorldPos } from './rooms.js';
import { on } from './bus.js';

const EVENTS = [
  { kind: 'clank', w: 3 },
  { kind: 'thud', w: 1.5 },
  { kind: 'drip', w: 2 },
  { kind: 'flicker', w: 2 },
  { kind: 'glitch', w: 1 },
];

function pick() {
  const total = EVENTS.reduce((a, e) => a + e.w, 0);
  let r = Math.random() * total;
  for (const e of EVENTS) {
    r -= e.w;
    if (r <= 0) return e.kind;
  }
  return EVENTS[0].kind;
}

export class Director {
  constructor({ audio, scene, room, term }) {
    this.audio = audio;
    this.scene = scene;
    this.room = room;
    this.term = term;
    this.timer = 7 + Math.random() * 5;
    this.flicker = 0;
    this.active = true;
    on('sim:lure', (e) => {
      const w = roomWorldPos({ x: 0, y: 0, w: 0, h: 0, ...ROOM_POS[e.room] });
      this.audio.shot('chime', new THREE.Vector3(w.x, 2.2, w.z), { scene, volume: 1.4, ref: 3, lowpass: 1800 });
    });
  }

  fire(kind = pick()) {
    const A = this.audio;
    const scene = this.scene;
    switch (kind) {
      case 'clank': {
        // front half only: sounds from behind belong to real threats
        const a = (Math.random() - 0.5) * Math.PI * 1.2;
        const d = 9 + Math.random() * 8;
        A.shot('clank', new THREE.Vector3(Math.sin(a) * d, 1.5, -Math.cos(a) * d), { scene, volume: 1.4, ref: 3, lowpass: 800, rate: 0.85 + Math.random() * 0.3 });
        break;
      }
      case 'thud': {
        const a = (Math.random() - 0.5) * Math.PI;
        A.shot('thud', new THREE.Vector3(Math.sin(a) * 13, 1, -Math.cos(a) * 13), { scene, volume: 1.8, ref: 4, lowpass: 450 });
        break;
      }
      case 'drip': {
        const side = Math.random() < 0.5 ? -1 : 1;
        A.shot('drip', new THREE.Vector3(side * (3 + Math.random() * 4), 0.3, 0.3), { scene, volume: 0.6, ref: 1.2, rate: 0.9 + Math.random() * 0.25 });
        break;
      }
      case 'flicker':
        this.flicker = 0.4 + Math.random() * 0.7;
        A.shot('zap', this.room.anchors.lamp.position, { scene, volume: 0.5, ref: 1 });
        if (Math.random() < 0.4) this.term.triggerGlitch(0.12);
        break;
      case 'glitch':
        this.term.triggerGlitch(0.1 + Math.random() * 0.15);
        break;
    }
  }

  update(dt) {
    if (!this.active) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.fire();
      this.timer = 12 + Math.random() * 20;
    }
    if (this.flicker > 0) this.flicker -= dt;
  }

  lampFlicker(time) {
    if (this.flicker <= 0) return 1;
    const k = Math.floor(time * 18);
    const r = Math.sin(k * 91.7) * 43758.5;
    const f = r - Math.floor(r);
    return f < 0.4 ? 0.05 : f < 0.6 ? 0.4 : 1;
  }
}

// map positions of rooms (cells) for lure sound placement
import { ROOMS } from './rooms.js';
const ROOM_POS = {};
for (const r of ROOMS) ROOM_POS[r.id] = r;
