# Icons

The checked-in icon family is generated from the unmasked, full-bleed 1024x1024
Tarlog Flow fallback master at
`../../../../assets/brand/tarlog-flow-app-icon.png`. Its editable background,
dial, and hand layers live in
`../../../../assets/brand/tarlog-flow-app-icon-layers/`; the compact brand and
menu-bar sources live beside them.

Regenerate every Tauri target from the repository root with:

```sh
pnpm --filter @tarlog/desktop tauri icon ../../assets/brand/tarlog-flow-app-icon.png
```

This emits the PNG sizes, `icon.icns` for macOS, `icon.ico` for Windows, and the
mobile/store variants. The flattened Tauri pipeline cannot embed Apple Icon
Composer layers, so no mask, system shadow, or Liquid Glass effect is baked into
the source artwork. `tray-icon.png` is a 36x36 black-and-alpha template generated
separately from the monochrome source. Tauri displays it at 18 pt on macOS,
preserving a 2x Retina representation while AppKit tints it correctly in light
and dark menu bars. `tray-icon-18.png` is the matching 1x reference.
