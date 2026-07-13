# Tarlog Flow brand assets

The Tarlog Flow identity uses one reduced symbol: an open time dial whose hand
points into the opening. The dial communicates elapsed time; the opening and
forward-facing hand communicate uninterrupted flow. It remains recognisable at
16 px and does not reproduce an Apple or SF Symbols trademark.

## Sources

- `tarlog-flow-app-icon.svg` is the 1024-unit flattened desktop master.
- `tarlog-flow-mark.svg` is the compact brand and web source.
- `tarlog-flow-tray-template.svg` is the monochrome macOS menu-bar source.
- `tarlog-flow-touch-icon.svg` is the unmasked, opaque web touch-icon source.
- `tarlog-flow-app-icon.png` is the generated 1024x1024 raster input for Tauri.

The desktop tray uses `apps/desktop/src-tauri/icons/tray-icon.png`, a 36x36
black-and-alpha PNG that AppKit presents at 18 pt and automatically tints for
the current menu-bar appearance. `tray-icon-18.png` is the corresponding 1x
reference image.

The web app uses the compact geometry in `apps/web/app/icon.svg`, the generated
multi-size `apps/web/app/favicon.ico`, and the 180x180
`apps/web/app/apple-icon.png` touch icon.

The Tauri icon set in `apps/desktop/src-tauri/icons/` is generated from the PNG
master. Rebuild it from the repository root with:

```sh
pnpm --filter @tarlog/desktop tauri icon ../../assets/brand/tarlog-flow-app-icon.png
```

The SVG master intentionally includes the rounded desktop tile because Tauri's
current flattened ICNS/ICO pipeline cannot package Apple Icon Composer layers.
For a future native Icon Composer bundle, import the background and foreground
geometry as separate square, unmasked layers and let macOS apply the final mask
and Liquid Glass appearance.
