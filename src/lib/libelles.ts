/**
 * Libellés majeurs du catalogue — taxonomie thématique transversale aux deux
 * maisons (remplace les anciennes collections éditoriales scopées par édition).
 *
 * Source de vérité pour le seed de migration et le mapping des anciens slugs
 * WordPress (`?collection=…`) vers les nouveaux (`?libelle=…`).
 */

export interface LibelleDef {
  name: string;
  slug: string;
}

/** Première liste (~18) censée couvrir l'essentiel du fonds ES × LD. */
export const LIBELLES_MAJEURS: readonly LibelleDef[] = [
  { name: "Introduction", slug: "introduction" },
  { name: "Essentiels", slug: "essentiels" },
  { name: "GEME", slug: "geme" },
  { name: "Marxisme & économie politique", slug: "marxisme-economie-politique" },
  { name: "Histoire", slug: "histoire" },
  { name: "Philosophie", slug: "philosophie" },
  { name: "Travail & salariat", slug: "travail-salariat" },
  { name: "École & éducation", slug: "ecole-education" },
  { name: "Genre & sexualités", slug: "genre-sexualites" },
  { name: "Racisme & colonialisme", slug: "racisme-colonialisme" },
  { name: "État, droit & institutions", slug: "etat-droit-institutions" },
  { name: "Mouvements sociaux", slug: "mouvements-sociaux" },
  { name: "Entretiens & témoignages", slug: "entretiens-temoignages" },
  { name: "Actualité & interventions", slug: "actualite-interventions" },
  { name: "Documents & archives", slug: "documents-archives" },
  { name: "Écologie", slug: "ecologie" },
  { name: "International & géopolitique", slug: "international-geopolitique" },
  { name: "Culture & critique", slug: "culture-critique" },
] as const;

/**
 * Anciens slugs de collection WP → slug de libellé. « Hors collection » n'est
 * pas mappé (livre sans libellé). Variantes de slug tolérées pour les
 * redirects / bookmarks.
 */
export const LEGACY_COLLECTION_TO_LIBELLE: Readonly<Record<string, string>> = {
  "les-propedeutiques": "introduction",
  "les-essentielles": "essentiels",
  geme: "geme",
  histoire: "histoire",
  "les-eclairees": "philosophie",
  "les-paralleles": "documents-archives",
  "les-irregulieres": "actualite-interventions",
  "ancien-fonds": "documents-archives",
  "le-genre-du-monde": "genre-sexualites",
  "genre-monde": "genre-sexualites",
  "l-enjeu-scolaire": "ecole-education",
  "lenjeu-scolaire": "ecole-education",
  "travail-et-salariat": "travail-salariat",
  entretiens: "entretiens-temoignages",
  "les-lettres-bleues": "entretiens-temoignages",
};

/**
 * Résout un slug de filtre (nouveau libellé ou ancienne collection) vers un
 * slug de libellé. Les slugs inconnus passent tels quels (libellés créés en
 * admin hors liste initiale) ; seul « hors-collection » est écarté.
 */
export function resolveLibelleSlug(raw: string | undefined | null): string | undefined {
  if (!raw || raw === "hors-collection") return undefined;
  return LEGACY_COLLECTION_TO_LIBELLE[raw] ?? raw;
}
