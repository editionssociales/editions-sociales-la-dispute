"use client";

import type { ReactNode } from "react";
import { useInView } from "@/hooks/use-in-view";

/**
 * Révèle son contenu (fondu + légère translation) à l'entrée dans le
 * viewport. Les enfants restent rendus côté serveur ; seul l'effet est client.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, visible] = useInView<HTMLDivElement>({
    threshold: 0.12,
    rootMargin: "0px 0px -40px",
  });

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
