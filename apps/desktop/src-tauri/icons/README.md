# Icons

The checked-in icon family is generated from the 1024x1024 Tarlog Flow master
at `../../../../assets/brand/tarlog-flow-app-icon.png`. The editable vector and
the compact brand/menu-bar sources live beside that master.

Regenerate every Tauri target from the repository root with:

```sh
pnpm --filter @tarlog/desktop tauri icon ../../assets/brand/tarlog-flow-app-icon.png
```

This emits the PNG sizes, `icon.icns` for macOS, `icon.ico` for Windows, and the
mobile/store variants. `tray-icon.png` is a 36x36 black-and-alpha template
generated separately from the monochrome source. Tauri displays it at 18 pt on
macOS, preserving a 2x Retina representation while AppKit tints it correctly in
light and dark menu bars. `tray-icon-18.png` is the matching 1x reference.
