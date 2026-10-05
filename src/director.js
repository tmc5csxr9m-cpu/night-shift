// Ambient director: nothing is hunting you yet, but the building is not
// quiet. Random distant sounds (some of them behind you, where you can't
// look), light flickers and terminal interference. Sounds near a sensor
// node show up on the map and in the syslog, tying audio to the terminal.
import * as THREE from 'three';
import { ROOMS, roomWorldPos } from './rooms.js';
import { state, log, on } from './state.js';

const EVENTS = [
  { kind: 'clank', w: 3 },
  { kind: 'creak', w: 2 },
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

function nearestRoom(p) {
  let best = null;
  let bd = Infinity;
  for (const r of ROOMS) {
    if (r.id === 'OF') continue;
    const w = roomWorldPos(r);
    const d = Math.hypot(w.x - p.x, w.z - p.z);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

export class Director {
  constructor({ audio, scene, room, term }) {
    this.audio = audio;
    this.scene = scene;
    this.room = room;
    this.term = term;
    this.timer = 7 + Math.random() * 5;
    this.flicker = 0;
    on('lure', (r) => {
      const w = roomWorldPos(r);
      this.audio.shot('chime', new THREE.Vector3(w.x, 2.2, w.z), { scene, volume: 1.4, ref: 3, lowpass: 1800 });
    });
  }

  sensor(p, db) {
    const r = nearestRoom(p);
    if (!r) return;
    const s = state.rooms[r.id];
    if (s) s.spike = db;
    if (db > 18) log(`节点 ${r.id} ${r.name}: 声学异常 ${Math.round(30 + db)}dB`, 'warn');
  }

  fire(kind = pick()) {
    const A = this.audio;
    const scene = this.scene;
    switch (kind) {
      case 'clank': {
        const a = Math.random() * Math.PI * 2;
        const d = 7 + Math.random() * 8;
        const p = new THREE.Vector3(Math.sin(a) * d, 1.5, Math.cos(a) * d);
        A.shot('clank', p, { scene, volume: 1.6, ref: 3, lowpass: 900, rate: 0.85 + Math.random() * 0.3 });
        this.sensor(p, 22);
        break;
      }
      case 'creak': {
        // behind the player: the back door you cannot turn to see
        const p = new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.2, 3.2 + Math.random() * 2);
        A.shot('creak', p, { scene, volume: 1.2, ref: 1.5, lowpass: 2200, rate: 0.8 + Math.random() * 0.3 });
        const s = state.rooms['12'];
        if (s) s.spike = 26;
        log('节点 12 后廊: 声学异常 ' + Math.round(52 + Math.random() * 8) + 'dB', 'warn');
        break;
      }
      case 'thud': {
        const a = Math.random() * Math.PI * 2;
        const p = new THREE.Vector3(Math.sin(a) * 12, 1, Math.cos(a) * 12);
        A.shot('thud', p, { scene, volume: 2.0, ref: 4, lowpass: 500 });
        this.sensor(p, 15);
        break;
      }
      case 'drip': {
        const side = Math.random() < 0.5 ? -1 : 1;
        const p = new THREE.Vector3(side * (3 + Math.random() * 4), 0.3, 0.3);
        A.shot('drip', p, { scene, volume: 0.7, ref: 1.2, rate: 0.9 + Math.random() * 0.25 });
        break;
      }
      case 'flicker': {
        this.flicker = 0.5 + Math.random() * 0.9;
        A.shot('zap', this.room.anchors.lamp.position, { scene, volume: 0.5, ref: 1 });
        if (Math.random() < 0.5) this.term.triggerGlitch(0.15);
        break;
      }
      case 'glitch': {
        this.term.triggerGlitch(0.12 + Math.random() * 0.2);
        break;
      }
    }
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.fire();
      this.timer = 9 + Math.random() * 16;
    }
    if (this.flicker > 0) this.flicker -= dt;
  }

  // multiplier for the office lamp, 0..1
  lampFlicker(time) {
    if (this.flicker <= 0) return 1 - 0.03 * Math.random() * (Math.sin(time * 0.7) > 0.95 ? 1 : 0);
    const k = Math.floor(time * 18);
    const r = Math.sin(k * 91.7) * 43758.5;
    const f = r - Math.floor(r);
    return f < 0.4 ? 0.05 : f < 0.6 ? 0.4 : 1;
  }
}
