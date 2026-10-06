// Animatronic models (procedural) and how they appear in the corridors.
// The sim only knows nodes; this module stages them at far / near / door
// positions, animates idles and reactions, and performs the jumpscare.
import * as THREE from 'three';

const ROOM_FRONT = -1.8;

// feet position + facing for corridor nodes that are visible from the office
const STAGE = {
  DOOR_L: { p: [-2.78, 0, 0.08], ry: Math.PI / 2 },
  '07N': { p: [-5.3, 0, 0.35], ry: Math.PI / 2 + 0.15 },
  '07F': { p: [-9.1, 0, -0.15], ry: Math.PI / 2 - 0.1 },
  DOOR_R: { p: [2.78, 0, 0.08], ry: -Math.PI / 2 },
  '08N': { p: [5.3, 0, -0.3], ry: -Math.PI / 2 - 0.15 },
  '08F': { p: [9.1, 0, 0.2], ry: -Math.PI / 2 + 0.1 },
};

function furTexture(base, stripe) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.08})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 3 + Math.random() * 5);
  }
  // grime + worn patches
  for (let i = 0; i < 25; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 10 + Math.random() * 40;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(20,10,0,${0.1 + Math.random() * 0.25})`);
    grd.addColorStop(1, 'rgba(20,10,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (stripe) {
    g.fillStyle = stripe;
    for (let y = 0; y < 256; y += 64) g.fillRect(0, y, 256, 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
const sph = (r, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  return o;
};
const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 14), m);
  o.position.set(x, y, z);
  return o;
};

function eyes(head, { x = 0.09, y = 0.04, z = 0.2, r = 0.055, iris = 0xff2a10, scl = 0xe8e0d0 } = {}) {
  const sclera = std({ color: scl, roughness: 0.25 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: iris, emissiveIntensity: 0.05, roughness: 0.1 });
  const lids = [];
  for (const s of [-1, 1]) {
    const e = sph(r, sclera, s * x, y, z);
    head.add(e);
    const p = sph(r * 0.42, pupilMat, s * x, y, z + r * 0.75);
    head.add(p);
    // eyelid that can close (blink)
    const lid = sph(r * 1.08, head.userData.furMat, s * x, y, z, 1, 1, 1);
    lid.scale.set(1, 0.05, 1);
    lid.position.y = y + r * 0.9;
    head.add(lid);
    lids.push(lid);
  }
  return { pupilMat, lids };
}

function buildSunny() {
  const g = new THREE.Group();
  const fur = std({ map: furTexture('#6b4322'), color: 0xffffff });
  const light = std({ color: 0xc9a27a });
  const black = std({ color: 0x111111, roughness: 0.6 });
  const metal = std({ color: 0x555555, metalness: 0.7, roughness: 0.4 });
  // legs
  for (const s of [-1, 1]) {
    g.add(cyl(0.13, 0.15, 0.72, fur, s * 0.17, 0.36, 0));
    g.add(sph(0.15, fur, s * 0.17, 0.06, 0.06, 1, 0.5, 1.4));
  }
  const torso = new THREE.Group();
  torso.position.y = 0.72;
  torso.add(sph(0.36, fur, 0, 0.36, 0, 1.05, 1.15, 0.85));
  torso.add(sph(0.26, light, 0, 0.3, 0.12, 1, 1.1, 0.6));
  // bow tie
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), black);
    b.rotation.z = s * Math.PI / 2;
    b.position.set(s * 0.06, 0.72, 0.24);
    torso.add(b);
  }
  // arms (pivot at shoulder)
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.4, 0.62, 0);
    const up = cyl(0.09, 0.08, 0.42, fur, 0, -0.2, 0);
    a.add(up);
    a.add(sph(0.1, fur, 0, -0.46, 0.04, 1, 1, 1.1));
    a.rotation.z = s * 0.12;
    torso.add(a);
    arms.push(a);
  }
  g.add(torso);
  const head = new THREE.Group();
  head.userData.furMat = fur;
  head.position.y = 0.8;
  torso.add(head);
  head.add(sph(0.26, fur, 0, 0, 0, 1.05, 0.95, 0.95));
  head.add(sph(0.13, light, 0, -0.07, 0.19, 1.2, 0.85, 0.9));
  head.add(sph(0.045, black, 0, -0.02, 0.31, 1.3, 0.8, 0.8));
  for (const s of [-1, 1]) head.add(sph(0.08, fur, s * 0.2, 0.2, -0.02, 1, 1, 0.5));
  const hat = new THREE.Group();
  hat.add(cyl(0.11, 0.11, 0.16, black, 0, 0.32, 0));
  hat.add(cyl(0.16, 0.16, 0.015, black, 0, 0.24, 0));
  hat.rotation.z = 0.12;
  head.add(hat);
  // jaw
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.05);
  const jm = sph(0.12, light, 0, -0.03, 0.12, 1.15, 0.45, 0.95);
  jaw.add(jm);
  for (let i = -2; i <= 2; i++) jaw.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.02), std({ color: 0xddd8c0 })).translateX(i * 0.03).translateY(0.0).translateZ(0.24));
  head.add(jaw);
  // exposed endoskeleton hint at the neck
  torso.add(cyl(0.05, 0.05, 0.12, metal, 0, 0.72, 0));
  const eye = eyes(head, { x: 0.095, y: 0.06, z: 0.19, r: 0.06, iris: 0xffffff });
  return { group: g, torso, head, jaw, arms, ...eye, height: 1.9 };
}

function buildPip() {
  const g = new THREE.Group();
  const fur = std({ map: furTexture('#55609e'), color: 0xffffff });
  const light = std({ color: 0xb8b0d8 });
  const red = std({ color: 0x8a1020 });
  for (const s of [-1, 1]) {
    g.add(cyl(0.1, 0.12, 0.78, fur, s * 0.14, 0.39, 0));
    g.add(sph(0.12, fur, s * 0.14, 0.05, 0.08, 1, 0.5, 1.7));
  }
  const torso = new THREE.Group();
  torso.position.y = 0.78;
  torso.add(sph(0.3, fur, 0, 0.32, 0, 0.95, 1.2, 0.8));
  torso.add(sph(0.2, light, 0, 0.28, 0.1, 1, 1.15, 0.6));
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), red);
    b.rotation.z = s * Math.PI / 2;
    b.position.set(s * 0.05, 0.64, 0.2);
    torso.add(b);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.32, 0.56, 0);
    a.add(cyl(0.07, 0.06, 0.45, fur, 0, -0.22, 0));
    a.add(sph(0.08, light, 0, -0.48, 0.03));
    a.rotation.z = s * 0.15;
    torso.add(a);
    arms.push(a);
  }
  g.add(torso);
  const head = new THREE.Group();
  head.userData.furMat = fur;
  head.position.y = 0.75;
  torso.add(head);
  head.add(sph(0.22, fur, 0, 0, 0, 1, 1.05, 0.95));
  head.add(sph(0.11, light, 0, -0.07, 0.16, 1.3, 0.8, 0.8));
  head.add(sph(0.03, std({ color: 0x5a2030, roughness: 0.4 }), 0, -0.02, 0.26));
  for (let i = -2; i <= 2; i++) head.add(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.03, 0.015), std({ color: 0xd8d0b0 })).translateX(i * 0.022).translateY(-0.12).translateZ(0.22));
  const ears = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(s * 0.09, 0.17, -0.02);
    e.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.42, 4, 8), fur).translateY(0.25));
    e.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.36, 4, 8), light).translateY(0.25).translateZ(0.02));
    e.rotation.z = s * -0.12;
    head.add(e);
    ears.push(e);
  }
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.06);
  jaw.add(sph(0.1, light, 0, -0.02, 0.09, 1.2, 0.4, 0.9));
  head.add(jaw);
  const eye = eyes(head, { x: 0.085, y: 0.05, z: 0.17, r: 0.058, iris: 0xff2020 });
  return { group: g, torso, head, jaw, arms, ears, ...eye, height: 1.85 };
}

function buildTootie() {
  const g = new THREE.Group();
  const fur = std({ map: furTexture('#c99418'), color: 0xffffff });
  const beakM = std({ color: 0xd8641a, roughness: 0.6 });
  const white = std({ color: 0xe8e2d0 });
  for (const s of [-1, 1]) {
    g.add(cyl(0.05, 0.06, 0.55, beakM, s * 0.16, 0.27, 0));
    g.add(sph(0.1, beakM, s * 0.16, 0.03, 0.08, 1, 0.4, 1.6));
  }
  const torso = new THREE.Group();
  torso.position.y = 0.55;
  torso.add(sph(0.4, fur, 0, 0.3, 0, 1, 1.05, 0.9));
  const bib = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.3), std({ map: bibTexture(), transparent: true }));
  bib.position.set(0, 0.3, 0.355);
  torso.add(bib);
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.4, 0.45, 0);
    a.add(sph(0.12, fur, 0, -0.15, 0, 0.5, 1.5, 1));
    a.rotation.z = s * 0.4;
    torso.add(a);
    arms.push(a);
  }
  g.add(torso);
  const head = new THREE.Group();
  head.userData.furMat = fur;
  head.position.y = 0.78;
  torso.add(head);
  head.add(sph(0.24, fur, 0, 0, 0));
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 10), beakM);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.04, 0.27);
  head.add(beak);
  const hornM = std({ color: 0x3060ff });
  const hornO = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.25, 8, 1, true), hornM);
  hornO.rotation.x = -Math.PI / 2;
  hornO.position.set(0, -0.05, 0.48);
  head.add(hornO);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 12), std({ color: 0xff3a6a }));
  hat.position.set(0.04, 0.3, 0);
  hat.rotation.z = -0.2;
  head.add(hat);
  const jaw = new THREE.Group();
  head.add(jaw);
  const eye = eyes(head, { x: 0.1, y: 0.07, z: 0.18, r: 0.065, iris: 0xffb020, scl: 0xf0f0f0 });
  void white;
  return { group: g, torso, head, jaw, arms, ...eye, height: 1.6 };
}

function bibTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 220;
  const g = c.getContext('2d');
  g.fillStyle = '#eee8dc';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(256, 0);
  g.lineTo(220, 200);
  g.lineTo(36, 200);
  g.fill();
  g.fillStyle = '#c22';
  g.font = 'bold 44px sans-serif';
  g.textAlign = 'center';
  g.fillText("LET'S", 128, 80);
  g.fillText('PARTY!', 128, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildChef() {
  const g = new THREE.Group();
  // pale, frost-bitten fur and an apron
  const fur = std({ map: furTexture('#8a6a58'), color: 0xd8e4f0 });
  const frost = std({ color: 0xdfefff, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.55 });
  const white = std({ color: 0xe8e6de });
  const steel = std({ color: 0x9aa4ae, metalness: 0.8, roughness: 0.3 });
  for (const s of [-1, 1]) {
    g.add(cyl(0.16, 0.18, 0.7, fur, s * 0.2, 0.35, 0));
    g.add(sph(0.17, steel, s * 0.2, 0.06, 0.06, 1, 0.5, 1.4));
  }
  const torso = new THREE.Group();
  torso.position.y = 0.7;
  torso.add(sph(0.46, fur, 0, 0.38, 0, 1.05, 1.1, 0.9));
  torso.add(sph(0.47, frost, 0, 0.42, 0.02, 1.0, 0.9, 0.85));
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.6), white);
  apron.position.set(0, 0.25, 0.42);
  torso.add(apron);
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.5, 0.65, 0);
    a.add(cyl(0.11, 0.1, 0.5, fur, 0, -0.25, 0));
    a.add(sph(0.12, fur, 0, -0.55, 0.05));
    if (s > 0) {
      const cleaver = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.32), steel);
      cleaver.position.set(0, -0.7, 0.12);
      a.add(cleaver);
    }
    a.rotation.z = s * 0.15;
    torso.add(a);
    arms.push(a);
  }
  g.add(torso);
  const head = new THREE.Group();
  head.userData.furMat = fur;
  head.position.y = 0.95;
  torso.add(head);
  head.add(sph(0.3, fur, 0, 0, 0, 1.1, 0.95, 1));
  head.add(sph(0.15, white, 0, -0.08, 0.22, 1.3, 0.8, 0.9));
  head.add(sph(0.05, std({ color: 0x221111 }), 0, -0.02, 0.36));
  // chef's hat
  head.add(cyl(0.2, 0.18, 0.12, white, 0, 0.3, 0));
  head.add(sph(0.24, white, 0, 0.44, 0, 1, 0.6, 1));
  head.add(sph(0.31, frost, 0, 0.02, 0.02, 1.1, 0.95, 1));
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, 0.08);
  jaw.add(sph(0.14, white, 0, -0.03, 0.14, 1.2, 0.45, 0.9));
  head.add(jaw);
  const eye = eyes(head, { x: 0.11, y: 0.07, z: 0.23, r: 0.06, iris: 0x60c0ff });
  return { group: g, torso, head, jaw, arms, ...eye, height: 2.05 };
}

function buildRibbon() {
  // a thin marionette from the ceiling rails: porcelain mask, ribbons for hair
  const g = new THREE.Group();
  const cloth = std({ color: 0x3a1020, roughness: 0.8 });
  const porcelain = std({ color: 0xf0ece4, roughness: 0.25 });
  const red = std({ color: 0xa01020, roughness: 0.5, side: THREE.DoubleSide });
  const wood = std({ color: 0x6a4a30 });
  for (const s of [-1, 1]) g.add(cyl(0.025, 0.03, 0.9, wood, s * 0.08, 0.45, 0));
  const torso = new THREE.Group();
  torso.position.y = 0.9;
  torso.add(cyl(0.08, 0.14, 0.6, cloth, 0, 0.3, 0));
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.14, 0.55, 0);
    a.add(cyl(0.018, 0.018, 0.75, wood, 0, -0.37, 0));
    a.add(sph(0.03, porcelain, 0, -0.76, 0));
    a.rotation.z = s * 0.25;
    torso.add(a);
    arms.push(a);
  }
  g.add(torso);
  const head = new THREE.Group();
  head.userData.furMat = porcelain;
  head.position.y = 0.78;
  torso.add(head);
  head.add(sph(0.13, porcelain, 0, 0, 0, 0.9, 1.15, 0.8));
  // painted smile
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16, Math.PI), red);
  smile.position.set(0, -0.05, 0.1);
  smile.rotation.z = Math.PI;
  head.add(smile);
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.5), red);
    rib.position.set(-0.1 + i * 0.04, -0.1, -0.06);
    rib.rotation.z = (i - 2.5) * 0.08;
    head.add(rib);
  }
  const jaw = new THREE.Group();
  head.add(jaw);
  const eye = eyes(head, { x: 0.045, y: 0.03, z: 0.09, r: 0.025, iris: 0xffffff, scl: 0x080808 });
  // fingers that curl through the vent slats
  const fingers = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    f.position.set(-0.12 + i * 0.075, -0.02, 0);
    const a = cyl(0.009, 0.007, 0.18, porcelain, 0, -0.09, 0);
    f.add(a);
    const b = cyl(0.007, 0.005, 0.12, porcelain, 0, -0.2, 0.03);
    b.rotation.x = 0.6;
    f.add(b);
    fingers.add(f);
  }
  return { group: g, torso, head, jaw, arms, fingers, ...eye, height: 1.7 };
}

const BUILDERS = { sunny: buildSunny, pip: buildPip, tootie: buildTootie, chef: buildChef, ribbon: buildRibbon };

export class ActorViews {
  constructor(scene, room) {
    this.scene = scene;
    this.room = room;
    this.views = {};
    for (const [id, fn] of Object.entries(BUILDERS)) {
      const v = fn();
      v.id = id;
      v.group.visible = false;
      v.group.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      v.node = null;
      v.pos = new THREE.Vector3();
      v.target = new THREE.Vector3();
      v.ry = 0;
      v.twitch = 0;
      v.talk = 0;
      v.blink = 0;
      v.bow = 0;
      v.pose = 0;
      v.hold = 0;            // keep showing the old spot (bow) for a moment
      v.lunge = 0;
      if (v.fingers) {
        v.fingers.visible = false;
        if (room?.anchors.vent) {
          v.fingers.position.set(-1.45, 2.26, ROOM_FRONT + 0.08);
          scene.add(v.fingers);
        }
      }
      // debug ghost: wireframe marker wherever the sim says the actor is
      v.ghost = new THREE.Mesh(new THREE.BoxGeometry(0.6, v.height, 0.6), new THREE.MeshBasicMaterial({ color: 0xff40ff, wireframe: true, depthTest: false, transparent: true, opacity: 0.8, fog: false }));
      v.ghost.renderOrder = 10;
      v.ghost.visible = false;
      scene.add(v.ghost);
      scene.add(v.group);
      this.views[id] = v;
    }
    this.ghosts = false;
    // harsh strobe from below for the jumpscare
    this.scareLight = new THREE.PointLight(0xfff0dd, 0, 3, 1.5);
    scene.add(this.scareLight);
  }

  // a sim event happened
  event(e) {
    const v = this.views[e.actor || e.source];
    if (!v) return;
    if (e.type === 'repel' && e.actor === 'sunny') {
      v.bow = 1.2;
      v.hold = 1.2;
    }
    if (e.type === 'cue' && e.kind === 'greet') v.talk = 0.6;
  }

  // light level hitting a corridor side, 0..1
  update(dt, t, world, lightLevel) {
    for (const v of Object.values(this.views)) {
      const a = world?.actors.find((x) => x.id === v.id);
      let node = a ? a.node : null;
      if (v.hold > 0) {
        v.hold -= dt;
        node = v.node;
      }
      // Ribbon: fingers through the vent, rattling slats in the duct behind it
      if (v.fingers) {
        v.fingers.visible = node === 'VENT';
        if (v.fingers.visible) v.fingers.children.forEach((f, i) => (f.rotation.x = 0.3 + Math.sin(t * 3 + i) * 0.25));
        const slats = this.room?.ventSlats;
        if (slats) {
          const shake = node === 'VENT' ? 0.25 : node === 'D2' ? 0.12 : 0;
          slats.forEach((sl, i) => (sl.rotation.x = -0.6 + (shake ? Math.sin(t * 40 + i * 1.7) * shake : 0)));
        }
      }
      const st = node && STAGE[node];
      const gp = a && NODE_POS[a.node];
      v.ghost.visible = !!(this.ghosts && gp && !this.ghostsHidden);
      if (v.ghost.visible) {
        // duct nodes sit up in the ceiling: a small marker at the node itself
        const duct = ['D1', 'D2', 'VENT'].includes(a.node);
        v.ghost.scale.setScalar(duct ? 0.35 : 1);
        v.ghost.position.set(gp[0], duct ? gp[1] : v.height / 2, gp[2]);
      }
      if (!st) {
        v.group.visible = false;
        v.node = node;
        continue;
      }
      if (node !== v.node) {
        // newly visible: appear in place; moving between visible spots: glide
        const wasVisible = v.node && STAGE[v.node];
        v.target.set(...st.p);
        if (!wasVisible) v.pos.copy(v.target);
        v.node = node;
        v.ry = st.ry;
        v.twitch = 0.4;
      }
      v.group.visible = true;
      v.pos.lerp(v.target, Math.min(1, dt * 3.5));
      v.group.position.copy(v.pos);
      const moving = v.pos.distanceTo(v.target) > 0.05;
      v.group.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.05 : 0;
      v.group.rotation.y = v.ry;

      const side = node.includes('L') || node.startsWith('07') ? 'L' : 'R';
      const lit = lightLevel[side] || 0;
      // eyeshine: the light makes the eyes flare
      v.pupilMat.emissiveIntensity = 0.03 + lit * (node.startsWith('DOOR') ? 2.5 : 1.6) + (v.talk > 0 ? 0.8 : 0);

      // idle: small twitches, occasional jerk
      v.twitch -= dt;
      if (v.twitch <= 0) {
        v.twitch = 0.6 + Math.random() * 2.5;
        v.headTarget = { y: (Math.random() - 0.5) * 0.5, x: (Math.random() - 0.5) * 0.25, z: (Math.random() - 0.5) * 0.2 };
        if (Math.random() < 0.3) v.blink = 0.15;
      }
      const ht = v.headTarget || { x: 0, y: 0, z: 0 };
      // Pip in the light: slow head tilt, one ear flops (posing)
      const posing = v.id === 'pip' && node === 'DOOR_R' && lit > 0.5;
      v.pose += ((posing ? 1 : 0) - v.pose) * Math.min(1, dt * 2);
      v.head.rotation.x += (ht.x - v.head.rotation.x) * Math.min(1, dt * 12);
      v.head.rotation.y += (ht.y * (1 - v.pose) - v.head.rotation.y) * Math.min(1, dt * 12);
      v.head.rotation.z += (ht.z * (1 - v.pose) + v.pose * 0.45 - v.head.rotation.z) * Math.min(1, dt * 6);
      if (v.ears) v.ears[1].rotation.x = v.pose * 1.2;
      // Sunny's bow when sent back
      if (v.bow > 0) {
        v.bow -= dt;
        const k = Math.sin(Math.min(1, (1.2 - v.bow) / 1.2) * Math.PI);
        v.torso.rotation.x = k * 0.55;
        v.arms[0].rotation.x = -k * 0.8;
      } else v.torso.rotation.x *= 0.9;
      // talking jaw
      if (v.talk > 0) {
        v.talk -= dt;
        v.jaw.rotation.x = Math.abs(Math.sin(t * 22)) * 0.35;
      } else v.jaw.rotation.x *= 0.8;
      // blink
      if (v.blink > 0) v.blink -= dt;
      for (const l of v.lids) l.scale.y = v.blink > 0 ? 1 : 0.05;
      // arms sway
      v.arms[0].rotation.z = -0.12 + Math.sin(t * 1.3 + v.id.length) * 0.03;
      v.arms[1].rotation.z = 0.12 + Math.sin(t * 1.1) * 0.03;
    }
  }

  // put the killer right in front of the camera and lunge
  jumpscare(id, camera) {
    const v = this.views[id] || this.views.sunny;
    for (const o of Object.values(this.views)) o.group.visible = false;
    v.group.visible = true;
    v.lunge = 0.0001;
    v.lungeCam = camera;
    // pinpoint pupils, burning white
    v.pupilMat.emissive.setHex(0xffffff);
    v.pupilMat.emissiveIntensity = 6;
    v.group.traverse((o) => {
      if (o.isMesh && o.material === v.pupilMat) o.scale.setScalar(0.45);
    });
    return v;
  }

  updateJumpscare(dt, v) {
    if (!v || !v.lunge) return;
    v.lunge += dt;
    const cam = v.lungeCam;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const k = Math.min(1, v.lunge / 0.28);
    const dist = 1.8 - 1.1 * (1 - Math.pow(1 - k, 3));
    const p = cam.position.clone().addScaledVector(fwd, dist);
    // head at eye level
    const headY = v.torso.position.y + v.head.position.y;
    p.y = cam.position.y - headY - 0.05 + Math.sin(v.lunge * 40) * 0.02;
    v.group.position.copy(p);
    v.group.lookAt(cam.position.x, p.y, cam.position.z);
    v.head.rotation.set(-0.15 + Math.sin(v.lunge * 37) * 0.08, Math.sin(v.lunge * 23) * 0.1, Math.sin(v.lunge * 31) * 0.1);
    v.jaw.rotation.x = 0.5 + Math.sin(v.lunge * 45) * 0.15;
    v.arms[0].rotation.x = -1.3;
    v.arms[1].rotation.x = -1.3;
    const L = this.scareLight;
    L.position.copy(cam.position).addScaledVector(fwd, 0.3);
    L.position.y -= 0.45;
    L.intensity = Math.random() < 0.55 ? 7 : 0.3;
  }

  clearJumpscare() {
    this.scareLight.intensity = 0;
    for (const v of Object.values(this.views)) v.ghost.visible = false;
    for (const v of Object.values(this.views)) {
      v.group.traverse((o) => {
        if (o.isMesh && o.material === v.pupilMat) o.scale.setScalar(1);
      });
      v.lunge = 0;
      v.group.visible = false;
      v.node = null;
      v.hold = 0;
      v.arms[0].rotation.x = 0;
      v.arms[1].rotation.x = 0;
      v.group.rotation.set(0, 0, 0);
    }
  }
}

// world positions used for 3D sound of sim cues
export const NODE_POS = {
  '01': [0, 1.3, -15], '02': [0, 1.2, -8], '03': [-9, 1.2, -6], '04': [-9, 1.2, -14], '05': [9, 1.2, -14],
  '06': [9, 1.2, -7], '09': [-10, 1.2, 1], '10': [-9, 1.2, 6], '11': [10, 1.2, 1], '13': [11, 1.2, 6],
  '07F': [-9.1, 1.0, 0], '07N': [-5.3, 1.0, 0.3], DOOR_L: [-2.8, 1.2, 0.1],
  '08F': [9.1, 1.0, 0], '08N': [5.3, 1.0, -0.3], DOOR_R: [2.8, 1.2, 0.1],
  BACKP: [-3, 1, 4], '12': [0, 1.1, 3.6], DOOR_B: [0, 1.2, 2.1], D1: [6, 2.4, -4], D2: [2, 2.5, -1.8], VENT: [-1.4, 2.2, -1.75],
};
