// Seeded RNG (xoshiro128**) — the only randomness allowed inside src/sim.

function splitmix32(a) {
  return () => {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^= t >>> 15) >>> 0;
  };
}

export class Rng {
  constructor(seed = 1) {
    const sm = splitmix32(seed >>> 0);
    this.s = [sm(), sm(), sm(), sm()];
  }

  // uint32
  next() {
    const s = this.s;
    const r = Math.imul(((Math.imul(s[1], 5) << 7) | (Math.imul(s[1], 5) >>> 25)), 9);
    const t = s[1] << 9;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = (s[3] << 11) | (s[3] >>> 21);
    return r >>> 0;
  }

  // [0,1)
  float() {
    return this.next() / 4294967296;
  }

  range(a, b) {
    return a + (b - a) * this.float();
  }

  int(n) {
    return Math.floor(this.float() * n);
  }

  // 1..20
  d20() {
    return 1 + this.int(20);
  }

  chance(p) {
    return this.float() < p;
  }

  pick(arr) {
    return arr[this.int(arr.length)];
  }

  normal() {
    const u = Math.max(1e-9, this.float());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.float());
  }
}
