# anaglyph_stereo

A creative coding project exploring **stereoscopic illusions** — anaglyph encoding (red-cyan glasses), lenticular interlacing (angle-dependent view switching), and wiggle parallax (no-glasses 3D-GIF). A finisher that requires a depth map.

## What Is This?

A **finisher** that takes a source image + depth map and generates stereoscopic output. Four modes: optimized Dubois matrix anaglyph and naive color anaglyph (for glasses), lenticular strip interlacing (simulated angle tilt), and wiggle parallax (retro 3D-GIF oscillation). It's a real WebGL2 multi-pass renderer — every shader listed below actually runs.

**Adjacency note:** The `wiggle_parallax` mode overlaps with `parallax_depth_fields`. This repo owns **anaglyph + lenticular**; wiggle is a bonus mode. Pure parallax depth belongs to that repo.

## Project Structure

```
src/
  js/
    main.js           — WebGL2 setup, FBO pipeline, render loop, UI wiring
    source.js         — image / webcam / upstream-FBO source handling
    dubois.js         — optimized Dubois matrix constants
    color-maps.js     — neon palette ramps for the depth-debug view
  shaders/
    depth/            — swappable depth sources
      sdf-scene.glsl       — sphere-traced sphere + torus + plane
      raymarch-depth.glsl  — domain-repeated pillar corridor
      upload-depth.glsl    — uploaded depth map → luminance passthrough
    views.frag         — MRT pass: generate viewL/viewR via depth-shift
    anaglyph.frag       — channel-matrix composite (Dubois or naive)
    lenticular.frag     — N-view strip interlace by angle
    post-process.frag   — ghost-reduction blur, chromatic correction, glitch tear, wiggle resolve
docs/
  math-reference.md   — the equations and Dubois matrices, in full
  visual-targets.md   — what each aesthetic regime should look like
```

## Running

This loads shaders via `fetch()`, so it needs to be served over HTTP (not opened directly as a `file://` URL, which most browsers block from issuing fetch requests to local files):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

WebGL2 required.

## Pipeline

1. **depth pass** — `sdf-scene.glsl`, `raymarch-depth.glsl`, or `upload-depth.glsl` writes a normalized depth texture.
2. **views pass** — `views.frag` (MRT) shifts the source by `depth * separation` to generate `viewL` / `viewR`.
3. **compose pass** — `anaglyph.frag` (Dubois matrix or naive channel split) or `lenticular.frag` (per-pixel strip view selection) for the lenticular mode.
4. **post pass** — `post-process.frag` applies ghost-reduction blur, chromatic correction, optional glitch tearing, and resolves the wiggle mode's time-alternating view.

## Current Engines

- [x] _anaglyph_dubois — optimized matrix anaglyph, least ghosting
- [x] _anaglyph_color — naive red/cyan channel split
- [x] _lenticular_flip — N-view strip interlace, angle-driven
- [x] _wiggle_parallax — 2-view 6Hz oscillation, no glasses

## Aesthetic Regimes

- [x] red_cyan_classic — Dubois anaglyph, for glasses, minimal ghosting
- [x] lenticular_ripple — N=8 views, mouse-driven angle → holographic shimmer
- [x] wiggle_gif — 2-view 6Hz wobble, no glasses, retro 3D-GIF
- [x] depth_glitch — exaggerated separation → channel-tearing artifact aesthetic

Pick any of these from the **preset** dropdown in the control panel, or drive every parameter by hand.

## Parameters

- `separation` — eye distance in UV (0.0–0.2)
- `depth_scale` — parallax depth multiplier (0.0–2.0)
- `mode` — anaglyph_dubois | anaglyph_color | lenticular | wiggle
- `view_count` — 2–16 (for lenticular)
- `angle_drive` — mouse | time | gyro
- `depth_source` — sdf | raymarch | upload (drag in your own grayscale depth map)
- `ghost_blur`, `chromatic`, `glitch` — post-process finisher controls
- `osc_speed` — wiggle oscillation rate in Hz

There's also a **source image** uploader and a **webcam** toggle, and a depth-debug overlay (`show depth map`) that renders the raw depth texture through a neon palette ramp.

## Ecosystem Hooks

Consumes depth from `sdf_fields`, `raymarching`, `parallax_depth_fields`. Pairs with `chromatic_aberration`, `op_art_style`.

---

*The left eye and the right eye disagree, and the brain invents depth.*
