// Client-side event bus (UI, audio, 3D). Sim events are forwarded here by game.js.
const listeners = new Map();

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}

export function emit(evt, data) {
  const set = listeners.get(evt);
  if (set) for (const fn of set) fn(data);
  const any = listeners.get('*');
  if (any) for (const fn of any) fn(evt, data);
}
