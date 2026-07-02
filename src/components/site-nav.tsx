"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ACCENTS, ACCENT_BG, ACCENT_BORDER_B } from "@/lib/accents";

const NAV = [
  { href: "/catalogue", label: "Catalogue" },
  { href: "/editions", label: "Nos collections" },
  { href: "/rencontres", label: "Rencontres" },
  { href: "/a-propos", label: "À propos" },
];

// Classes littérales complètes : le JIT Tailwind ne compile pas `hover:${…}`.
const HOVER_UNDERLINE = [
  "hover:border-b-navy",
  "hover:border-b-bottle",
  "hover:border-b-ocher",
  "hover:border-b-brick",
];

/** Liens desktop : soulignement dans l'accent du lien, tenu quand actif. */
export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-6 md:flex">
      {NAV.map((item, i) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`border-b-2 pb-0.5 text-sm font-medium transition-colors ${
              active
                ? `text-ink ${ACCENT_BORDER_B[ACCENTS[i % 4]]}`
                : `border-transparent text-ink-soft hover:text-ink ${HOVER_UNDERLINE[i % 4]}`
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Menu mobile : bouton hamburger + panneau sous le header. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-full ring-1 ring-inset ring-line"
      >
        <span
          className={`h-0.5 w-4 bg-ink transition-transform ${open ? "translate-y-1 rotate-45" : ""}`}
        />
        <span
          className={`h-0.5 w-4 bg-ink transition-transform ${open ? "-translate-y-1 -rotate-45" : ""}`}
        />
      </button>
      {open && (
        <nav className="absolute inset-x-0 top-full border-b border-line bg-paper shadow-lg shadow-ink/5">
          <ul className="px-5 py-4">
            {NAV.map((item, i) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={close}
                  className="flex items-center gap-3 py-3 font-medium text-ink"
                >
                  <span
                    className={`h-2 w-2 rotate-45 ${ACCENT_BG[ACCENTS[i % 4]]}`}
                    aria-hidden="true"
                  />
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="mt-3 border-t border-line pt-4">
              <Link
                href="/souscription"
                onClick={close}
                className="inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper"
              >
                Souscrire
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
