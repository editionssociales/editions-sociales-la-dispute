"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Champs où un changement de route ne doit PAS voler le curseur — en
 * particulier la recherche du catalogue (`catalogue-filters.tsx`), dont le
 * debounce pousse l'URL sans changer de pathname, mais aussi tout
 * `router.push` futur depuis un input.
 */
const FOCUS_GUARD = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/**
 * Vrai s'il est légitime de poser le focus sur `#contenu` après une
 * navigation client. Faux tant qu'un champ a déjà le focus.
 */
export function shouldMoveRouteFocus(
  active: Element | null,
  body: Element | null,
): boolean {
  if (active == null || active === body) return true;
  return !active.closest(FOCUS_GUARD);
}

/**
 * Après un changement de `pathname` (App Router, navigation client), déplace
 * le focus vers `<main id="contenu">` (`tabIndex={-1}` dans le layout) —
 * WCAG 2.4.3 / 2.4.1 en SPA (issue #115). Ignore le premier montage (chargement
 * complet : le skip link et l'ordre naturel suffisent) et les seuls
 * changements de query (filtres catalogue).
 */
export function RouteFocus() {
  const pathname = usePathname() ?? "/";
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    if (from === null || from === pathname) return;
    if (!shouldMoveRouteFocus(document.activeElement, document.body)) return;
    document.getElementById("contenu")?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
