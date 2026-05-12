import { useEffect, useState } from "react";

/**
 * Viewer-role mode (MVP scope assessment #2).
 *
 * Activated by appending `?role=viewer` to any project URL. When active,
 * the builder shell hides mutation entry points (save, publish, add
 * behavior, delete) and renders a top-level banner so the author cannot
 * mistake the surface for editable.
 *
 * This is a UI-only gate — the API still accepts mutations from a viewer
 * if a request bypasses the UI. Persistence-side authorization is host
 * responsibility (the runtime contract names auth as out of scope).
 *
 * The hook re-evaluates on `popstate` so back/forward navigation between
 * `?role=viewer` and a normal URL toggles the mode without a reload. URL
 * mutations through `history.pushState` aren't observed by `popstate`, so
 * any in-app navigation must round-trip through a real navigation if it
 * wants to switch the role.
 */
const VIEWER_PARAM = "role";
const VIEWER_VALUE = "viewer";

function readFromLocation(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get(VIEWER_PARAM) === VIEWER_VALUE;
  } catch {
    return false;
  }
}

export function useIsViewerMode(): boolean {
  const [active, setActive] = useState<boolean>(() => readFromLocation());
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setActive(readFromLocation());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  return active;
}

export function viewerModeQueryString(): string {
  return `?${VIEWER_PARAM}=${VIEWER_VALUE}`;
}
