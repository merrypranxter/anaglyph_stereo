# Math Reference

## Core Equations

**Depth-proportional view shift** (`views.frag`, `lenticular.frag`)

```
viewL = sample(src, uv + depth * sep * 0.5)
viewR = sample(src, uv - depth * sep * 0.5)
```

`depth` is read from the depth map (0–1, nearer = larger after inversion in
the depth shaders), `sep` is `separation * depth_scale`. Positive horizontal
disparity between the eyes is what the visual cortex reads as "this point is
in front of the screen plane."

**Lenticular view selection** (`lenticular.frag`)

```
viewIndex = floor(uv.x / period + angle) mod N
offset    = (viewIndex / (N - 1)) * 2 - 1        // remap to [-1, 1]
shift     = depth * offset * separation * 0.5
```

Each vertical strip of width `period` is assigned one of `N` discrete eye
positions. As `angle` sweeps (mouse X, a time ramp, or a gyro proxy), the
`floor(...) mod N` term cycles which offset every strip reveals — the same
thing a physical lenticular lens does by refracting different sub-pixel
columns toward the viewer at different angles.

**Dubois anaglyph composite** (`anaglyph.frag`)

```
output = clamp(M_L * colorL + M_R * colorR, 0, 1)
```

where `M_L`, `M_R` are the optimized Dubois 3x3 matrices (`dubois.js`):

```
M_L =
  0.437   0.449   0.164
 -0.062  -0.062  -0.024
 -0.048  -0.050  -0.017

M_R =
 -0.011  -0.032  -0.007
  0.377   0.761   0.009
 -0.026  -0.093   1.234
```

Unlike a naive channel mask (`outputR = colorL.r`, `output.gb = luminance(colorR)`),
every output channel is a weighted blend of *both* eyes. The off-diagonal
terms are what suppress ghosting — they cancel most of the crosstalk that
red/cyan filter glasses can't fully separate optically.

**Wiggle parallax** (`post-process.frag`)

```
phase = sin(time * 2π * oscSpeed)
shown = phase > 0 ? viewL : viewR     // smoothstep-feathered at the crossing
```

A 2-view square-wave alternation at ~6 Hz. No color filtering — the brain
infers depth purely from the temporal motion parallax of the alternating
frames.

## Shader Snippets

See `src/shaders/` directly — every pass is a single small fragment shader
with no hidden indirection:

- `depth/sdf-scene.glsl` — sphere-traced sphere + torus + plane
- `depth/raymarch-depth.glsl` — domain-repeated pillar corridor
- `depth/upload-depth.glsl` — luminance reduction of an uploaded image
- `views.frag` — MRT depth-shift into viewL/viewR
- `anaglyph.frag` — Dubois matrix or naive composite
- `lenticular.frag` — strip-indexed view selection
- `post-process.frag` — ghost blur, chromatic correction, glitch tear, wiggle resolve

## References

- Dubois, E. (2001), "A projection method to generate anaglyph stereo images" — source of the optimized matrix coefficients used here.
- Standard lenticular print theory: strip period vs. lens pitch determines the angular range over which each view is visible.
- Wiggle stereoscopy / "wigglegrams": a public-domain GIF-era technique predating any of the above, relying purely on motion parallax.
