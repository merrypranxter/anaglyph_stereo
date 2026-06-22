# Visual Targets

## Aesthetic Regimes

**red_cyan_classic** — `mode: anaglyph_dubois`, `separation: 0.03`, `depth_scale: 1.0`.
Should look like a page out of a 1950s 3D comic: put on red/cyan glasses and
the sphere+torus SDF scene pops convincingly off the page with minimal
double-imaging. Without glasses it looks like a soft red/cyan fringed mess —
that fringing being small is the whole point of the Dubois matrices.

**lenticular_ripple** — `mode: lenticular`, `view_count: 8`, `period: 1/120`,
`angle_drive: mouse`. Move the mouse left/right across the canvas and the
image should shimmer like a holographic postcard — vertical strips flipping
between viewpoints in a smooth ripple, not a jarring strobe. Drop `view_count`
to 4 for the cheaper, choppier "budget postcard" look.

**wiggle_gif** — `mode: wiggle`, `separation: 0.04`, `osc_speed: 6.0`. The
whole frame should gently rock left-right with no glasses needed — the
"3D-GIF" feeling from forum signatures circa 2008. It reads as 3D because of
motion, not color.

**depth_glitch** — `mode: anaglyph_dubois`, `separation: 0.15`,
`depth_scale: 2.0`, `glitch: 1.0`. Pushed far past comfortable stereo
fusion range: this should look like the image is tearing itself into
red-ghost / cyan-corpse layers that no longer agree on where any edge is.
This is an artifact aesthetic — if it still reads as a coherent stereo pair,
push `separation` and `glitch` higher.

## Output Checklist

- [x] anaglyph_dubois renders correctly (Dubois matrix composite over MRT viewL/viewR)
- [x] anaglyph_color renders correctly (naive red/cyan channel split)
- [x] lenticular renders correctly (per-pixel strip-indexed view selection)
- [x] wiggle renders correctly (time-alternating viewL/viewR resolve)
- [x] post-process finisher applies (ghost-reduction blur, chromatic correction, glitch tear)
- [x] parameters are interactive (separation, depth_scale, mode, view_count, angle_drive, all wired to the control panel)
