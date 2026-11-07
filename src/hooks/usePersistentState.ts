import { useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "wt:";
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6h

export type SessionStateOptions<T> = {
  /** Reject a stored value that doesn't look right instead of trusting it blindly. */
  validate?: (v: unknown) => v is T;
  /** Ignore a stored value older than this. Default 6h. */
  ttlMs?: number;
};

type StoredEnvelope = { v: unknown; t: number };

function isStoredEnvelope(x: unknown): x is StoredEnvelope {
  return typeof x === "object" && x !== null && "v" in x && "t" in x;
}

/** Reads `key` from sessionStorage, applying ttl + optional validation. Never throws. */
export function readStored<T>(key: string, opts?: SessionStateOptions<T>): T | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredEnvelope(parsed)) return undefined;
    const ttl = opts?.ttlMs ?? DEFAULT_TTL_MS;
    if (Date.now() - parsed.t > ttl) return undefined;
    if (opts?.validate && !opts.validate(parsed.v)) return undefined;
    return parsed.v as T;
  } catch {
    // Storage blocked (private mode), corrupt JSON, whatever — just
    // behave as if nothing were stored.
    return undefined;
  }
}

/** Writes `key` to sessionStorage with a fresh timestamp. Never throws. */
export function writeStored<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: StoredEnvelope = { v: value, t: Date.now() };
    window.sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(envelope));
  } catch {
    // Storage blocked or full — the app just runs without persistence.
  }
}

/** Removes `key` from sessionStorage. Never throws. */
export function clearSessionState(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // ignore
  }
}

/**
 * Like useState, but backed by sessionStorage so the value survives a
 * mobile browser discarding this tab in the background (the SPA then
 * remounts from scratch on return) and a same-tab reload — but not a
 * brand new tab, and never longer than `opts.ttlMs` (default 6h).
 *
 * SSR-safe: the very first render always returns `initial` (so server
 * and client markup match), and the stored value — if any, and if it
 * passes `opts.validate` — is applied in a mount effect right after.
 * That costs one extra render on a restore, which is fine.
 */
export function useSessionState<T>(
  key: string,
  initial: T,
  opts?: SessionStateOptions<T>,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  // Guards against writing `initial` straight back over a value that's
  // about to be restored from storage by the mount effect below — the
  // write effect fires on this same first commit too (same deps-changed
  // rule as any other useEffect), so without this it would stomp the
  // not-yet-applied restore before it ever happens.
  const skipNextWrite = useRef(true);

  useEffect(() => {
    const stored = readStored<T>(key, opts);
    if (stored !== undefined) setValue(stored);
    // Deliberately read only once, on mount — this hook mirrors state
    // TO storage, it doesn't react to storage changing elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    writeStored(key, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return [value, setValue];
}

/**
 * Pairs a TanStack Router search param with a sessionStorage mirror, so
 * a shareable URL selection also survives the one case the URL itself
 * can't: the browser remounting the SPA at a URL that never carried the
 * param to begin with (a fresh nav, not a backgrounded-tab reload —
 * that preserves the full URL on its own). Precedence on mount: URL
 * param -> sessionStorage -> `initial`.
 *
 * The route itself owns its typed search state and navigate() — this
 * hook has no router knowledge of its own, so the caller passes the
 * current param value and a setter that writes it back (always with
 * `replace: true`, so Back doesn't walk through every change).
 */
export function useUrlBackedState<T>(
  key: string,
  searchValue: T | undefined,
  setSearchValue: (v: T) => void,
  initial: T,
  opts?: SessionStateOptions<T>,
): T {
  const triedStorage = useRef(false);

  useEffect(() => {
    if (searchValue !== undefined) {
      // The URL is authoritative whenever it's present — keep the
      // mirror current so a later tab-discard still has it even if the
      // next nav drops the query string.
      writeStored(key, searchValue);
      return;
    }
    if (triedStorage.current) return;
    triedStorage.current = true;
    const stored = readStored<T>(key, opts);
    if (stored !== undefined) setSearchValue(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  return searchValue ?? initial;
}
