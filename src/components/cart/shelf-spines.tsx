import { ACCENTS, ACCENT_BG } from "@/lib/accents";

const SPINES: { h: number; w: string }[] = [
  { h: 44, w: "w-3" },
  { h: 62, w: "w-4" },
  { h: 38, w: "w-2.5" },
  { h: 70, w: "w-3.5" },
  { h: 50, w: "w-4" },
  { h: 76, w: "w-3" },
  { h: 56, w: "w-3.5" },
];

/**
 * Étagère décorative (dos de livres colorés) — motif de l'état vide de
 * `/panier` (`panier/cart-view.tsx`), réduction du héros de `/souscription`.
 */
export function ShelfSpines() {
  return (
    <div className="w-fit" aria-hidden="true">
      <div className="flex items-end justify-center gap-1">
        {SPINES.map((s, i) => (
          <div
            key={i}
            className={`${s.w} ${ACCENT_BG[ACCENTS[i % 4]]} animate-[spine-rise_0.7s_ease-out_both]`}
            style={{ height: s.h, animationDelay: `${i * 70}ms` }}
          />
        ))}
      </div>
      <div className="-mx-3 h-1.5 bg-black" />
    </div>
  );
}
