// anaglyph_stereo — dubois.js
// Optimized Dubois anaglyph matrices (red/cyan). These minimize crosstalk
// ghosting vs a naive channel mask by mixing weighted contributions from
// both eyes into every output channel rather than hard-assigning one eye
// per channel. See docs/math-reference.md for derivation notes.

// column-major, ready to drop straight into a GLSL mat3 uniform
export const DUBOIS_LEFT = new Float32Array([
  0.437, -0.062, -0.048,
  0.449, -0.062, -0.050,
  0.164, -0.024, -0.017,
]);

export const DUBOIS_RIGHT = new Float32Array([
  -0.011, 0.377, -0.026,
  -0.032, 0.761, -0.093,
  -0.007, 0.009, 1.234,
]);

export function getDuboisMatrices() {
  return { matL: DUBOIS_LEFT, matR: DUBOIS_RIGHT };
}
