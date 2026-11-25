/** GLSL ES 3.00 sources for the film-title liquid overlay (see filmTitle.ts for the pass order). */

/** Full-target triangle; vUv is 0..1 over the current viewport. */
export const VERT = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Downsample: one bilinear tap at the centre of each 2x2 block = box average of the glyph alpha. */
export const DOWN = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 o;
void main() { o = vec4(texture(uTex, vUv).a); }`;

/** Separable gaussian on the alpha channel. uDir is the texel step (1/size along one axis); uSigma is in texels. */
export const BLUR = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform float uSigma;
in vec2 vUv;
out vec4 o;
const int N = 16;
void main() {
  if (uSigma < 0.05) { o = vec4(texture(uTex, vUv).a); return; }
  float step = max(uSigma * 2.6 / float(N), 0.5);
  float inv = 1.0 / (2.0 * uSigma * uSigma);
  float sum = 0.0;
  float wsum = 0.0;
  for (int i = -N; i <= N; i++) {
    float x = float(i) * step;
    float w = exp(-x * x * inv);
    sum += texture(uTex, vUv + uDir * x).a * w;
    wsum += w;
  }
  o = vec4(sum / wsum);
}`;

/**
 * Cut: the blurred field thresholded into ink. The threshold drops a little as liquid rises (ink spreads
 * and bridges), and the smoothstep band widens with edge/edgeAmount so blobs get soft rims.
 */
const CUT_FN = /* glsl */ `
uniform float uLiquid;
uniform float uEdge;
uniform float uEdgeAmount;
float cut(float field) {
  float t = 0.5 - 0.12 * uLiquid;
  float w = (0.012 + 0.08 * uEdgeAmount * uLiquid) * uEdge * 0.5;
  return smoothstep(t - w, t + w, field);
}`;

/** Glow source: the cut ink at field resolution (then blurred by BLUR with the glow sigma). */
export const CUT = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
${CUT_FN}
in vec2 vUv;
out vec4 o;
void main() { o = vec4(cut(texture(uTex, vUv).a)); }`;

/**
 * Show: full-resolution composite into the overlay. At liquid 0 the ink is exactly the rasterised glyph
 * alpha (crisp text); as liquid rises it crossfades to the thresholded field. Premultiplied output.
 */
export const SHOW = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform sampler2D uField;
uniform sampler2D uGlow;
uniform vec3 uColor;
uniform vec3 uGlowColor;
uniform float uGlowAlpha;
uniform float uOpacity;
${CUT_FN}
in vec2 vUv;
out vec4 o;
void main() {
  float src = texture(uSrc, vUv).a;
  float ink = mix(src, cut(texture(uField, vUv).a), smoothstep(0.0, 0.18, uLiquid));
  float g = uGlowAlpha > 0.0 ? texture(uGlow, vUv).a * uGlowAlpha * (1.0 - ink) : 0.0;
  o = vec4(uColor * ink + uGlowColor * g, ink + g) * uOpacity;
}`;
