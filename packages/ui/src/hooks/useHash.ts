/**
 * Simple hash-based router hook.
 *
 * Returns the current hash (without #) and a setter.
 * Listens for hashchange events.
 */
import { useState, useEffect, useCallback } from "react";

function getHash(): string {
  return window.location.hash.replace(/^#/, "");
}

export function useHash(): [string, (h: string) => void] {
  const [hash, setHashState] = useState(getHash);

  useEffect(() => {
    const onHashChange = () => setHashState(getHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const setHash = useCallback((h: string) => {
    window.location.hash = h;
  }, []);

  return [hash, setHash];
}

/**
 * Parse a route pattern like "/message/:id" against a hash path.
 * Returns params object or null if no match.
 */
export function matchRoute(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const basePath = path.split("?")[0] ?? path;
  const pathParts = basePath.split("/").filter(Boolean);

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]!;
    const pathP = pathParts[i]!;
    if (pp.startsWith(":")) {
      params[pp.slice(1)] = pathP;
    } else if (pp !== pathP) {
      return null;
    }
  }
  return params;
}

/**
 * Extract query params from a hash string.
 * e.g. "/compose?reply=msg_123" -> { reply: "msg_123" }
 */
export function hashQuery(hash: string): Record<string, string> {
  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return {};
  const search = new URLSearchParams(hash.slice(qIdx + 1));
  const result: Record<string, string> = {};
  search.forEach((v, k) => {
    result[k] = v;
  });
  return result;
}
