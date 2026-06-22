#version 300 es
precision highp float;

// anaglyph_stereo — depth/raymarch-depth.glsl
// Domain-repeated raymarch (infinite column field) — a distinct depth
// character from sdf-scene.glsl: deep recursive corridors instead of
// a single composed primitive group. Good for lenticular_ripple, where
// repeating structure reads clearly as strips flip with angle.

in vec2 v_uv;
out vec4 outDepth;

uniform vec2 u_resolution;
uniform float u_time;

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

vec3 repeat(vec3 p, vec3 c) {
  return mod(p + 0.5 * c, c) - 0.5 * c;
}

float map(vec3 p) {
  vec3 q = p;
  q.z += u_time * 0.5; // drift forward through the corridor
  vec3 rp = repeat(q, vec3(1.6, 0.0, 1.6));
  rp.y = p.y;
  float pillars = sdBox(rp, vec3(0.18, 0.9, 0.18));
  float floorPlane = p.y + 0.9;
  return min(pillars, floorPlane);
}

void main() {
  vec2 uv = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

  vec3 camPos = vec3(0.0, 0.1, 0.0);
  vec3 rd = normalize(vec3(uv.x, uv.y, 1.4));

  float t = 0.0;
  float depth01 = 1.0;
  const float MAX_DIST = 10.0;
  for (int i = 0; i < 96; i++) {
    vec3 p = camPos + rd * t;
    float d = map(p);
    if (d < 0.0015) {
      depth01 = clamp(t / MAX_DIST, 0.0, 1.0);
      break;
    }
    t += d * 0.9;
    if (t > MAX_DIST) {
      depth01 = 1.0;
      break;
    }
  }

  float depth = 1.0 - depth01;
  outDepth = vec4(depth, depth, depth, 1.0);
}
