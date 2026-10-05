// Movement graph. Map rooms plus corridor sub-positions (far / near / door)
// so the player can see an actor approach under the door light.

export const NODES = [
  '01', '02', '03', '04', '05', '06', '09', '10', '11', '12', '13',
  '07F', '07N', 'DOOR_L',
  '08F', '08N', 'DOOR_R',
  'BACKP', 'DOOR_B',
  'D1', 'D2', 'VENT',
];

const EDGES = [
  ['04', '01'], ['01', '02'], ['05', '06'], ['06', '02'], ['03', '02'], ['04', '03'],
  ['03', '09'], ['09', '10'], ['06', '11'], ['11', '13'],
  ['02', '07F'], ['07F', '07N'], ['07N', 'DOOR_L'],
  ['02', '08F'], ['11', '08F'], ['08F', '08N'], ['08N', 'DOOR_R'],
  ['10', 'BACKP'], ['BACKP', '12'], ['12', 'DOOR_B'],
  ['11', 'D1'], ['D1', 'D2'], ['D2', 'VENT'],
];

export const ADJ = {};
for (const n of NODES) ADJ[n] = [];
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}

// which map room's sensor hears a node
export const SENSOR_ROOM = {
  '07F': '07', '07N': '07', DOOR_L: '07',
  '08F': '08', '08N': '08', DOOR_R: '08',
  BACKP: null, DOOR_B: '12',
  D1: '11', D2: '11', VENT: '11',
};

export function sensorRoom(node) {
  return node in SENSOR_ROOM ? SENSOR_ROOM[node] : node;
}

// map room -> nodes inside it (for scans / room lights)
export function nodesInRoom(room) {
  return NODES.filter((n) => sensorRoom(n) === room);
}

export const DOOR_NODES = { DOOR_L: 'L', DOOR_R: 'R', DOOR_B: 'B', VENT: 'T' };

// nodes next to a door, for weak EMI
export const NEAR_DOOR = { '07N': 'L', '08N': 'R', '12': 'B', D2: 'T' };

// which side of the office a node is heard from
export const NODE_SIDE = {
  '02': 'F', '03': 'L', '04': 'L', '09': 'L', '07F': 'L', '07N': 'L', DOOR_L: 'L',
  '01': 'F', '05': 'R', '06': 'R', '11': 'R', '13': 'R', '08F': 'R', '08N': 'R', DOOR_R: 'R',
  '10': 'B', BACKP: 'B', '12': 'B', DOOR_B: 'B', D1: 'T', D2: 'T', VENT: 'T',
};

const distCache = new Map();
export function dist(a, b) {
  const key = a + '|' + b;
  if (distCache.has(key)) return distCache.get(key);
  const seen = new Map([[a, 0]]);
  const q = [a];
  while (q.length) {
    const n = q.shift();
    for (const m of ADJ[n]) {
      if (!seen.has(m)) {
        seen.set(m, seen.get(n) + 1);
        q.push(m);
      }
    }
  }
  const d = seen.has(b) ? seen.get(b) : Infinity;
  distCache.set(key, d);
  return d;
}

// next node on a shortest path from a to b, avoiding `blocked(node)`
export function stepToward(a, b, blocked = () => false) {
  if (a === b) return a;
  const prev = new Map([[a, null]]);
  const q = [a];
  while (q.length) {
    const n = q.shift();
    if (n === b) break;
    for (const m of ADJ[n]) {
      if (prev.has(m) || (m !== b && blocked(m))) continue;
      prev.set(m, n);
      q.push(m);
    }
  }
  if (!prev.has(b)) return null;
  let cur = b;
  while (prev.get(cur) !== a) cur = prev.get(cur);
  return cur;
}
