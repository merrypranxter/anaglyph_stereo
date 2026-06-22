# Examples

The `examples` folder contains pure-HTML/JS anaglyph stereoscopy demos. They illustrate how to build simple stereoscopic scenes without the full WebGL pipeline from `src/js/main.js`.

- **01-hearts.html** – An animated shower of hearts rendered as red/cyan anaglyphs. Move the **separation** slider to control how far apart the left and right views are.

- **02-text.html** – Type your own text and watch it pop off the screen. The separation slider adjusts the apparent depth.

- **03-starfield.html** – A 3D starfield with random depths. Adjust the **star count**, **depth range**, and **separation** controls to explore different spatial layouts.

These examples are standalone – open them directly in your browser (no server required) and use them as inspiration for RepoScripter experiments. They demonstrate tint-and-offset parallax with Canvas 2D: a left view tinted red and a right view tinted cyan.
