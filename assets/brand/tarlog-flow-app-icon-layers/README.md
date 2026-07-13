# Tarlog Flow app-icon layers

These 1024-by-1024 SVG canvases are the editable, unmasked source layers for
Apple Icon Composer or another layered-icon pipeline:

1. `background.svg` — opaque, full-bleed brand colour
2. `dial.svg` — transparent open-dial foreground
3. `hand.svg` — transparent clock-hand foreground

Import the layers in that back-to-front order. Do not add a corner radius,
drop shadow, gloss, highlight, or specular treatment to the artwork. Apple
platforms apply the final mask, depth, and material appearance at presentation
time. The flattened `../tarlog-flow-app-icon.svg` preserves the same geometry
for targets that still require a single image.
