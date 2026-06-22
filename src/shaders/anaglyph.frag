#version 300 es
precision highp float;

// anaglyph_stereo — anaglyph.frag
// Channel-matrix composite. Dubois mode multiplies each eye's RGB by an
// optimized 3x3 matrix (see docs/math-reference.md) before summing —
// this is what keeps ghosting down vs a naive red/cyan channel mask.

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_viewL;
uniform sampler2D u_viewR;
uniform int u_mode; // 0 = dubois, 1 = naive color
uniform mat3 u_matL;
uniform mat3 u_matR;

void main() {
  vec3 cL = texture(u_viewL, v_uv).rgb;
  vec3 cR = texture(u_viewR, v_uv).rgb;

  vec3 result;
  if (u_mode == 0) {
    // optimized Dubois matrix anaglyph
    result = clamp(u_matL * cL + u_matR * cR, 0.0, 1.0);
  } else {
    // naive red/cyan channel split
    float lum = dot(cR, vec3(0.299, 0.587, 0.114));
    result = vec3(cL.r, lum, lum);
  }

  outColor = vec4(result, 1.0);
}
