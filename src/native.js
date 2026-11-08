// The desktop shell's bridge (electron/preload.cjs). null outside the app.
export const native = typeof window !== 'undefined' && window.native ? window.native : null;

// debug mode (free night select + info panel) exists only in tester builds
export const DEBUG_ALLOWED = !!native?.debugBuild;

export const VERSION = native?.version || '0.0.0';

// 'dev' (debug mode, DevTools) or 'release'
export const CHANNEL = native?.channel || 'release';
