import { EDITIONS } from "@/lib/editions";
import type { EditionSlug } from "@/lib/types";

const STYLES: Record<EditionSlug, string> = {
  "editions-sociales": "bg-es/10 text-es-dark ring-es/20",
  "la-dispute": "bg-ld/10 text-ld-dark ring-ld/20",
};

export function EditionBadge({
  edition,
  className = "",
}: {
  edition: EditionSlug;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[edition]} ${className}`}
    >
      {EDITIONS[edition].shortName}
    </span>
  );
}
