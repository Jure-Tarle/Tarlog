/**
 * useStore.ts — run a `src/data` store call and expose {data, loading, error}.
 *
 * The store contract (src/data/index.ts) is a set of stubs that throw
 * "not implemented" until the data author fills them. Screens must still render
 * and stay usable, so this hook catches BOTH synchronous throws and rejected
 * promises and classifies "not implemented" separately from real errors — the
 * UI then shows a neutral placeholder instead of an alarm while the scaffold is
 * unfinished (AC28: architecture prepared, app runs offline).
 */
import { useCallback, useEffect, useState } from "react";

const NOT_IMPLEMENTED = "not implemented";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  /** True when the underlying store function is still a stub. */
  pending: boolean;
  /** A real (non-stub) error message, else null. */
  error: string | null;
  reload: () => void;
}

/**
 * Invoke `producer` on mount (and on `reload`). `deps` re-runs it, mirroring
 * useEffect deps. `producer` may throw synchronously (stub) or reject.
 */
export function useStore<T>(producer: () => Promise<T>, deps: readonly unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPending(false);
    // Wrap in Promise.resolve().then so a synchronous throw becomes a rejection.
    Promise.resolve()
      .then(producer)
      .then((value) => {
        if (cancelled) return;
        setData(value);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === NOT_IMPLEMENTED) {
          setPending(true);
        } else {
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  return { data, loading, pending, error, reload };
}

/** Fire a one-shot store mutation, tolerating the stub throw. Returns ok/err. */
export async function runStore<T>(
  producer: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; pending: boolean; error: string }> {
  try {
    const data = await Promise.resolve().then(producer);
    return { ok: true, data };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, pending: msg === NOT_IMPLEMENTED, error: msg };
  }
}
