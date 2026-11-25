// Depth-mapped point cloud. Positions are in image-height units, portrait plane at z = 0.
// Phases: scatter --uIntro--> dust field --uMorph--> portrait relief (target `position`).
attribute vec3 aColor;   // sRGB 0..1
attribute float aKey;    // morph order key 0..1 (0 = first)
attribute float aSeed;   // 0..1

uniform float uTime;
uniform float uIntro;
uniform float uMorph;
uniform float uPhoto;
uniform float uFly;
uniform float uSplit;
uniform vec2 uRes;
uniform sampler2D tWear;
uniform float uWearActive;
uniform float uRecede;
uniform float uDim;
uniform float uImgAspect;
uniform vec2 uCenter;          // camera.centerX / centerY
uniform float uDepthScale;
uniform float uIntroLeftRight; // 1 → intro.order left-right, 0 → near-first
uniform float uIntroSpread;
uniform float uSpread;         // look.spread
uniform float uLoose;
uniform float uStagger;
uniform float uCurlAmp;
uniform float uCurlScale;
uniform float uCurlSpeed;
uniform float uSwirl;
uniform float uLifeMove;
uniform float uLifeRest;
uniform float uLifeSpeed;
uniform float uSize;
uniform float uSizeRandom;
uniform float uInkDensity;
uniform float uEyePrint;
uniform float uPxPerUnit;      // drawing-buffer px per world unit at distance 1
uniform float uFocus;
uniform float uAperture;
uniform float uRecedeBlur;
uniform float uBrightness;
uniform vec3 uPointer;         // world xy on z = 0 plane, z = strength 0..1
uniform float uRepelRadius;
uniform float uRepelForce;
uniform float uRepelDepth;

varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

#include <split_mask>

float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
vec3 h3(float n) { return vec3(h1(n), h1(n + 17.31), h1(n + 41.77)); }

// Divergence-free trig field: each component ignores its own axis, so div = 0 (swirls, no sinks).
vec3 curl(vec3 p, float t) {
  vec3 a = vec3(
    sin(p.y * 1.7 + t) + cos(p.z * 1.3 - t * 0.7),
    sin(p.z * 1.9 - t * 0.8) + cos(p.x * 1.1 + t),
    sin(p.x * 1.5 + t * 0.9) + cos(p.y * 2.1 - t));
  vec3 q = p * 2.3 + 4.1;
  vec3 b = vec3(
    sin(q.y * 1.3 - t) * cos(q.z * 0.9),
    sin(q.z * 1.1 + t) * cos(q.x * 1.7),
    sin(q.x * 0.8 - t) * cos(q.y * 1.4));
  return (a + 0.5 * b) / 3.0;
}

float inOutSine(float x) { return -(cos(3.14159265 * x) - 1.0) * 0.5; }

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main() {
  if (uPhoto == 1.0 && (uWearActive > .5 || uSplit == 1.0)) {
    // The settled relief needs no scatter, curl, camera flight or depth of field.
    vec3 settled = vec3(position.xy, position.z * (1.0 - uSplit));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(settled, 1.0);
    vec2 uv = .5 + .5 * gl_Position.xy / gl_Position.w;
    float panel = splitRight(uv);
    if (panel == 0.0 && (uWearActive == 0.0 || texture2D(tWear, uv).r == 0.0)) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 1.0;
      return;
    }
    float tone = dot(aColor, vec3(.2126, .7152, .0722));
    // Small, pale grains on the dark ground contrast with the ink on cream.
    float cream = uSplit;
    float inkSize = min(2.25, 1.50 / pow(max(tone, .04), .5 * uInkDensity)) * (.86 + .34 * aSeed);
    gl_PointSize = uPixelRatio * mix(.82 + .35 * aSeed, inkSize, cream);
    vec3 ink = mix(vec3(.075, .065, .053), vec3(.34, .30, .25), tone);
    vColor = mix(vec3(.20 + .36 * tone), ink, cream);
    float subject = smoothstep(.055, .19, position.z / max(uDepthScale, .0001));
    float trailAlpha = subject * (.18 + .48 * tone);
    vAlpha = mix(trailAlpha, subject * (1.0 - .35 * tone), cream);
    vSoft = 0.0;
    // The retained eye print yields to the live portrait as the window opens.
    vAlpha *= 1.0 - uEyePrint;
    return;
  }
  vec3 target = position;
  vec3 r = h3(aSeed * 91.7 + 3.3);
  vec3 r2 = h3(aSeed * 57.3 + 11.9);

  // Dust field: the portrait's volume loosened and scattered in depth.
  vec3 dust = vec3(
    (r.x - 0.5) * uImgAspect * (1.0 + 0.25 * uSpread),
    (r.y - 0.5) * (1.0 + 0.25 * uSpread),
    (r.z - 0.65) * 0.9 * uSpread);
  dust.xy = mix(dust.xy, target.xy, 0.35);

  // Scatter: far behind and wide, flying in toward the dust field.
  vec3 scatter = vec3(dust.xy * (2.5 + 2.0 * r2.x) * uIntroSpread, dust.z - (3.0 + 4.0 * r2.y) * uIntroSpread);

  // Intro progress, staggered left-right (or near-first) with a little per-point looseness.
  float u = target.x / uImgAspect + uCenter.x;
  float ik = mix(1.0 - target.z / max(uDepthScale, 1e-4), u, uIntroLeftRight);
  ik = clamp(ik + (r2.z - 0.5) * uLoose * 4.0, 0.0, 1.0);
  float iw = 1.0 / (1.0 + 0.6);
  float ip = clamp((uIntro - ik * 0.6 * iw) / iw, 0.0, 1.0);
  ip = 1.0 - pow(1.0 - ip, 3.0);

  // Morph progress, staggered by orderKey × stagger.
  float mw = 1.0 / (1.0 + uStagger);
  float m = clamp((uMorph - aKey * uStagger * mw) / mw, 0.0, 1.0);
  m = inOutSine(m);

  vec3 p = mix(scatter, dust, ip);
  // Swirl the dust around the vertical axis as it streams in.
  vec3 from = p;
  from.xz = rot(uSwirl * 3.14159 * (1.0 - m) * (r.x - 0.5) * 2.0) * from.xz;
  p = mix(from, target, m);

  float t = uTime * uCurlSpeed;
  float travel = sin(3.14159265 * m);
  p += curl(p * uCurlScale * 3.0, t) * uCurlAmp * 0.25 * travel;

  // Life: drifting dust, near-still portrait.
  float life = mix(uLifeMove * 6.0, uLifeRest, m);
  p += (curl(target * 5.0 + aSeed * 3.0, uTime * uLifeSpeed) ) * life * 2.0;

  // Pointer repel (fades out as the photo takes over).
  vec2 dp = p.xy - uPointer.xy;
  float dl = length(dp);
  float rep = uPointer.z * (1.0 - uPhoto) * smoothstep(uRepelRadius, 0.0, dl);
  p.xy += (dl > 1e-5 ? dp / dl : vec2(0.0)) * rep * uRepelForce;
  p.z += rep * uRepelDepth * 0.1;

  // During the dolly, scattered grains converge onto the corresponding photo pixels.
  p.xy += (r2.xy - 0.5) * (0.12 * sin(3.14159265 * uFly));
  float landing = max(uSplit, smoothstep(0.76, 1.0, uFly));
  p = mix(p, vec3(position.xy, 0.0), landing);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 1e-3);

  // Circle of confusion around the focus depth (normalised target depth), plus the recede blur.
  float dn = p.z / max(uDepthScale, 1e-4);
  float coc = uAperture * abs(dn - uFocus) * 2.0 * m + (1.0 - ip) * 2.0 + uRecede * uRecedeBlur * 3.0;
  float sizeW = uSize * 0.0042 * (1.0 + uSizeRandom * (aSeed - 0.5) * 2.0);
  float px = sizeW * uPxPerUnit / dist;
  float size = px * (1.0 + coc);
  // Keep relief samples fine-grained as the camera approaches the face.
  float maxSize = uFly > 0.0 ? 2.0 * uPixelRatio : 64.0;
  gl_PointSize = clamp(size, 1.0, maxSize);

  // Light from the photo's luminance, brightened (mono-light), warming slightly as it lands.
  vec3 lin = pow(aColor, vec3(2.2));
  float lum = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  vec3 mono = vec3(min(lum * uBrightness, 1.0) * 0.85 + 0.06);
  vColor = mix(mono, min(lin * uBrightness, vec3(1.0)), 0.3 * m) * (1.0 - uDim);

  vColor += vec3(0.18, 0.14, 0.08) * uFly * smoothstep(0.035, 0.25, lum);

  float a = mix(0.09, 1.0, m * m * m) * ip;   // dust is faint; points brighten as they land
  // Energy: blurred points spread their light over a larger disc; tiny points lose coverage.
  a *= min(1.0, px * px) / (1.0 + coc * coc);
  a *= smoothstep(0.02, 0.35, dist);   // don't flash when the camera flies through
  vAlpha = a;
  vSoft = clamp(coc, 0.0, 1.0);
  if (uRecede == 0.0 && uFly == 0.0 && uSplit == 0.0) {
    // The seated portrait reads through point density and neutral ink. A
    // screen-space cap keeps individual flecks crisp across viewport sizes.
    float tone = dot(aColor, vec3(0.2126, 0.7152, 0.0722));
    gl_PointSize = uPixelRatio * clamp(2.6 * uSize * (.8 + .4 * aSeed), 1.0, 1.7);
    vColor = vec3(min(1.0, (.065 + .68 * tone) * uBrightness));
    vAlpha = ip * mix(.065, .92, m * m);
    vSoft = 0.0;
  }
  if (uSplit > 0.0) {
    float tone = dot(aColor, vec3(0.2126, 0.7152, 0.0722));
    float subject = smoothstep(0.055, 0.19, target.z / max(uDepthScale, 1e-4));
    vec3 ink = mix(vec3(0.075, 0.065, 0.053), vec3(0.34, 0.30, 0.25), tone);
    // Luminance-weighted sampling gives shadows fewer points. Give their
    // ink a wider footprint so eyes and dark hair retain their tonal order.
    float inkSize = min(2.25, 1.50 / pow(max(tone, 0.04), 0.5*uInkDensity)) * (0.86+0.34*aSeed);
    gl_PointSize = mix(gl_PointSize, inkSize*uPixelRatio, uSplit);
    vColor = mix(vColor, ink, uSplit);
    vAlpha = mix(vAlpha, subject*(1.0-0.35*tone), uSplit);
    vSoft = mix(vSoft, 0.0, uSplit);
  }
}
