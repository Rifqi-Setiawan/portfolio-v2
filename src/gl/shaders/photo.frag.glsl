// Photo quad: depth-led crossfade (near first), recede blur, dim, and the about split
// (photo left of the line, cream right). Outputs linear colour.
uniform sampler2D tPhoto;   // sRGB texture → sampled linear; DataTexture rows are top-down
uniform sampler2D tDepth;
uniform sampler2D tHeroPhoto;
uniform vec3 uHeroCrop;   // centre in top-down image UV, followed by the fraction seen at landing
uniform float uHeroWeight;
uniform float uPhoto;
uniform float uRecede;
uniform float uFlightShade;
uniform float uRecedeBlur;
uniform float uBlur;        // photo.blur
uniform float uDim;
uniform float uSplit;
uniform float uDepthSoft;
uniform float uDepthGrow;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uOverscan;
uniform vec3 uCream;        // linear
uniform sampler2D tEyePrint; // the retained Contacts print, in display colour
uniform vec4 uEyeCrop;       // centre, then width/height in photo UV
uniform float uEyePrint;

varying vec2 vUv;

#include <split_mask>
#include <brush_mask>

void main() {
  vec2 screenUv = gl_FragCoord.xy / uRes;
  float right = splitRight(screenUv);
  if (right == 1.0 && uEyePrint == 0.0) {
    gl_FragColor = vec4(uCream * (1.0 - uDim), 1.0);
    #include <colorspace_fragment>
    return;
  }
  // Preserve the central subject's projected size as the camera recedes.
  // Compress UVs smoothly towards the perimeter of the extended plane. With
  // a complete source crop (overscan = 1), this is the original photograph.
  vec2 centered = vec2(vUv.x, 1.0 - vUv.y) * 2.0 - 1.0;
  vec2 uv = .5 + .5 * centered * uOverscan / (1.0 + (uOverscan - 1.0) * centered * centered);
  uv = mix(uv, clamp(.5 + .5 * centered * uOverscan, 0.0, 1.0), uSplit);
  float blur = uBlur + uRecede * uRecedeBlur;
  vec3 col;
  if (blur > 0.001) {
    // A round defocus disc in screen pixels, independent of crop, aspect and DPR.
    float radius = .0135 * uRes.y * blur;
    vec2 dx = dFdx(uv) * radius;
    vec2 dy = dFdy(uv) * radius;
    // A centre and three opposing pairs retain a round disc. Mips integrate
    // each tap's footprint; only the defocused room uses this branch.
    float bias = max(blur * 2.0, log2(1.0 + .35 * radius));
    col = texture2D(tPhoto, uv, bias).rgb;
    vec2 a = .76 * dx, b = .38 * dx + .658 * dy, c = .38 * dx - .658 * dy;
    col += texture2D(tPhoto, uv + a, bias).rgb + texture2D(tPhoto, uv - a, bias).rgb;
    col += texture2D(tPhoto, uv + b, bias).rgb + texture2D(tPhoto, uv - b, bias).rgb;
    col += texture2D(tPhoto, uv + c, bias).rgb + texture2D(tPhoto, uv - c, bias).rgb;
    col /= 7.0;
  } else {
    col = texture2D(tPhoto, uv).rgb;
  }
  if (uHeroWeight > 0.0) {
    vec2 landedUv = uHeroCrop.xy + (uv - .5) * uHeroCrop.z;
    col = mix(col, texture2D(tHeroPhoto, landedUv).rgb, uHeroWeight);
  }

  // Depth-led reveal: near areas first, the far wall last (depthSoft = spread of the front).
  float a = uPhoto;
  if (uPhoto > 0.0 && uPhoto < 1.0) {
    float d = pow(texture2D(tDepth, uv).r, 1.0 / max(uDepthGrow, 1e-3));
    float soft = max(uDepthSoft, 1e-3);
    a = smoothstep(0.0, 1.0, clamp((uPhoto * (1.0 + soft) - (1.0 - d) * soft), 0.0, 1.0));
  }

  vec2 edgeDistance = abs(screenUv * 2.0 - 1.0);
  col *= 1.0 - uFlightShade * .60 * smoothstep(.52, 1.0, max(edgeDistance.x, edgeDistance.y));
  // The settled About stroke extends the ink-on-cream treatment across its photo.
  vec3 trailGround = mix(vec3(.015, .016, .017), uCream, uSplit);
  col = mix(col, trailGround, brushMask(screenUv));
  col = mix(col, uCream, right);
  if (uEyePrint > 0.0) {
    vec2 eyeUv = .5 + (uv - uEyeCrop.xy) / uEyeCrop.zw;
    if (all(greaterThanEqual(eyeUv, vec2(0.0))) && all(lessThanEqual(eyeUv, vec2(1.0)))) {
      // Start with the same ink composited onto the same paper as the DOM canvas.
      vec4 mark = texture2D(tEyePrint, eyeUv);
      vec3 paper = sRGBTransferOETF(vec4(uCream, 1.0)).rgb;
      vec3 printed = sRGBTransferEOTF(vec4(mix(paper, mark.rgb, mark.a), 1.0)).rgb;
      col = mix(col, printed, uEyePrint);
    }
  }
  a = mix(a, 1.0, right);
  col *= 1.0 - uDim;
  if (a < 0.002) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
