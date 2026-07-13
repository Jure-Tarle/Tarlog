import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  nativeSystemSymbols,
  type NativeSystemSymbolKey,
  type NativeSystemSymbolSet,
} from "../lib/bridge";

const EMPTY_SYMBOL_SET: NativeSystemSymbolSet = {
  supported: false,
  symbols: {},
  missing: [],
};

let symbolRequest: Promise<NativeSystemSymbolSet> | undefined;
let resolvedSymbols: NativeSystemSymbolSet | undefined;

/** Load once per process; browser previews and non-Tauri tests stay native-free. */
export function loadAppleSystemSymbols(): Promise<NativeSystemSymbolSet> {
  if (!isTauri()) return Promise.resolve(EMPTY_SYMBOL_SET);
  if (!symbolRequest) {
    symbolRequest = nativeSystemSymbols()
      .then((symbols) => {
        resolvedSymbols = symbols;
        return symbols;
      })
      .catch(() => EMPTY_SYMBOL_SET);
  }
  return symbolRequest;
}

export interface AppleSystemSymbolProps {
  name: NativeSystemSymbolKey;
  /** Rendered while loading and on Windows, Linux, web, or missing SF Symbols. */
  fallback?: ReactNode;
  className?: string;
  size?: number | string;
  style?: CSSProperties;
}

/**
 * A decorative SF Symbol mask. Keep the accessible name on the owning control;
 * this span is intentionally hidden from assistive technology.
 */
export function AppleSystemSymbol({
  name,
  fallback = null,
  className,
  size = "1em",
  style,
}: AppleSystemSymbolProps) {
  const [dataUrl, setDataUrl] = useState<string | undefined>(
    () => resolvedSymbols?.symbols[name],
  );

  useEffect(() => {
    let active = true;
    setDataUrl(resolvedSymbols?.symbols[name]);
    void loadAppleSystemSymbols().then((set) => {
      if (active) setDataUrl(set.symbols[name]);
    });
    return () => {
      active = false;
    };
  }, [name]);

  if (!dataUrl) return <>{fallback}</>;

  return (
    <span
      aria-hidden="true"
      className={className}
      data-apple-system-symbol={name}
      style={{
        display: "inline-block",
        flex: "0 0 auto",
        width: size,
        height: size,
        backgroundColor: "currentColor",
        WebkitMaskImage: `url("${dataUrl}")`,
        maskImage: `url("${dataUrl}")`,
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        ...style,
      }}
    />
  );
}
