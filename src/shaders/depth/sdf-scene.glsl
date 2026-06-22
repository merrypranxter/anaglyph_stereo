#version 300 es
precision highp float;

// anaglyph_stereo — depth/sdf-scene.glsl
// Sphere-traced primitive scene (sphere + torus + ground plane).
// Outputs normalized scene depth in .r, ready for views.frag to consume as u_depth.

in vec2 v_uv;
out vec4 outDepth;

uniform vec2 u_resolution;
uniform float u_time;

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

float sdPlane(vec3 p, float y) {
  return p.y - y;
}

float map(vec3 p) {
  float orbit = sin(u_time * 0.3);
  vec3 spherePos = p - vec3(orbit * 0.6, 0.2, 0.0);
  float sphere = sdSphere(spherePos, 0.55);

  vec3 torusPos = p - vec3(-0.5, -0.1, 0.4);
  torusPos.xy *= mat2(cos(u_time * 0.4), -sin(u_time * 0.4), sin(u_time * 0.4), cos(u_time * 0.4));
  float torus = sdTorus(torusPos, vec2(0.45, 0.16));

  float plane = sdPlane(p, -0.85);

  return min(min(sphere, torus), plane);
}

void main() {
  vec2 uv = (v_uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);

  vec3 camPos = vec3(0.0, 0.15, 3.2);
  vec3 camTarget = vec3(0.0, 0.0, 0.0);
  vec3 fwd = normalize(camTarget - camPos);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  vec3 rd = normalize(fwd * 1.6 + uv.x * right + uv.y * up);

  float t = 0.0;
  float depth01 = 1.0;
  const float MAX_DIST = 12.0;
  for (int i = 0; i < 80; i++) {
    vec3 p = camPos + rd * t;
    float d = map(p);
    if (d < 0.001) {
      depth01 = clamp(t / MAX_DIST, 0.0, 1.0);
      break;
    }
    t += d;
    if (t > MAX_DIST) {
      depth01 = 1.0;
      break;
    }
  }

  // invert so nearer surfaces -> larger depth value (more parallax pop-out)
  float depth = 1.0 - depth01;
  outDepth = vec4(depth, depth, depth, 1.0);
}
