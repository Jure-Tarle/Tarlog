# Icons

`icon.png` is a **32×32 placeholder** (solid steel-blue, the app accent) so
`cargo check`, the tray, and dev builds have a valid image. It is **not** a
final asset.

Before packaging/notarization (doc 11 §5 nr. 17), replace it with the full set
generated from a 1024×1024 master:

```sh
pnpm --filter @tarlog/desktop tauri icon path/to/icon-1024.png
```

That emits `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns` (macOS),
`icon.ico` (Windows), and Store logos, then extend `bundle.icon` in
`tauri.conf.json` accordingly.
