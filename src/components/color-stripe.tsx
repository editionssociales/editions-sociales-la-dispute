import { ACCENTS, ACCENT_BG } from "@/lib/accents";

/** Bandeau plat aux quatre couleurs de la palette, à poids égal. */
export function ColorStripe({ className = "h-1.5" }: { className?: string }) {
  return (
    <div className={`grid grid-cols-4 ${className}`} aria-hidden="true">
      {ACCENTS.map((a) => (
        <div key={a} className={ACCENT_BG[a]} />
      ))}
    </div>
  );
}
