// Référence COMMITTÉE aux déclarations de modules image de Next (*.jpg,
// *.png…), dont dépendent les imports statiques de /souscription.
// `next-env.d.ts` porte déjà cette référence mais est gitignoré et généré
// par `next build`/`next dev` : la CI (tsc sans build) ne l'a pas — sans ce
// fichier, tout import d'image échoue en TS2307 hors build.
/// <reference types="next/image-types/global" />
