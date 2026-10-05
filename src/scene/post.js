// Post-processing: bloom for the bulbs / CRT, then a "cheap camcorder"
// grade: film grain, vignette, slight chromatic fringe and a cold tint.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 1.15 },
    grain: { value: 0.07 },
    fringe: { value: 0.0018 },
    dark: { value: 0 },        // 0..1 extra darkening (blackouts)
    focus: { value: 0 },       // 0..1 while looking at the terminal
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, grain, fringe, dark, focus;
    varying vec2 vUv;
    float rand(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      float f = fringe * (1.0 - focus * 0.7);
      vec3 c;
      c.r = texture2D(tDiffuse, vUv - d * f * 4.0 * r2 * 4.0).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv + d * f * 4.0 * r2 * 4.0).b;
      // cold, slightly green shadows; warm highlights survive
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, c * vec3(0.86, 1.0, 1.06), smoothstep(0.35, 0.0, l) * 0.6);
      c = mix(vec3(l), c, 0.86);
      // vignette
      c *= clamp(1.0 - r2 * vignette * (1.0 - focus * 0.4), 0.0, 1.0);
      // grain (luma-weighted so blacks stay black-ish)
      float n = rand(vUv * vec2(1920.0, 1080.0) + fract(time * 7.13)) - 0.5;
      c += n * grain * (0.35 + l);
      c *= 1.0 - dark;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export function makeComposer(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.5, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  return { composer, bloom, grade };
}
