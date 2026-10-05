// Procedural canvas textures: nothing is loaded from disk.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function rnd(a, b) {
  return a + Math.random() * (b - a);
}

function tex(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// soft dirt blotches + speckle
function grime(g, w, h, amount = 1, color = '0,0,0') {
  for (let i = 0; i < 60 * amount; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = rnd(20, 160);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${color},${rnd(0.05, 0.18)})`);
    grd.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

// vertical drips / water stains running down from the top
function stains(g, w, h, n = 12, color = '40,30,15') {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w;
    const len = rnd(h * 0.1, h * 0.6);
    const wd = rnd(4, 26);
    const grd = g.createLinearGradient(0, 0, 0, len);
    grd.addColorStop(0, `rgba(${color},${rnd(0.15, 0.35)})`);
    grd.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grd;
    g.fillRect(x, 0, wd, len);
  }
}

export function floorTexture() {
  const [c, g] = canvas(1024, 1024);
  const n = 8;
  const s = 1024 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const w = (x + y) % 2 === 0;
      const v = w ? rnd(170, 200) : rnd(14, 26);
      g.fillStyle = `rgb(${v},${v},${v + (w ? 6 : 4)})`;
      g.fillRect(x * s, y * s, s, s);
    }
  }
  // grout
  g.strokeStyle = 'rgba(30,30,30,0.6)';
  g.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    g.beginPath();
    g.moveTo(i * s, 0);
    g.lineTo(i * s, 1024);
    g.moveTo(0, i * s);
    g.lineTo(1024, i * s);
    g.stroke();
  }
  // scuffs & cracks
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 18; i++) {
    g.lineWidth = rnd(0.5, 2);
    g.beginPath();
    let x = Math.random() * 1024;
    let y = Math.random() * 1024;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += rnd(-40, 40);
      y += rnd(-40, 40);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  grime(g, 1024, 1024, 1.6, '25,18,8');
  return tex(c, { repeat: [1, 1] });
}

export function wallTexture({ tint = [58, 74, 72], band = true } = {}) {
  // represents a 2m wide x 2.6m tall wall section
  const W = 800;
  const H = 1040;
  const [c, g] = canvas(W, H);
  // upper painted cinder block
  g.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.lineWidth = 3;
  const bh = 80;
  const bw = 160;
  for (let y = 0; y < H; y += bh) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
    const off = (y / bh) % 2 ? bw / 2 : 0;
    for (let x = off; x < W; x += bw) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y + bh);
      g.stroke();
    }
  }
  if (band) {
    // lower tile wainscot: small checker, 1.0m high = 400px
    const top = H - 400;
    const ts = 40;
    for (let y = top; y < H; y += ts) {
      for (let x = 0; x < W; x += ts) {
        const k = ((x + y) / ts) % 2 === 0;
        const v = k ? rnd(150, 175) : rnd(28, 40);
        g.fillStyle = k ? `rgb(${v},${v + 4},${v + 10})` : `rgb(${v * 0.6},${v * 0.7},${v * 1.4})`;
        g.fillRect(x, y, ts, ts);
      }
    }
    // red trim stripe
    g.fillStyle = '#5e1414';
    g.fillRect(0, top - 22, W, 22);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, top - 22, W, 3);
  }
  stains(g, W, H, 14);
  grime(g, W, H, 1.4, '20,15,5');
  // bottom dirt line
  const grd = g.createLinearGradient(0, H - 90, 0, H);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(10,6,0,0.55)');
  g.fillStyle = grd;
  g.fillRect(0, H - 90, W, 90);
  return tex(c);
}

export function ceilingTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#6a6a62';
  g.fillRect(0, 0, 512, 512);
  // acoustic tile speckle
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd(0.05, 0.25)})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, rnd(1, 3), rnd(1, 3));
  }
  g.strokeStyle = '#2a2a26';
  g.lineWidth = 8;
  g.strokeRect(0, 0, 512, 512);
  // water stain rings
  for (let i = 0; i < 3; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = rnd(40, 120);
    g.strokeStyle = 'rgba(90,60,20,0.35)';
    g.lineWidth = rnd(2, 6);
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(90,60,20,0.12)';
    g.fill();
  }
  grime(g, 512, 512, 0.6);
  return tex(c);
}

export function metalTexture(base = '#4a4f55') {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    g.strokeStyle = `rgba(255,255,255,${rnd(0.01, 0.05)})`;
    g.beginPath();
    const y = Math.random() * 256;
    g.moveTo(0, y);
    g.lineTo(256, y + rnd(-3, 3));
    g.stroke();
  }
  grime(g, 256, 256, 0.5, '60,30,10');
  return tex(c);
}

export function woodTexture() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#5a3e26';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 120; i++) {
    g.strokeStyle = `rgba(${rnd(20, 50)},${rnd(10, 25)},0,${rnd(0.15, 0.4)})`;
    g.lineWidth = rnd(1, 3);
    g.beginPath();
    const y = Math.random() * 256;
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
    g.stroke();
  }
  grime(g, 512, 256, 0.6);
  return tex(c);
}

// ---------------------------------------------------------------- posters
function mascotFace(g, x, y, r, { ears = 'bear', fur = '#8a5a2b', eye = '#fff', hat = null } = {}) {
  g.fillStyle = fur;
  if (ears === 'bear') {
    g.beginPath();
    g.arc(x - r * 0.75, y - r * 0.75, r * 0.32, 0, Math.PI * 2);
    g.arc(x + r * 0.75, y - r * 0.75, r * 0.32, 0, Math.PI * 2);
    g.fill();
  } else if (ears === 'rabbit') {
    g.beginPath();
    g.ellipse(x - r * 0.4, y - r * 1.3, r * 0.2, r * 0.7, -0.15, 0, Math.PI * 2);
    g.ellipse(x + r * 0.4, y - r * 1.3, r * 0.2, r * 0.7, 0.15, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  // muzzle
  g.fillStyle = 'rgba(255,230,190,0.85)';
  g.beginPath();
  g.ellipse(x, y + r * 0.38, r * 0.5, r * 0.35, 0, 0, Math.PI * 2);
  g.fill();
  // eyes: big, slightly too big
  g.fillStyle = eye;
  g.beginPath();
  g.arc(x - r * 0.35, y - r * 0.15, r * 0.22, 0, Math.PI * 2);
  g.arc(x + r * 0.35, y - r * 0.15, r * 0.22, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#111';
  g.beginPath();
  g.arc(x - r * 0.32, y - r * 0.12, r * 0.08, 0, Math.PI * 2);
  g.arc(x + r * 0.38, y - r * 0.12, r * 0.08, 0, Math.PI * 2);
  g.fill();
  // nose + smile
  g.fillStyle = '#1a1010';
  g.beginPath();
  g.ellipse(x, y + r * 0.22, r * 0.12, r * 0.08, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1a1010';
  g.lineWidth = r * 0.05;
  g.beginPath();
  g.arc(x, y + r * 0.3, r * 0.3, 0.2, Math.PI - 0.2);
  g.stroke();
  // teeth
  g.fillStyle = '#eee';
  for (let i = -2; i <= 2; i++) g.fillRect(x + i * r * 0.1 - r * 0.04, y + r * 0.52, r * 0.08, r * 0.08);
  if (hat) {
    g.fillStyle = hat;
    g.beginPath();
    g.moveTo(x - r * 0.3, y - r * 0.85);
    g.lineTo(x, y - r * 1.6);
    g.lineTo(x + r * 0.3, y - r * 0.85);
    g.fill();
  }
}

function aged(g, w, h) {
  // yellowing, foxing, creases, torn corners
  g.fillStyle = 'rgba(160,120,40,0.18)';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(110,70,20,${rnd(0.03, 0.12)})`;
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, rnd(2, 30), 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.15)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, h * rnd(0.3, 0.7));
  g.lineTo(w, h * rnd(0.3, 0.7));
  g.stroke();
  grime(g, w, h, 0.3);
}

export function posterTexture(kind) {
  const [c, g] = canvas(512, 720);
  const W = 512;
  const H = 720;
  if (kind === 'celebrate') {
    g.fillStyle = '#1b1240';
    g.fillRect(0, 0, W, H);
    // starburst
    for (let i = 0; i < 24; i++) {
      g.fillStyle = i % 2 ? '#2b1d66' : '#21165a';
      g.beginPath();
      g.moveTo(W / 2, H * 0.55);
      const a1 = (i / 24) * Math.PI * 2;
      const a2 = ((i + 1) / 24) * Math.PI * 2;
      g.lineTo(W / 2 + Math.cos(a1) * 900, H * 0.55 + Math.sin(a1) * 900);
      g.lineTo(W / 2 + Math.cos(a2) * 900, H * 0.55 + Math.sin(a2) * 900);
      g.fill();
    }
    g.fillStyle = '#ffd23a';
    g.font = 'bold 86px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.fillText('PARTY!', W / 2, 120);
    g.font = 'bold 34px Impact, "Arial Black", sans-serif';
    g.fillStyle = '#fff';
    g.fillText('STARLIGHT PIZZA', W / 2, 170);
    mascotFace(g, 150, 470, 85, { ears: 'bear', fur: '#7a4a22', hat: '#2a6cff' });
    mascotFace(g, 362, 470, 85, { ears: 'rabbit', fur: '#6a7ab8' });
    mascotFace(g, 256, 380, 70, { ears: 'none', fur: '#d4a020', hat: '#ff3a6a' });
    g.font = 'bold 30px sans-serif';
    g.fillStyle = '#ffd23a';
    g.fillText('★ 和朋友们一起狂欢! ★', W / 2, 660);
  } else if (kind === 'rules') {
    g.fillStyle = '#e8e0c8';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#8a1010';
    g.fillRect(0, 0, W, 90);
    g.fillStyle = '#fff';
    g.font = 'bold 44px sans-serif';
    g.textAlign = 'center';
    g.fillText('夜班员工须知', W / 2, 62);
    g.textAlign = 'left';
    g.fillStyle = '#222';
    g.font = '26px sans-serif';
    const lines = [
      '1. 值班期间请勿离开保安室.',
      '2. 请保持终端始终处于开启状态.',
      '3. 表演者在夜间会进入"自由漫游"',
      '   模式, 以防止伺服电机锁死.',
      '4. 如遇表演者靠近, 请保持冷静.',
      '5. 请勿尝试打开后门.',
      '6. 请勿与表演者进行眼神接触.',
      '7. 06:00 前完成全部值班任务.',
      '',
      '   星光娱乐公司 管理部',
      '   1993年 修订',
    ];
    lines.forEach((l, i) => g.fillText(l, 36, 150 + i * 46));
    // someone scribbled on it
    g.strokeStyle = 'rgba(180,20,20,0.8)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(30, 380);
    g.lineTo(480, 400);
    g.stroke();
    g.fillStyle = 'rgba(160,20,20,0.85)';
    g.font = 'italic 30px sans-serif';
    g.fillText('它们会看着你', 260, 690);
  } else if (kind === 'missing') {
    g.fillStyle = '#efe9da';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#111';
    g.font = 'bold 92px Impact, sans-serif';
    g.textAlign = 'center';
    g.fillText('寻 人', W / 2, 110);
    g.fillStyle = '#999';
    g.fillRect(106, 150, 300, 340);
    g.fillStyle = '#777';
    g.beginPath();
    g.arc(256, 280, 80, 0, Math.PI * 2);
    g.fill();
    g.fillRect(156, 360, 200, 130);
    g.fillStyle = '#222';
    g.font = '26px sans-serif';
    g.fillText('最后一次被看到是在', W / 2, 550);
    g.fillText('星光披萨乐园 · 派对房', W / 2, 590);
    g.fillText('1993.06.26', W / 2, 640);
  } else if (kind === 'menu') {
    g.fillStyle = '#c21f1f';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff';
    for (let y = 0; y < H; y += 60) for (let x = (y / 60) % 2 ? 30 : 0; x < W; x += 60) g.fillRect(x, y, 30, 30);
    g.fillStyle = '#fff6e0';
    g.fillRect(40, 60, W - 80, H - 120);
    g.fillStyle = '#c21f1f';
    g.font = 'bold 54px Impact, sans-serif';
    g.textAlign = 'center';
    g.fillText('MENU', W / 2, 130);
    g.fillStyle = '#333';
    g.font = '28px sans-serif';
    ['星光芝士披萨 ...... $4.99', '派对套餐 ............ $12.99', '汽水 (大) ........... $1.25', '生日蛋糕 ............ $8.50', '惊喜礼物盒 ......... $?.??']
      .forEach((l, i) => g.fillText(l, W / 2, 210 + i * 60));
    mascotFace(g, W / 2, 560, 70, { ears: 'bear', fur: '#7a4a22' });
  }
  aged(g, W, H);
  return tex(c);
}

export function drawingTexture(seed) {
  // a child's crayon drawing
  const [c, g] = canvas(256, 192);
  g.fillStyle = '#f4f0e6';
  g.fillRect(0, 0, 256, 192);
  const cols = ['#d42', '#24c', '#1a2', '#c80', '#636', '#222'];
  const crayon = (col, w) => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.lineCap = 'round';
  };
  // ground + sun
  crayon('#3a3', 4);
  g.beginPath();
  g.moveTo(0, 170);
  for (let x = 0; x < 256; x += 16) g.lineTo(x, 168 + Math.random() * 6);
  g.stroke();
  if (seed % 2) {
    crayon('#fb0', 4);
    g.beginPath();
    g.arc(220, 30, 16, 0, Math.PI * 2);
    g.stroke();
  }
  // figures: mascots are big, the kid is small
  const n = 2 + (seed % 3);
  for (let i = 0; i < n; i++) {
    const x = 40 + i * (180 / n);
    const big = i !== n - 1;
    const h = big ? 110 : 50;
    const col = cols[(seed + i) % cols.length];
    crayon(col, 3);
    g.beginPath();
    g.arc(x, 170 - h, big ? 22 : 10, 0, Math.PI * 2);
    g.stroke();
    if (big) {
      g.beginPath();
      g.arc(x - 16, 170 - h - 20, 7, 0, Math.PI * 2);
      g.arc(x + 16, 170 - h - 20, 7, 0, Math.PI * 2);
      g.stroke();
      // black eyes
      g.fillStyle = '#000';
      g.beginPath();
      g.arc(x - 8, 170 - h - 3, 4, 0, Math.PI * 2);
      g.arc(x + 8, 170 - h - 3, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.moveTo(x, 170 - h + (big ? 22 : 10));
    g.lineTo(x, 170 - h * 0.35);
    g.lineTo(x - 12, 170);
    g.moveTo(x, 170 - h * 0.35);
    g.lineTo(x + 12, 170);
    g.moveTo(x - 18, 170 - h * 0.65);
    g.lineTo(x + 18, 170 - h * 0.65);
    g.stroke();
  }
  g.fillStyle = '#c22';
  g.font = '18px sans-serif';
  g.fillText(['我和朋友们', '生日快乐', '别走'][seed % 3], 12, 24);
  aged(g, 256, 192);
  return tex(c);
}

export function labelTexture(text, { w = 256, h = 64, bg = '#d8cfb4', fg = '#333', font = 'bold 30px sans-serif' } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2);
  return tex(c);
}

export function paperTexture(lines = 14) {
  const [c, g] = canvas(256, 330);
  g.fillStyle = '#ece6d6';
  g.fillRect(0, 0, 256, 330);
  g.fillStyle = 'rgba(40,40,60,0.6)';
  for (let i = 0; i < lines; i++) g.fillRect(20, 30 + i * 20, rnd(80, 210), 4);
  aged(g, 256, 330);
  return tex(c);
}

export function clockTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#e8e2d0';
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#222';
  g.font = 'bold 26px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    g.fillText(String(i), 128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96);
  }
  aged(g, 256, 256);
  return tex(c);
}

export function keyboardTexture() {
  const [c, g] = canvas(512, 160);
  g.fillStyle = '#bdb39a';
  g.fillRect(0, 0, 512, 160);
  for (let r = 0; r < 5; r++) {
    for (let k = 0; k < 15; k++) {
      g.fillStyle = r === 0 ? '#9c937c' : '#d6cdb4';
      g.fillRect(12 + k * 33, 10 + r * 29, 28, 24);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(12 + k * 33, 30 + r * 29, 28, 4);
    }
  }
  grime(g, 512, 160, 0.5);
  return tex(c);
}
