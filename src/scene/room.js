// The security office and the two corridors outside its side doors.
// Units are metres. Player sits at the origin facing -Z.
import * as THREE from 'three';
import * as T from './textures.js';
import { crtMaterial } from './crt.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

export const ROOM = { x: 2.0, zf: -1.8, zb: 1.8, h: 2.6 };
export const DOOR = { z0: -0.55, z1: 0.65, h: 2.1 };
const HALL = { len: 9.5, z0: -0.85, z1: 0.95, wall: 0.2 };

function std(opts) {
  return new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0, ...opts });
}

function shadowed(m, cast = true, receive = true) {
  m.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return m;
}

// vertical wall quad from a to b (xz), facing `normal` side, with UVs in
// metres so textures line up across segments (2m x 2.6m per texture tile)
function wallQuad(ax, az, bx, bz, y0, y1, mat, flip = false) {
  const len = Math.hypot(bx - ax, bz - az);
  const g = new THREE.PlaneGeometry(len, y1 - y0);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const uStart = (ax + az) * 0.5;
  for (let i = 0; i < uv.count; i++) {
    const lx = pos.getX(i) + len / 2;
    const ly = pos.getY(i) + (y1 - y0) / 2 + y0;
    uv.setXY(i, (uStart + lx) / 2.0, ly / ROOM.h);
  }
  const m = new THREE.Mesh(g, mat);
  m.position.set((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
  const dx = bx - ax;
  const dz = bz - az;
  // plane normal is +Z; rotate so it lies along a->b, facing left of travel
  m.rotation.y = Math.atan2(-dz, dx) + (flip ? Math.PI : 0);
  m.receiveShadow = true;
  return m;
}

// wall along a->b with a rectangular opening between t0..t1 (distances along wall)
function wallWithOpening(group, ax, az, bx, bz, t0, t1, oh, mat, flip) {
  const len = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  const P = (t) => [ax + ux * t, az + uz * t];
  const [p0x, p0z] = P(t0);
  const [p1x, p1z] = P(t1);
  group.add(wallQuad(ax, az, p0x, p0z, 0, ROOM.h, mat, flip));
  group.add(wallQuad(p1x, p1z, bx, bz, 0, ROOM.h, mat, flip));
  group.add(wallQuad(p0x, p0z, p1x, p1z, oh, ROOM.h, mat, flip));
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cyl(rt, rb, h, mat, seg = 16, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

function plane(w, h, mat, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  return m;
}

export function buildRoom(scene) {
  const refs = { anchors: {} };
  const root = new THREE.Group();
  scene.add(root);

  // ---------------------------------------------------------------- materials
  const floorTex = T.floorTexture();
  floorTex.repeat.set(30 / 1.6, 30 / 1.6);
  const floorMat = std({ map: floorTex, roughness: 0.55 });
  const wallTex = T.wallTexture();
  const wallMat = std({ map: wallTex, roughness: 0.9 });
  const hallTex = T.wallTexture({ tint: [70, 52, 60] });
  const hallMat = std({ map: hallTex, roughness: 0.9 });
  const ceilTex = T.ceilingTexture();
  ceilTex.repeat.set(1 / 0.6, 1 / 0.6);
  const ceilMat = std({ map: ceilTex, roughness: 1 });
  const metal = std({ map: T.metalTexture(), metalness: 0.6, roughness: 0.55 });
  const darkMetal = std({ color: 0x202326, metalness: 0.7, roughness: 0.5 });
  const wood = std({ map: T.woodTexture(), roughness: 0.7 });
  const beige = std({ color: 0x8f8670, roughness: 0.65 });
  const black = std({ color: 0x0a0a0a, roughness: 0.4 });

  // ---------------------------------------------------------------- floor/ceiling
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  // ceiling uv in world metres
  const ceilGeo = new THREE.PlaneGeometry(30, 30);
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceilTex.repeat.set(30 / 0.6, 30 / 0.6);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM.h;
  ceil.receiveShadow = true;
  root.add(ceil);

  // ---------------------------------------------------------------- office walls
  const X = ROOM.x;
  // front (z = -1.8), facing +z
  root.add(wallQuad(-X, ROOM.zf, X, ROOM.zf, 0, ROOM.h, wallMat));
  // back with door, facing -z
  wallWithOpening(root, X, ROOM.zb, -X, ROOM.zb, X - 0.5, X + 0.5, DOOR.h, wallMat);
  // left (x=-2) facing +x : walk from back to front
  wallWithOpening(root, -X, ROOM.zb, -X, ROOM.zf, ROOM.zb - DOOR.z1, ROOM.zb - DOOR.z0, DOOR.h, wallMat);
  // right (x=+2) facing -x : walk from front to back
  wallWithOpening(root, X, ROOM.zf, X, ROOM.zb, DOOR.z0 - ROOM.zf, DOOR.z1 - ROOM.zf, DOOR.h, wallMat);

  // ---------------------------------------------------------------- corridors
  for (const side of [-1, 1]) {
    const x0 = side * (X + HALL.wall);
    const x1 = side * (X + HALL.wall + HALL.len);
    const g = new THREE.Group();
    // door reveal (wall thickness)
    const jambMat = darkMetal;
    const jx = side * (X + HALL.wall / 2);
    g.add(box(HALL.wall + 0.02, DOOR.h, 0.06, jambMat, jx, DOOR.h / 2, DOOR.z0 - 0.03));
    g.add(box(HALL.wall + 0.02, DOOR.h, 0.06, jambMat, jx, DOOR.h / 2, DOOR.z1 + 0.03));
    g.add(box(HALL.wall + 0.02, 0.06, DOOR.z1 - DOOR.z0 + 0.12, jambMat, jx, DOOR.h + 0.03, (DOOR.z0 + DOOR.z1) / 2));
    // corridor side walls
    if (side < 0) {
      g.add(wallQuad(x1, HALL.z0, x0, HALL.z0, 0, ROOM.h, hallMat));
      g.add(wallQuad(x0, HALL.z1, x1, HALL.z1, 0, ROOM.h, hallMat));
      wallWithOpening(g, x1, HALL.z1, x1, HALL.z0, 0.3, 1.3, 2.1, hallMat);
    } else {
      g.add(wallQuad(x0, HALL.z0, x1, HALL.z0, 0, ROOM.h, hallMat));
      g.add(wallQuad(x1, HALL.z1, x0, HALL.z1, 0, ROOM.h, hallMat));
      wallWithOpening(g, x1, HALL.z0, x1, HALL.z1, 0.5, 1.5, 2.1, hallMat);
    }
    // inner face of the office wall, seen from the corridor side
    // (door margins are symmetric: 0.3m either side inside the corridor)
    wallWithOpening(g, x0, side < 0 ? HALL.z0 : HALL.z1, x0, side < 0 ? HALL.z1 : HALL.z0,
      DOOR.z0 - HALL.z0, DOOR.z1 - HALL.z0, DOOR.h, hallMat);
    root.add(g);
  }

  // ---------------------------------------------------------------- door frames (office side)
  for (const side of [-1, 1]) {
    const x = side * (X - 0.02);
    const f = new THREE.Group();
    f.add(box(0.06, DOOR.h + 0.08, 0.1, darkMetal, x, (DOOR.h + 0.08) / 2, DOOR.z0 - 0.05));
    f.add(box(0.06, DOOR.h + 0.08, 0.1, darkMetal, x, (DOOR.h + 0.08) / 2, DOOR.z1 + 0.05));
    f.add(box(0.06, 0.1, DOOR.z1 - DOOR.z0 + 0.2, darkMetal, x, DOOR.h + 0.05, (DOOR.z0 + DOOR.z1) / 2));
    // hazard stripe on the floor at the threshold
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.22, DOOR.z1 - DOOR.z0), std({ map: hazardTex(), roughness: 0.6 }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(side * (X + 0.1), 0.002, (DOOR.z0 + DOOR.z1) / 2);
    stripe.receiveShadow = true;
    f.add(stripe);
    root.add(shadowed(f));
  }

  // ---------------------------------------------------------------- back door (never seen, but there)
  {
    const d = new THREE.Group();
    d.add(box(1.0, DOOR.h, 0.06, metal, 0, DOOR.h / 2, ROOM.zb + 0.04));
    d.add(box(0.1, 0.03, 0.06, darkMetal, -0.38, 1.0, ROOM.zb - 0.01));
    const sign = plane(0.4, 0.15, std({ map: T.labelTexture('仅限员工', { bg: '#a01818', fg: '#fff' }) }), 0, 1.75, ROOM.zb - 0.005, Math.PI);
    d.add(sign);
    root.add(shadowed(d));
  }

  // ---------------------------------------------------------------- door lights (outside, above doors)
  refs.doorLights = {};
  for (const [key, side] of [['L', -1], ['R', 1]]) {
    const px = side * (X + HALL.wall + 0.18);
    const g = new THREE.Group();
    g.position.set(px, DOOR.h + 0.28, (DOOR.z0 + DOOR.z1) / 2);
    const housing = box(0.14, 0.1, 0.3, darkMetal, 0, 0.05, 0);
    g.add(housing);
    const bulbMat = std({ color: 0x334, emissive: 0xdde8ff, emissiveIntensity: 0, roughness: 0.3 });
    const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 10), bulbMat);
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(side * 0.03, -0.02, 0);
    g.add(bulb);
    // cage
    for (let i = -2; i <= 2; i++) g.add(box(0.005, 0.07, 0.005, darkMetal, side * 0.05, -0.02, i * 0.055));
    root.add(shadowed(g, false, false));

    const spot = new THREE.SpotLight(0xd8e4ff, 0, 11, 0.62, 0.55, 1.4);
    spot.position.set(px, DOOR.h + 0.2, (DOOR.z0 + DOOR.z1) / 2);
    spot.target.position.set(side * 7.5, 0, (DOOR.z0 + DOOR.z1) / 2);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.camera.near = 0.1;
    scene.add(spot, spot.target);
    // a dim spill so the doorway edge catches light
    // inside the doorway, so whatever stands in the door is lit from the front
    const spill = new THREE.PointLight(0xd8e4ff, 0, 3.2, 1.8);
    spill.position.set(side * (X - 0.35), 2.0, 0.05);
    scene.add(spill);
    const anchor = new THREE.Object3D();
    anchor.position.copy(g.position);
    scene.add(anchor);
    // volumetric dust in the beam
    const dust = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6.5, 32, 1, true), dustMaterial());
    dust.geometry.translate(0, -3.25, 0);
    dust.geometry.rotateX(-Math.PI / 2);
    dust.position.copy(spot.position);
    dust.lookAt(spot.target.position);
    dust.renderOrder = 2;
    scene.add(dust);
    refs.doorLights[key] = { spot, spill, bulbMat, anchor, dust, level: 0 };

    // the light switch beside the doorway: click it while looking at the door
    const sw = new THREE.Group();
    sw.position.set(side * (X - 0.03), 1.3, DOOR.z1 + 0.22);
    sw.rotation.y = -side * Math.PI / 2;
    sw.add(box(0.16, 0.24, 0.04, std({ color: 0x2a2c30, metalness: 0.5, roughness: 0.5 }), 0, 0, 0));
    const btnMat = std({ color: 0x401010, emissive: 0xff3020, emissiveIntensity: 0.4, roughness: 0.4 });
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 18), btnMat);
    btn.rotation.x = Math.PI / 2;
    btn.position.set(0, 0.02, 0.03);
    sw.add(btn);
    sw.add(plane(0.12, 0.035, std({ map: T.labelTexture('LIGHT', { w: 128, h: 36, bg: '#222', fg: '#ddd', font: 'bold 22px monospace' }) }), 0, -0.08, 0.021, 0));
    root.add(shadowed(sw, false, true));
    refs.doorSwitches = refs.doorSwitches || {};
    refs.doorSwitches[key] = { group: sw, btnMat };
  }

  // ---------------------------------------------------------------- corridor props
  buildCorridorProps(root, { std, metal, darkMetal, wood, black });

  // ---------------------------------------------------------------- desk
  const desk = new THREE.Group();
  const DZ = -0.78;
  const TOP = 0.76;
  desk.add(box(2.3, 0.05, 0.9, wood, 0, TOP - 0.025, DZ));
  // metal drawer pedestals
  desk.add(box(0.5, TOP - 0.05, 0.82, metal, -0.86, (TOP - 0.05) / 2, DZ));
  desk.add(box(0.5, TOP - 0.05, 0.82, metal, 0.86, (TOP - 0.05) / 2, DZ));
  for (let i = 0; i < 3; i++) {
    for (const sx of [-0.86, 0.86]) {
      desk.add(box(0.44, 0.2, 0.01, metal, sx, 0.13 + i * 0.235, DZ + 0.415));
      desk.add(box(0.12, 0.02, 0.025, darkMetal, sx, 0.2 + i * 0.235, DZ + 0.425));
    }
  }
  desk.add(box(1.2, 0.5, 0.02, metal, 0, TOP - 0.3, DZ - 0.4)); // modesty panel
  root.add(shadowed(desk));

  // ---------------------------------------------------------------- CRT monitor
  const mon = new THREE.Group();
  mon.position.set(0, TOP, -0.8);
  const SW = 0.37;
  const SH = 0.278;
  mon.add(cyl(0.12, 0.15, 0.03, beige, 20, 0, 0.015, 0));
  mon.add(cyl(0.05, 0.06, 0.06, beige, 12, 0, 0.05, 0));
  const body = new THREE.Group();
  body.position.y = 0.3;
  body.add(box(0.5, 0.42, 0.07, beige, 0, 0, 0.17));                // bezel
  body.add(box(0.46, 0.38, 0.18, beige, 0, -0.005, 0.05));          // mid
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, 0.26, 4, 1), beige);
  back.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  back.position.set(0, -0.01, -0.16);
  back.scale.set(1, 1, 0.85);
  body.add(back);
  // vents on top
  for (let i = 0; i < 8; i++) body.add(box(0.3, 0.004, 0.012, black, 0, 0.191, -0.05 + i * 0.022));
  // recess around the tube
  body.add(box(SW + 0.03, SH + 0.03, 0.01, black, 0, 0.01, 0.203));
  // glass tube (curved)
  const scrGeo = new THREE.PlaneGeometry(SW, SH, 32, 24);
  const p = scrGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (SW / 2);
    const y = p.getY(i) / (SH / 2);
    p.setZ(i, 0.012 * (1 - 0.5 * x * x - 0.5 * y * y));
  }
  scrGeo.computeVertexNormals();
  refs.screenSize = { w: SW, h: SH };
  refs.makeScreen = (texture) => {
    const mat = crtMaterial(texture);
    const screen = new THREE.Mesh(scrGeo, mat);
    screen.position.set(0, 0.01, 0.207);
    body.add(screen);
    refs.screen = screen;
    refs.crtMat = mat;
    return screen;
  };
  // badge + power LED + knobs
  const badge = plane(0.12, 0.02, std({ map: T.labelTexture('STARLIGHT', { w: 256, h: 44, bg: '#b8ad8c', fg: '#5a4e30', font: 'bold 30px sans-serif' }) }), -0.12, -0.185, 0.206);
  body.add(badge);
  const ledMat = std({ color: 0x113311, emissive: 0x33ff55, emissiveIntensity: 2 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 8), ledMat);
  led.position.set(0.2, -0.185, 0.207);
  body.add(led);
  refs.monitorLed = ledMat;
  for (let i = 0; i < 3; i++) {
    const k = cyl(0.009, 0.009, 0.01, black, 10, 0.1 + i * 0.03, -0.185, 0.21);
    k.rotation.x = Math.PI / 2;
    body.add(k);
  }
  mon.add(body);
  root.add(shadowed(mon));
  refs.monitor = mon;
  refs.monitorBody = body;
  const monAnchor = new THREE.Object3D();
  monAnchor.position.set(0, TOP + 0.3, -0.7);
  scene.add(monAnchor);
  refs.anchors.monitor = monAnchor;

  // screen glow on the desk / player
  // area light the size of the tube: lights desk & player, not the bezel
  RectAreaLightUniformsLib.init();
  const screenLight = new THREE.RectAreaLight(0x5c7cff, 9, SW, SH);
  screenLight.position.set(0, TOP + 0.31, -0.585);
  screenLight.lookAt(0, TOP + 0.31, 1);
  scene.add(screenLight);
  refs.screenLight = screenLight;

  // ---------------------------------------------------------------- keyboard & mouse
  {
    const kb = box(0.46, 0.03, 0.16, std({ map: T.keyboardTexture(), roughness: 0.6 }), 0, TOP + 0.015, -0.45);
    kb.rotation.x = 0.06;
    kb.rotation.y = 0.04;
    root.add(shadowed(kb));
    const pad = box(0.22, 0.004, 0.18, std({ color: 0x1b2240 }), 0.42, TOP + 0.002, -0.46);
    root.add(shadowed(pad));
    const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), beige);
    mouse.scale.set(1, 0.55, 1.6);
    mouse.position.set(0.43, TOP + 0.015, -0.45);
    root.add(shadowed(mouse));
    // coiled cord
    const pts = [];
    for (let i = 0; i <= 20; i++) pts.push(new THREE.Vector3(0.43 - i * 0.012, TOP + 0.006, -0.5 - i * 0.012 - Math.sin(i * 0.6) * 0.02));
    const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.003, 5), black);
    root.add(cord);
  }

  // ---------------------------------------------------------------- desk fan
  {
    const fan = new THREE.Group();
    fan.position.set(-0.74, TOP, -0.86);
    fan.rotation.y = 0.55;
    const fm = std({ color: 0x6b7f74, metalness: 0.3, roughness: 0.5 });
    fan.add(cyl(0.11, 0.12, 0.03, fm, 20, 0, 0.015, 0));
    fan.add(cyl(0.012, 0.012, 0.24, darkMetal, 8, 0, 0.15, 0));
    const head = new THREE.Group();
    head.position.y = 0.3;
    const motor = cyl(0.055, 0.06, 0.12, fm, 16, 0, 0, -0.05);
    motor.rotation.x = Math.PI / 2;
    head.add(motor);
    const blades = new THREE.Group();
    blades.position.z = 0.04;
    const bladeMat = std({ color: 0x9fb3a6, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.075, 12, 0, 0.9), bladeMat);
      b.rotation.z = (i / 3) * Math.PI * 2;
      b.rotation.y = 0.25;
      blades.add(b);
    }
    blades.add(cyl(0.022, 0.022, 0.03, fm, 12, 0, 0, 0).rotateX(Math.PI / 2));
    head.add(blades);
    // cage
    const wire = std({ color: 0x8a948e, metalness: 0.8, roughness: 0.3 });
    for (const z of [0.0, 0.08]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.003, 4, 32), wire);
      ring.position.z = z;
      head.add(ring);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const s = box(0.003, 0.003, 0.09, wire, Math.cos(a) * 0.115, Math.sin(a) * 0.115, 0.04);
      head.add(s);
      const sp = box(0.0025, 0.115, 0.0025, wire, Math.cos(a) * 0.057, Math.sin(a) * 0.057, 0.085);
      sp.rotation.z = a - Math.PI / 2;
      head.add(sp);
    }
    fan.add(head);
    root.add(shadowed(fan));
    refs.fan = { group: fan, head, blades, speed: 0 };
    const anchor = new THREE.Object3D();
    head.add(anchor);
    refs.anchors.fan = anchor;
  }

  // ---------------------------------------------------------------- desk clutter
  {
    // striped soda cups
    const cupTex = stripeTex();
    const cupMat = std({ map: cupTex, roughness: 0.6 });
    const lidMat = std({ color: 0xdddddd, roughness: 0.5 });
    for (const [x, z, tilt] of [[0.58, -0.6, 0], [-0.4, -1.02, 0], [1.02, -0.75, 1]]) {
      const c = new THREE.Group();
      c.add(cyl(0.04, 0.03, 0.13, cupMat, 14, 0, 0.065, 0));
      c.add(cyl(0.042, 0.042, 0.008, lidMat, 14, 0, 0.13, 0));
      c.add(cyl(0.003, 0.003, 0.12, std({ color: 0xff3355 }), 6, 0.01, 0.18, 0).rotateZ(0.2));
      c.position.set(x, TOP, z);
      if (tilt) {
        c.rotation.z = Math.PI / 2;
        c.position.y = TOP + 0.04;
        c.rotation.y = 0.7;
      }
      root.add(shadowed(c));
    }
    // mug
    const mug = new THREE.Group();
    const mugMat = std({ color: 0x23325a, roughness: 0.35 });
    mug.add(cyl(0.04, 0.04, 0.1, mugMat, 16, 0, 0.05, 0));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 6, 12, Math.PI), mugMat);
    handle.position.set(0.045, 0.05, 0);
    handle.rotation.z = -Math.PI / 2;
    mug.add(handle);
    mug.add(cyl(0.035, 0.035, 0.002, std({ color: 0x1a0d05, roughness: 0.1 }), 16, 0, 0.085, 0));
    mug.position.set(0.82, TOP, -0.5);
    root.add(shadowed(mug));
    // papers
    for (let i = 0; i < 6; i++) {
      const pp = box(0.21, 0.003, 0.29, std({ map: T.paperTexture(), roughness: 0.9 }), 0.35 + Math.random() * 0.02, TOP + 0.002 + i * 0.004, -1.02);
      pp.rotation.y = (Math.random() - 0.5) * 0.3;
      root.add(shadowed(pp));
    }
    const loose = plane(0.21, 0.29, std({ map: T.paperTexture(8), roughness: 0.9 }), -0.42, TOP + 0.003, -0.55);
    loose.rotation.set(-Math.PI / 2, 0, 0.5);
    root.add(loose);
    // phone
    const phone = new THREE.Group();
    const pm = std({ color: 0x2a1c1c, roughness: 0.4 });
    phone.add(box(0.2, 0.06, 0.16, pm, 0, 0.03, 0));
    const hs = box(0.22, 0.035, 0.05, pm, 0, 0.08, -0.04);
    phone.add(hs);
    phone.add(box(0.1, 0.004, 0.06, std({ color: 0xc8c0a8 }), 0, 0.061, 0.035));
    const pled = std({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 0 });
    const pl = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 6), pled);
    pl.position.set(0.08, 0.062, 0.06);
    phone.add(pl);
    phone.position.set(0.72, TOP, -0.95);
    phone.rotation.y = -0.4;
    root.add(shadowed(phone));
    refs.phoneLed = pled;
    refs.phone = phone;
    const pAnchor = new THREE.Object3D();
    pAnchor.position.set(0, 0.08, 0);
    phone.add(pAnchor);
    refs.anchors.phone = pAnchor;
    // party hat
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 16, 1, true), std({ map: stripeTex('#2a6cff', '#ffd23a'), side: THREE.DoubleSide }));
    hat.position.set(-1.0, TOP + 0.04, -0.52);
    hat.rotation.z = 1.35;
    hat.rotation.y = 0.5;
    root.add(shadowed(hat));
    // flashlight (dead)
    const fl = cyl(0.02, 0.02, 0.2, darkMetal, 10, -0.3, TOP + 0.02, -0.38);
    fl.rotation.z = Math.PI / 2;
    fl.rotation.y = -0.3;
    root.add(shadowed(fl));
    // plush bear in the corner of the desk, staring
    root.add(shadowed(plush(std, 0.98, TOP, -1.05)));
  }

  // ---------------------------------------------------------------- hanging lamp
  {
    const lamp = new THREE.Group();
    lamp.position.set(0, ROOM.h, -0.35);
    const cord = cyl(0.005, 0.005, 0.42, black, 6, 0, -0.21, 0);
    lamp.add(cord);
    const shadeMat = std({ color: 0x2d3a30, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.2, 0.14, 24, 1, true), shadeMat);
    shade.position.y = -0.48;
    lamp.add(shade);
    const bulbMat = std({ color: 0xffeecc, emissive: 0xffc46a, emissiveIntensity: 3 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), bulbMat);
    bulb.position.y = -0.53;
    lamp.add(bulb);
    root.add(shadowed(lamp, true, false));
    shade.castShadow = false;

    const spot = new THREE.SpotLight(0xffc98a, 9, 3.4, 0.95, 0.75, 1.6);
    spot.position.set(0, ROOM.h - 0.5, -0.35);
    spot.target.position.set(0, 0, -0.55);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0003;
    spot.shadow.radius = 4;
    scene.add(spot, spot.target);
    const fill = new THREE.PointLight(0xffb870, 1.3, 3.1, 1.6);
    fill.position.set(0, ROOM.h - 0.35, -0.35);
    scene.add(fill);
    refs.lamp = { group: lamp, spot, fill, bulbMat, base: { spot: 9, fill: 1.3, emissive: 3 } };
    const anchor = new THREE.Object3D();
    anchor.position.set(0, ROOM.h - 0.5, -0.35);
    scene.add(anchor);
    refs.anchors.lamp = anchor;
  }

  // ---------------------------------------------------------------- walls dressing
  {
    const z = ROOM.zf + 0.005;
    const poster = (kind, w, h, x, y, zz, ry = 0, rz = 0) => {
      const m = plane(w, h, std({ map: T.posterTexture(kind), roughness: 0.8 }), x, y, zz, ry);
      m.rotation.z = rz;
      root.add(m);
      return m;
    };
    poster('celebrate', 0.62, 0.87, -1.25, 1.55, z, 0, 0.02);
    poster('rules', 0.5, 0.7, 1.3, 1.5, z, 0, -0.015);
    // kids drawings
    const dr = [[-0.55, 1.78, 0.05], [-0.2, 1.86, -0.08], [0.2, 1.8, 0.1], [0.55, 1.88, -0.04], [-0.35, 1.5, 0.12], [0.4, 1.52, -0.1]];
    dr.forEach(([x, y, r], i) => {
      const m = plane(0.28, 0.21, std({ map: T.drawingTexture(i), roughness: 0.9 }), x, y, z + 0.002 + i * 0.0005);
      m.rotation.z = r;
      root.add(m);
      // tape
      root.add(plane(0.04, 0.015, std({ color: 0xd8d0a0, roughness: 0.6, transparent: true, opacity: 0.8 }), x, y + 0.1, z + 0.006));
    });
    // clock (frozen at twelve)
    const clock = new THREE.Group();
    clock.position.set(0, 2.27, ROOM.zf + 0.03);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), std({ map: T.clockTexture() }));
    clock.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 8, 32), black);
    clock.add(rim);
    const hand = (l, w, rot) => {
      const h = box(w, l, 0.004, black, 0, 0, 0.008);
      h.geometry.translate(0, l / 2, 0);
      h.rotation.z = rot;
      clock.add(h);
      return h;
    };
    hand(0.09, 0.012, 0);
    hand(0.13, 0.008, 0.02);
    refs.clockSecond = hand(0.14, 0.003, 0);
    root.add(shadowed(clock, false, true));

    // left wall: menu poster + switch panel
    poster('menu', 0.5, 0.7, -X + 0.005, 1.5, -1.2, Math.PI / 2, 0.01);
    const panel = new THREE.Group();
    panel.position.set(-X + 0.03, 1.3, -0.8);
    panel.add(box(0.05, 0.3, 0.2, metal, 0, 0, 0));
    panel.add(plane(0.12, 0.04, std({ map: T.labelTexture('DOOR LT', { w: 128, h: 40, bg: '#222', fg: '#ddd', font: 'bold 22px monospace' }) }), 0.026, 0.1, 0, Math.PI / 2));
    refs.panelLeds = {};
    for (const [k, yy] of [['L', 0.02], ['R', -0.07]]) {
      const m = std({ color: 0x220000, emissive: 0xff3020, emissiveIntensity: 0.6 });
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.022, 0.05), m);
      l.position.set(0.028, yy, -0.03);
      panel.add(plane(0.04, 0.02, std({ map: T.labelTexture(k, { w: 64, h: 32, bg: '#222', fg: '#ccc', font: 'bold 24px monospace' }) }), 0.026, yy, 0.05, Math.PI / 2));
      panel.add(l);
      refs.panelLeds[k] = m;
    }
    root.add(shadowed(panel));
    // conduit from panel up to ceiling
    root.add(shadowed(cyl(0.015, 0.015, 1.15, metal, 8, -X + 0.03, 2.03, -0.8)));

    // right wall: missing poster, drawings, vent grille
    poster('missing', 0.42, 0.6, X - 0.005, 1.55, -1.15, -Math.PI / 2, -0.02);
    const d2 = plane(0.28, 0.21, std({ map: T.drawingTexture(7), roughness: 0.9 }), X - 0.006, 1.2, -1.35, -Math.PI / 2);
    d2.rotation.z = 0.15;
    root.add(d2);
    // the vent sits high on the front wall, in plain sight
    const vent = new THREE.Group();
    vent.position.set(-1.45, 2.18, ROOM.zf + 0.03);
    vent.add(box(0.62, 0.42, 0.04, darkMetal, 0, 0, 0));
    vent.add(box(0.56, 0.36, 0.02, black, 0, 0, 0.012));
    const slats = [];
    for (let i = 0; i < 7; i++) {
      const sl = box(0.56, 0.018, 0.05, metal, 0, -0.15 + i * 0.05, 0.03);
      sl.rotation.x = -0.6;
      vent.add(sl);
      slats.push(sl);
    }
    root.add(shadowed(vent));
    refs.vent = vent;
    refs.ventSlats = slats;
    const ventAnchor = new THREE.Object3D();
    ventAnchor.position.set(-1.45, 2.18, ROOM.zf + 0.2);
    scene.add(ventAnchor);
    refs.anchors.vent = ventAnchor;

    // pipes along the ceiling
    const pipeMat = std({ color: 0x5a4a3a, metalness: 0.6, roughness: 0.5 });
    for (const [y, z, r] of [[2.48, -1.62, 0.04], [2.4, -1.5, 0.025]]) {
      const pp = cyl(r, r, 4.0, pipeMat, 12, 0, y, z);
      pp.rotation.z = Math.PI / 2;
      root.add(shadowed(pp));
    }
    const pipeL = cyl(0.03, 0.03, 3.6, pipeMat, 10, -X + 0.12, 2.47, 0);
    pipeL.rotation.x = Math.PI / 2;
    root.add(shadowed(pipeL));

    // filing cabinet, front-left corner
    const cab = new THREE.Group();
    cab.position.set(-1.65, 0, -1.48);
    cab.add(box(0.5, 1.3, 0.6, metal, 0, 0.65, 0));
    for (let i = 0; i < 4; i++) {
      cab.add(box(0.46, 0.28, 0.01, metal, 0, 0.2 + i * 0.31, 0.305));
      cab.add(box(0.14, 0.02, 0.03, darkMetal, 0, 0.3 + i * 0.31, 0.32));
    }
    cab.rotation.y = 0.15;
    root.add(shadowed(cab));
    // binders on top
    const bcols = [0x7a1a1a, 0x1a3a7a, 0x2a5a2a, 0x7a6a1a];
    bcols.forEach((c, i) => {
      const b = box(0.06, 0.3, 0.24, std({ color: c }), -1.82 + i * 0.07, 1.45, -1.48);
      b.rotation.z = i === 3 ? 0.35 : 0;
      root.add(shadowed(b));
    });

    // shelf on the right of the front wall with boxes
    const shelf = box(0.8, 0.03, 0.25, wood, 1.5, 2.05, ROOM.zf + 0.13);
    root.add(shadowed(shelf));
    const boxMat = std({ color: 0x8a6a40, roughness: 0.9 });
    root.add(shadowed(box(0.3, 0.2, 0.22, boxMat, 1.3, 2.17, ROOM.zf + 0.13)));
    // the music box: a little dancer turns while it plays; the key unwinds
    {
      const mb = new THREE.Group();
      mb.position.set(1.6, 2.065, ROOM.zf + 0.15);
      mb.rotation.y = -0.25;
      const lacquer = std({ color: 0x5a1820, roughness: 0.35, metalness: 0.1 });
      const gold = std({ color: 0xb08a3a, roughness: 0.35, metalness: 0.8 });
      const porcelain = std({ color: 0xe8e0d4, roughness: 0.4 });
      mb.add(shadowed(box(0.18, 0.09, 0.13, lacquer, 0, 0.045, 0)));
      mb.add(box(0.186, 0.012, 0.136, gold, 0, 0.09, 0));
      const hinge = new THREE.Group();
      hinge.position.set(0, 0.096, -0.065);
      hinge.rotation.x = -1.9;
      const lid = box(0.18, 0.012, 0.13, lacquer, 0, 0, 0.065);
      hinge.add(shadowed(lid));
      const mirror = box(0.15, 0.002, 0.1, std({ color: 0x9aa4ac, roughness: 0.08, metalness: 1 }), 0, -0.007, 0.065);
      hinge.add(mirror);
      mb.add(hinge);
      const dancer = new THREE.Group();
      dancer.position.set(0, 0.096, 0.01);
      dancer.add(cyl(0.003, 0.003, 0.03, gold, 10, 0, 0.015, 0));
      dancer.add(cyl(0.002, 0.02, 0.035, porcelain, 12, 0, 0.045, 0));
      const dh = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), porcelain);
      dh.position.y = 0.07;
      dancer.add(dh);
      const arm = box(0.04, 0.003, 0.003, porcelain, 0, 0.06, 0);
      arm.rotation.z = 0.5;
      dancer.add(arm);
      mb.add(dancer);
      const key = new THREE.Group();
      key.position.set(0.098, 0.045, 0);
      const shaft = cyl(0.003, 0.003, 0.02, gold, 8, 0.008, 0, 0);
      shaft.rotation.z = Math.PI / 2;
      key.add(shaft);
      key.add(box(0.004, 0.03, 0.012, gold, 0.018, 0, 0));
      mb.add(key);
      root.add(mb);
      refs.musicBox = { dancer, key, group: mb };
    }
    const head = plushHead(std, 1.85, 2.07, ROOM.zf + 0.14);
    refs.head = head;
    refs.headPupil = head.userData.pupil;
    root.add(shadowed(head));

    // trash bin + paper balls
    const bin = cyl(0.15, 0.12, 0.34, std({ color: 0x3a3f44, metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide }), 18, 1.3, 0.17, -0.15);
    bin.geometry = new THREE.CylinderGeometry(0.15, 0.12, 0.34, 18, 1, true);
    root.add(shadowed(bin));
    const paperMat = std({ color: 0xd8d2c0, roughness: 1, flatShading: true });
    for (const [x, z] of [[1.3, -0.15], [1.05, 0.15], [-1.2, 0.3], [0.6, 0.6]]) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), paperMat);
      b.position.set(x, x === 1.3 ? 0.3 : 0.035, z);
      b.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      root.add(shadowed(b));
    }
    // cables on the floor from desk to wall
    const pts = [new THREE.Vector3(0.1, 0.0, -1.1), new THREE.Vector3(0.6, 0.01, -1.4), new THREE.Vector3(1.2, 0.01, -1.6), new THREE.Vector3(1.6, 0.3, -1.79)];
    root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.008, 5), black));
  }

  // ---------------------------------------------------------------- wingback chair (you are sitting in it)
  {
    const chair = new THREE.Group();
    const leather = std({ color: 0x2a1a14, roughness: 0.55 });
    chair.add(box(0.72, 1.15, 0.12, leather, 0, 1.05, 0.82));
    for (const s of [-1, 1]) {
      const wing = box(0.08, 0.62, 0.3, leather, s * 0.36, 1.18, 0.66);
      wing.rotation.y = s * -0.25;
      chair.add(wing);
      chair.add(box(0.1, 0.12, 0.5, leather, s * 0.36, 0.66, 0.55));
    }
    chair.add(box(0.7, 0.14, 0.55, leather, 0, 0.5, 0.55));
    root.add(shadowed(chair, false, true));
  }

  // ---------------------------------------------------------------- ambient
  const hemi = new THREE.HemisphereLight(0x2a3550, 0x080604, 0.16);
  scene.add(hemi);
  refs.hemi = hemi;

  return refs;
}

// ---------------------------------------------------------------- helpers
function dustMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { level: { value: 0 }, time: { value: 0 }, tint: { value: new THREE.Color(0xd8e4ff) } },
    vertexShader: `
      varying vec3 vPos; varying vec3 vN; varying vec3 vView;
      void main() {
        vPos = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float level, time; uniform vec3 tint;
      varying vec3 vPos; varying vec3 vN; varying vec3 vView;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      float n3(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main() {
        float along = clamp(-vPos.z / 6.5, 0.0, 1.0);
        float edge = pow(abs(dot(vN, vView)), 1.5);
        float dust = 0.55 + 0.45 * n3(vPos * 3.0 + vec3(0.0, time * 0.15, time * 0.05));
        float specks = step(0.985, n3(vPos * 22.0 + vec3(time * 0.3, time * 0.2, 0.0)));
        float a = level * edge * (1.0 - along) * (1.0 - along) * (0.05 * dust + 0.25 * specks);
        gl_FragColor = vec4(tint * a, 1.0);
      }`,
  });
}

function stripeTex(a = '#d42020', b = '#f4f0e6') {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? a : b;
    g.fillRect(i * 16, 0, 16, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hazardTex() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c9a51a';
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#111';
  for (let i = -4; i < 12; i++) {
    g.beginPath();
    g.moveTo(0, i * 32);
    g.lineTo(64, i * 32 + 32);
    g.lineTo(64, i * 32 + 48);
    g.lineTo(0, i * 32 + 16);
    g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.4)';
  for (let i = 0; i < 200; i++) g.fillRect(Math.random() * 64, Math.random() * 256, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function plush(std, x, y, z) {
  const g = new THREE.Group();
  const fur = std({ color: 0x6b4322, roughness: 1 });
  const light = std({ color: 0xc9a27a, roughness: 1 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), fur);
  body.scale.set(1, 1.1, 0.9);
  body.position.y = 0.07;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), fur);
  head.position.y = 0.18;
  g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), fur);
    ear.position.set(s * 0.045, 0.23, 0);
    g.add(ear);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), eye);
    e.position.set(s * 0.022, 0.19, 0.052);
    g.add(e);
    const arm = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), fur);
    arm.scale.set(1, 1.6, 1);
    arm.position.set(s * 0.075, 0.08, 0.02);
    g.add(arm);
    const leg = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), fur);
    leg.position.set(s * 0.04, 0.02, 0.05);
    g.add(leg);
  }
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), light);
  muzzle.scale.set(1.2, 0.8, 1);
  muzzle.position.set(0, 0.165, 0.05);
  g.add(muzzle);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.04, 12), std({ color: 0x111111 }));
  hat.position.y = 0.25;
  g.add(hat);
  g.position.set(x, y, z);
  g.rotation.y = -0.45;
  g.rotation.z = 0.08;
  return g;
}

function plushHead(std, x, y, z) {
  // a spare mascot head on the shelf, a bit too big for comfort
  const g = new THREE.Group();
  const fur = std({ color: 0x5b6aa0, roughness: 1 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 14), fur);
  head.position.y = 0.1;
  g.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.14, 4, 8), fur);
    ear.position.set(s * 0.05, 0.28, -0.01);
    ear.rotation.z = s * -0.2;
    g.add(ear);
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), std({ color: 0x050505 }));
    socket.position.set(s * 0.04, 0.12, 0.09);
    g.add(socket);
  }
  // one pupil left, faint
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), new THREE.MeshStandardMaterial({ color: 0x111, emissive: 0xffffff, emissiveIntensity: 0.15 }));
  pupil.position.set(0.042, 0.122, 0.116);
  g.add(pupil);
  g.userData.pupil = pupil.material;
  g.position.set(x, y, z);
  g.rotation.y = -0.6;
  g.rotation.z = 0.25;
  return g;
}

function buildCorridorProps(root, { std, metal, darkMetal, wood }) {
  const T2 = T;
  // ---- west corridor: abandoned party table, fallen chair, hats
  {
    const g = new THREE.Group();
    const cloth = std({ map: checkerCloth(), roughness: 0.9 });
    g.add(box(1.6, 0.04, 0.7, cloth, -5.6, 0.74, -0.45));
    for (const [x, z] of [[-6.3, -0.7], [-4.9, -0.7], [-6.3, -0.2], [-4.9, -0.2]]) g.add(cyl(0.02, 0.02, 0.72, darkMetal, 6, x, 0.36, z));
    // hats and plates on table
    for (let i = 0; i < 4; i++) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 12, 1, true), std({ color: [0xff3a6a, 0x2a6cff, 0xffd23a, 0x30c060][i], side: THREE.DoubleSide }));
      h.position.set(-6.2 + i * 0.4, 0.84, -0.5 + (i % 2) * 0.15);
      g.add(h);
      const p = cyl(0.09, 0.09, 0.01, std({ color: 0xeeeeee }), 16, -6.1 + i * 0.4, 0.765, -0.3);
      g.add(p);
    }
    // fallen chair
    const ch = new THREE.Group();
    ch.add(box(0.42, 0.03, 0.42, std({ color: 0x8a2020 }), 0, 0.45, 0));
    ch.add(box(0.42, 0.45, 0.03, std({ color: 0x8a2020 }), 0, 0.7, -0.2));
    for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) ch.add(cyl(0.015, 0.015, 0.45, darkMetal, 6, x, 0.225, z));
    ch.position.set(-4.0, 0.21, 0.4);
    ch.rotation.set(Math.PI / 2, 0.4, 0);
    g.add(ch);
    // poster + drawings on the corridor walls
    const p1 = plane(0.62, 0.87, std({ map: T2.posterTexture('celebrate') }), -7.2, 1.5, 0.94, Math.PI);
    g.add(p1);
    const p2 = plane(0.28, 0.21, std({ map: T2.drawingTexture(2) }), -3.4, 1.4, -0.845);
    g.add(p2);
    // a lone party hat on the floor near the door
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 12, 1, true), std({ color: 0xff3a6a, side: THREE.DoubleSide }));
    hat.position.set(-2.9, 0.05, 0.3);
    hat.rotation.z = 1.5;
    g.add(hat);
    // dangling ceiling wires
    for (let i = 0; i < 3; i++) g.add(cyl(0.004, 0.004, 0.5 + i * 0.2, std({ color: 0x111111 }), 4, -5 - i * 0.15, 2.6 - (0.25 + i * 0.1), 0.6));
    root.add(shadowed(g));
  }
  // ---- east corridor: wet floor sign, mop bucket, boxes, a balloon
  {
    const g = new THREE.Group();
    const yel = std({ color: 0xd8b020, roughness: 0.5 });
    const sign = new THREE.Group();
    const a = box(0.3, 0.6, 0.015, yel, 0, 0.3, 0.1);
    a.rotation.x = -0.18;
    const b = box(0.3, 0.6, 0.015, yel, 0, 0.3, -0.1);
    b.rotation.x = 0.18;
    sign.add(a, b);
    const lbl = plane(0.24, 0.2, std({ map: T2.labelTexture('小心地滑', { w: 256, h: 200, bg: '#d8b020', fg: '#111', font: 'bold 52px sans-serif' }) }), 0, 0.38, 0.112);
    lbl.rotation.x = -0.18;
    sign.add(lbl);
    sign.position.set(3.6, 0, 0.55);
    sign.rotation.y = 0.4;
    g.add(sign);
    // bucket
    g.add(cyl(0.18, 0.15, 0.3, std({ color: 0x2050a0, roughness: 0.5 }), 16, 5.0, 0.15, -0.55));
    g.add(cyl(0.012, 0.012, 1.3, wood, 6, 5.05, 0.65, -0.5).rotateZ(0.25));
    // cardboard boxes
    const bm = std({ color: 0x8a6a40, roughness: 0.95 });
    g.add(box(0.5, 0.4, 0.5, bm, 6.6, 0.2, 0.6));
    g.add(box(0.4, 0.35, 0.4, bm, 6.55, 0.575, 0.62).rotateY(0.3));
    g.add(box(0.5, 0.4, 0.5, bm, 7.2, 0.2, 0.55).rotateY(-0.2));
    // posters
    g.add(plane(0.42, 0.6, std({ map: T2.posterTexture('missing') }), 4.6, 1.55, -0.845));
    g.add(plane(0.5, 0.7, std({ map: T2.posterTexture('menu') }), 6.0, 1.5, 0.945, Math.PI));
    // balloon against the ceiling
    const bal = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), std({ color: 0xb01020, roughness: 0.25 }));
    bal.scale.set(1, 1.18, 1);
    bal.position.set(5.6, 2.4, 0.2);
    g.add(bal);
    g.add(cyl(0.002, 0.002, 1.6, std({ color: 0xdddddd }), 4, 5.6, 1.45, 0.2));
    root.add(shadowed(g));
    root.userData.balloon = bal;
  }
}

function checkerCloth() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#b02020' : '#eee8dc';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1.5);
  return t;
}
