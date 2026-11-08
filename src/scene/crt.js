// CRT screen material: barrel curvature, scanlines, aperture grille,
// phosphor glow, rolling refresh band, flicker and the power-on collapse.
import * as THREE from 'three';

// must match curve() in the shader: maps glass uv -> texture uv
export function crtCurve(u, v) {
  let x = u * 2 - 1;
  let y = v * 2 - 1;
  const ox = Math.abs(y) / 6.0;
  const oy = Math.abs(x) / 5.0;
  x += x * ox * ox;
  y += y * oy * oy;
  return [x * 0.5 + 0.5, y * 0.5 + 0.5];
}

export function crtMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      time: { value: 0 },
      power: { value: 0 },
      glitch: { value: 0 },
      bright: { value: 0.88 },
      magnet: { value: 0 },
      degauss: { value: 0 },
      calm: { value: 0 },     // 1 = reduced flashing (settings)
      heat: { value: 0 },
      tint: { value: new THREE.Vector3(1, 1, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float time;
      uniform float power;
      uniform float glitch;
      uniform float bright;
      uniform float magnet, degauss, heat, calm;
      uniform vec3 tint;
      varying vec2 vUv;

      vec2 curve(vec2 uv) {
        uv = uv * 2.0 - 1.0;
        vec2 o = abs(uv.yx) / vec2(6.0, 5.0);
        uv += uv * o * o;
        return uv * 0.5 + 0.5;
      }
      float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }

      void main() {
        vec2 uv = curve(vUv);
        // heat shimmer
        uv.x += heat * 0.004 * sin(uv.y * 30.0 + time * 6.0);
        // degauss ripple
        if (degauss > 0.0) {
          vec2 dc = uv - 0.5;
          float rr = length(dc);
          uv += dc / max(rr, 1e-3) * sin(rr * 55.0 - degauss * 30.0) * 0.012 * degauss;
        }
        // warm-up: picture collapses to a line, then opens
        float open = clamp(power * 1.4 - 0.2, 0.0, 1.0);
        float ys = mix(0.004, 1.0, open);
        vec2 suv = vec2(uv.x, (uv.y - 0.5) / ys + 0.5);

        // horizontal sync wobble, worse during glitches
        float wob = sin(uv.y * 220.0 + time * 4.0) * 0.00035;
        wob += glitch * (rand(vec2(floor(uv.y * 60.0), floor(time * 30.0))) - 0.5) * 0.04;
        suv.x += wob;

        vec3 glass = vec3(0.008, 0.010, 0.014);
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          gl_FragColor = vec4(glass, 1.0);
          return;
        }
        vec3 col = vec3(0.0);
        if (suv.y >= 0.0 && suv.y <= 1.0) {
          float ca = 0.0011;
          col.r = texture2D(map, suv + vec2(ca, 0.0)).r;
          col.g = texture2D(map, suv).g;
          col.b = texture2D(map, suv - vec2(ca, 0.0)).b;
          vec3 glow = vec3(0.0);
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.7854;
            glow += texture2D(map, suv + vec2(cos(a), sin(a)) * 0.0045).rgb;
          }
          glow /= 8.0;
          col = col * 0.85 + glow * 0.28;
        }

        // scanlines (480 visible lines) + aperture grille, faded out when
        // they would alias at a distance
        float lines = uv.y * 480.0;
        float fw = fwidth(lines);
        float sl = 0.5 + 0.5 * cos(lines * 6.28318);
        float slAmt = 0.32 * clamp(1.0 - fw * 1.6, 0.0, 1.0);
        col *= 1.0 - slAmt * sl;
        float gx = uv.x * 640.0 * 3.0;
        float gw = fwidth(gx);
        float m = mod(floor(gx), 3.0);
        vec3 mask = m < 1.0 ? vec3(1.0, 0.8, 0.8) : m < 2.0 ? vec3(0.8, 1.0, 0.8) : vec3(0.8, 0.8, 1.0);
        col *= mix(vec3(1.0), mask, clamp(1.0 - gw * 1.2, 0.0, 1.0) * 0.6);

        // EMI colour fringing + magnetised purity blotches
        vec3 blot = vec3(1.0 + 0.5 * sin(uv.x * 6.0 + 1.3) * cos(uv.y * 4.0),
                         1.0 + 0.45 * sin(uv.y * 5.0 + 2.1) * cos(uv.x * 3.0 + 0.5),
                         1.0 + 0.5 * cos(uv.x * 4.5 - uv.y * 3.5));
        col *= mix(vec3(1.0), blot, magnet);
        col *= tint;
        if (degauss > 0.0) col += vec3(0.5, 0.2, 0.6) * degauss * mix(0.25, 0.06, calm) * sin(length(uv - 0.5) * 40.0 - degauss * 25.0);

        // rolling refresh band + mains flicker
        float band = fract(uv.y * 0.6 - time * 0.11);
        col *= 1.0 + 0.06 * exp(-pow(band - 0.5, 2.0) * 90.0);
        col *= 0.975 + 0.025 * sin(time * 113.0);

        // static noise
        col += (rand(uv * 731.0 + time) - 0.5) * 0.035;

        // vignette inside the tube
        vec2 d = uv - 0.5;
        col *= clamp(1.0 - dot(d, d) * 1.4, 0.0, 1.0);

        // power-on flash
        col += vec3(0.6, 0.7, 1.0) * (1.0 - open) * step(abs(uv.y - 0.5), 0.003 + open * 0.5) * step(0.01, power) * 2.0;

        col *= bright * smoothstep(0.0, 0.15, power);

        // glass: faint reflection of the room
        vec2 r = vUv - vec2(0.28, 0.78);
        col += vec3(0.035, 0.03, 0.025) * smoothstep(0.45, 0.0, length(r * vec2(1.0, 1.6)));
        col += glass;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
