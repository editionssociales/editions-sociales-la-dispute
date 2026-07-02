"use client";

import Image from "next/image";
import { useRef } from "react";

/**
 * Face « couverture » d'un livre de l'étagère 3D.
 *
 * La géométrie CSS (`.book3d-cover`) déduit la largeur de la hauteur via
 * `aspect-ratio: var(--car)` : l'objet adopte donc le FORMAT EXACT de la
 * couverture, sans jamais la recadrer.
 *
 * `--car` est initialisé au ratio issu de la base (rendu serveur, réservation
 * de l'espace), puis corrigé au ratio RÉEL de l'image dès qu'elle est chargée —
 * indispensable tant que la base renvoie des dimensions par défaut (2/3) au lieu
 * des vraies. Mise à jour impérative (ref) : aucun re-rendu, aucun décalage
 * d'hydratation.
 */
export function ShelfCover({ url, ratio }: { url: string; ratio: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="book3d-cover"
      style={{ "--car": ratio } as React.CSSProperties}
    >
      <Image
        src={url}
        alt=""
        fill
        sizes="320px"
        className="object-cover"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > 0 && img.naturalHeight > 0 && ref.current) {
            ref.current.style.setProperty(
              "--car",
              `${img.naturalWidth} / ${img.naturalHeight}`,
            );
          }
        }}
      />
    </div>
  );
}
