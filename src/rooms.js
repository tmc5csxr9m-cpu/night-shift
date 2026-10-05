// Building layout, shared by the terminal map and the ambient sound director.
// x/y/w/h are terminal cells on the map page. World positions are derived so
// that "up" on the map is in front of the player (-Z) and the office is (0,0).

export const ROOMS = [
  { id: '04', name: '后台', en: 'BACKSTAGE', x: 2, y: 3, w: 12, h: 5 },
  { id: '01', name: '主舞台', en: 'SHOW STAGE', x: 15, y: 3, w: 24, h: 5 },
  { id: '05', name: '后厨', en: 'KITCHEN', x: 40, y: 3, w: 13, h: 5 },
  { id: '03', name: '派对房', en: 'PARTY RM', x: 2, y: 9, w: 12, h: 7 },
  { id: '02', name: '餐厅', en: 'DINING AREA', x: 15, y: 9, w: 24, h: 7 },
  { id: '06', name: '卫生间', en: 'RESTROOMS', x: 40, y: 9, w: 13, h: 7 },
  { id: '09', name: '储藏室', en: 'STORAGE', x: 2, y: 17, w: 12, h: 5 },
  { id: '07', name: '西廊', en: 'W.HALL', x: 15, y: 17, w: 7, h: 7 },
  { id: 'OF', name: '保安室', en: 'OFFICE', x: 23, y: 18, w: 8, h: 5 },
  { id: '08', name: '东廊', en: 'E.HALL', x: 32, y: 17, w: 7, h: 7 },
  { id: '11', name: '通风井', en: 'VENT SHAFT', x: 40, y: 17, w: 13, h: 5 },
  { id: '10', name: '配电室', en: 'POWER RM', x: 2, y: 23, w: 12, h: 4 },
  { id: '12', name: '后廊', en: 'BACK', x: 23, y: 24, w: 8, h: 3 },
  { id: '13', name: '员工室', en: 'STAFF RM', x: 40, y: 23, w: 13, h: 4 },
];

// passages between rooms, drawn in the 1-cell gaps
export const DOORS = [
  { x: 14, y: 5, ch: '═' },
  { x: 26, y: 8, ch: '║' },
  { x: 46, y: 8, ch: '║' },
  { x: 39, y: 12, ch: '═' },
  { x: 14, y: 12, ch: '═' },
  { x: 8, y: 8, ch: '║' },
  { x: 8, y: 16, ch: '║' },
  { x: 8, y: 22, ch: '║' },
  { x: 18, y: 16, ch: '║' },
  { x: 35, y: 16, ch: '║' },
  { x: 39, y: 19, ch: '═' },
  { x: 46, y: 22, ch: '║' },
  { x: 46, y: 16, ch: '║' },
  { x: 14, y: 25, ch: '═' }, { x: 15, y: 25, ch: '═' }, { x: 16, y: 25, ch: '═' },
  { x: 17, y: 25, ch: '═' }, { x: 18, y: 25, ch: '═' }, { x: 19, y: 25, ch: '═' },
  { x: 20, y: 25, ch: '═' }, { x: 21, y: 25, ch: '═' }, { x: 22, y: 25, ch: '═' },
  // office doors: left, right, back
  { x: 22, y: 20, office: 'L' },
  { x: 31, y: 20, office: 'R' },
  { x: 27, y: 23, office: 'B' },
];

const OFFICE = ROOMS.find((r) => r.id === 'OF');
const OCX = OFFICE.x + OFFICE.w / 2;
const OCY = OFFICE.y + OFFICE.h / 2;

// metres per map cell
export function roomWorldPos(room) {
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  return { x: (cx - OCX) * 0.75, y: 1.2, z: (cy - OCY) * 1.6 };
}

export function roomById(id) {
  return ROOMS.find((r) => r.id === id);
}
