import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

/**
 * Piège d'ordre de feuille Tailwind v4, même mécanisme que l'exception
 * `Container.width` (`src/components/CLAUDE.md`, § Decisions) mais sur la
 * famille `display` : `Button` porte `inline-flex` en DUR dans sa recette
 * BASE, et Tailwind écrit `.inline-flex` APRÈS `.hidden` dans la feuille
 * générée. Un `hidden` passé en `className` à un `<Button>` ne masque donc
 * RIEN — à égalité de spécificité, c'est le dernier écrit qui gagne, quel que
 * soit l'ordre des classes dans l'attribut. Le bug a été livré une fois : le
 * CTA final de /souscription était rendu deux fois sous 1024px.
 *
 * Ce fichier verrouille les deux moitiés du problème : l'ordre réel de la
 * feuille (si Tailwind change un jour, la contournement devient inutile et ce
 * test le dira) et l'absence de tout appelant qui retomberait dans le piège.
 */

// `process.cwd()` et non `import.meta.url` : sous l'environnement jsdom,
// `import.meta.url` est une URL http:// (pas file://) et n'est pas résoluble.
const ROOT = process.cwd();

/** Utilitaires de la famille `display` — ceux qui entrent en conflit avec BASE. */
const DISPLAY_UTILITIES = [
  "hidden",
  "block",
  "inline",
  "inline-block",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "contents",
  "flow-root",
  "table",
  "list-item",
];

async function compiledSheet(candidates: string[]): Promise<string> {
  const entry = path.join(ROOT, "src/app/(site)/globals.css");
  const compiler = await compile(readFileSync(entry, "utf8"), {
    base: ROOT,
    loadStylesheet: async (id: string, base: string) => {
      const target =
        id === "tailwindcss"
          ? path.join(ROOT, "node_modules/tailwindcss/index.css")
          : path.resolve(base, id);
      return {
        path: target,
        base: path.dirname(target),
        content: readFileSync(target, "utf8"),
      };
    },
  });
  return compiler.build(candidates);
}

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      tsxFiles(full, out);
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extrait le texte de chaque balise ouvrante `<Button …>` d'une source JSX.
 * Avance caractère par caractère en suivant guillemets et accolades, pour
 * s'arrêter sur le `>` de la balise et non sur un `>` d'expression.
 */
function buttonOpeningTags(source: string): string[] {
  const tags: string[] = [];
  const re = /<Button[\s/>]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    let depth = 0;
    let quote: string | null = null;
    for (let i = match.index; i < source.length; i++) {
      const c = source[i]!;
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) {
        tags.push(source.slice(match.index, i + 1));
        break;
      }
    }
  }
  return tags;
}

describe("Button — famille display et ordre de feuille", () => {
  it("écrit bien .inline-flex APRÈS .hidden : un `hidden` en className ne masquerait pas", async () => {
    const sheet = await compiledSheet([
      "hidden",
      "inline-flex",
      "block",
      "lg:hidden",
      "lg:block",
    ]);
    const hidden = sheet.indexOf(".hidden");
    const inlineFlex = sheet.indexOf(".inline-flex");

    expect(hidden).toBeGreaterThan(-1);
    expect(inlineFlex).toBeGreaterThan(-1);
    // Si cette assertion tombe un jour, c'est que Tailwind a changé l'ordre :
    // le contournement par `<span>` enveloppant n'est alors plus nécessaire.
    expect(inlineFlex).toBeGreaterThan(hidden);

    // Le sens inverse tient, lui : `.hidden` est écrit après `.block`, et la
    // variante `lg:block` (@media) après les deux — d'où la forme retenue,
    // `<span className="hidden lg:block">`.
    expect(hidden).toBeGreaterThan(sheet.indexOf(".block"));
    expect(sheet.indexOf(".lg\\:block")).toBeGreaterThan(hidden);
  });

  it("rend toujours `inline-flex` dans son attribut class", () => {
    const markup = renderToStaticMarkup(<Button href="#paliers">Contribuer</Button>);
    expect(markup).toContain("inline-flex");
  });

  it("aucun appelant ne passe d'utilitaire `display` en className", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(path.join(ROOT, "src"))) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("<Button")) continue;
      for (const tag of buttonOpeningTags(source)) {
        const classNames = [...tag.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
          .map((m) => m[1] ?? m[2] ?? "")
          .join(" ");
        for (const token of classNames.split(/\s+/).filter(Boolean)) {
          // Le préfixe de variante (`lg:`, `max-[429px]:`, `print:`…) est
          // retiré : une variante `@media` gagne sur BASE, mais un utilitaire
          // NU perd — et c'est celui-là que l'on interdit.
          if (token.includes(":")) continue;
          if (DISPLAY_UTILITIES.includes(token)) {
            offenders.push(`${path.relative(ROOT, file)} — « ${token} »`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
