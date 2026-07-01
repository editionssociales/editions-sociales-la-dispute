import { accentFor } from "@/lib/format";
import type { Term } from "@/lib/types";

const RING: Record<string, string> = {
  navy: "bg-navy/10 text-navy ring-navy/25",
  bottle: "bg-bottle/10 text-bottle ring-bottle/25",
  ocher: "bg-ocher/10 text-ocher ring-ocher/25",
  brick: "bg-brick/10 text-brick ring-brick/25",
};

/** Étiquette de collection : une couleur parmi la palette, à poids égal. */
export function CollectionTag({
  collection,
  className = "",
}: {
  collection: Term;
  className?: string;
}) {
  const accent = accentFor(collection.slug);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${RING[accent]} ${className}`}
    >
      {collection.name}
    </span>
  );
}
