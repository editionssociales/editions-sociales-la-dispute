"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FramedGrid } from "./framed-grid";
import { FOCUS_RING_DARK, FOCUS_RING_LIGHT, invertingCell } from "@/lib/ui";

export interface BookTab {
  id: string;
  label: string;
  panel: ReactNode;
}

/**
 * Onglets de la fiche livre (maquette client « essai page de livre »,
 * 2026-07-23) : « La presse en parle » / « Table des matières » — l'onglet
 * actif est la cellule inversée noir/blanc de la maquette. Les panneaux sont
 * rendus côté serveur et passés en props ; tous restent dans le DOM (celui
 * inactif est `hidden` — crawlable, pas de refetch), seul l'état d'onglet
 * vit dans ce sliver client.
 *
 * Modèle clavier de l'ARIA Authoring Practices (#86) : un SEUL onglet est
 * dans l'ordre de tabulation (`tabIndex 0` sur l'actif, `-1` sur les autres —
 * tab séquentiel entre dans le groupe, jamais entre les onglets) ; les
 * flèches ← → (et Home/End) déplacent le focus ET activent l'onglet visé
 * (sélection automatique, adaptée à un petit nombre d'onglets locaux — pas de
 * chargement réseau à éviter).
 */
export function BookTabs({ tabs }: { tabs: BookTab[] }) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (i: number) => {
    setActive(i);
    tabRefs.current[i]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusTab((active + 1) % tabs.length);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusTab((active - 1 + tabs.length) % tabs.length);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(tabs.length - 1);
        break;
      default:
        break;
    }
  };

  if (tabs.length === 0) return null;

  return (
    <div>
      <FramedGrid as="div" flow="flex" role="tablist" aria-label="Compléments de la fiche">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={i === active}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={onKeyDown}
            className={`min-h-11 flex-1 whitespace-nowrap px-5 py-2.5 text-center font-sans text-[13px] font-extrabold uppercase tracking-[.04em] transition-colors motion-reduce:transition-none ${i === active ? FOCUS_RING_DARK : FOCUS_RING_LIGHT} ${invertingCell(i === active)}`}
          >
            {tab.label}
          </button>
        ))}
      </FramedGrid>
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={i !== active}
          className="mt-5"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
