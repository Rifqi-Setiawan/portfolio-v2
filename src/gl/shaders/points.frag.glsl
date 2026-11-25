// Soft round point. Outputs linear colour (the post pass / renderer converts to sRGB).
uniform float uPhoto;
uniform float uSplit;
uniform float uMobilePointFadeEnd;
uniform float uTime;
uniform vec2 uRes;      // drawing-buffer size, px

varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

#include <split_mask>
#include <brush_mask>

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c) * 4.0;
  if (d2 > 1.0) discard;
  float edge = mix(0.35, 1.0, vSoft);
  float a = vAlpha * (1.0 - smoothstep(1.0 - edge, 1.0, d2));
  vec2 uv = gl_FragCoord.xy / uRes;
  float right = splitRight(uv);
  a *= mix(max(1.0 - uPhoto, brushMask(uv)), 1.0, right);
  if (uNarrow > 0.5) {
    a *= 1.0 - right * smoothstep(uMobilePanelStart, uMobilePointFadeEnd, 1.0 - uv.y);
  }
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}
