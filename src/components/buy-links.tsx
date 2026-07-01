import type { BuyLinks } from "@/lib/types";

const OUTLETS: {
  key: keyof BuyLinks;
  label: string;
  primary?: boolean;
}[] = [
  { key: "boutique", label: "Notre boutique", primary: true },
  { key: "parislibrairies", label: "ParisLibrairies" },
  { key: "lalibrairie", label: "LaLibrairie" },
];

export function BuyLinksList({ buy }: { buy: BuyLinks }) {
  const available = OUTLETS.filter((o) => buy[o.key]);
  if (available.length === 0) {
    return (
      <p className="text-sm text-muted">
        Ce titre n&apos;est pas encore disponible à la vente en ligne.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {available.map((o) => (
        <a
          key={o.key}
          href={buy[o.key] as string}
          target="_blank"
          rel="noreferrer"
          className={
            o.primary
              ? "inline-flex items-center rounded-full bg-es px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-es-dark"
              : "inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors hover:border-es hover:text-es"
          }
        >
          {o.label}
        </a>
      ))}
    </div>
  );
}
