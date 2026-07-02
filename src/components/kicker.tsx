import type { ReactNode } from "react";
import type { Accent } from "@/lib/format";
import { ACCENT_TEXT } from "@/lib/accents";

/**
 * Sur-titre de section : petites capitales espacées, colorées dans un accent
 * de la palette. `light` pour les fonds sombres (ink).
 */
export function Kicker({
  accent,
  light = false,
  className = "",
  children,
}: {
  accent?: Accent;
  light?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const color = light
    ? "text-paper/90"
    : accent
      ? ACCENT_TEXT[accent]
      : "text-ink-soft";
  return (
    <p
      className={`text-sm font-semibold uppercase tracking-[0.22em] ${color} ${className}`}
    >
      {children}
    </p>
  );
}
