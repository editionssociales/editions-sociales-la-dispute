"use client";

import { useId, useState, type ReactNode } from "react";
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
 */
export function BookTabs({ tabs }: { tabs: BookTab[] }) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  if (tabs.length === 0) return null;

  return (
    <div>
      <FramedGrid as="div" flow="flex" role="tablist" aria-label="Compléments de la fiche">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={i === active}
            aria-controls={`${baseId}-panel-${tab.id}`}
            onClick={() => setActive(i)}
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
