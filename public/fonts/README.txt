Police Effra — fichiers à déposer ici
======================================

Le design system (src/app/globals.css) déclare déjà les @font-face pour
« Effra ». Tant que les fichiers ci-dessous sont absents, --font-sans replie
automatiquement sur Inter (var(--font-inter)) : rien ne casse.

Déposer dans ce dossier (public/fonts/) exactement ces 4 fichiers, avec ces
noms exacts (sensibles à la casse) :

  - Effra-Regular.woff2      (font-weight: 400, font-style: normal)
  - Effra-Italic.woff2       (font-weight: 400, font-style: italic)
  - Effra-Bold.woff2         (font-weight: 700, font-style: normal)
  - Effra-BoldItalic.woff2   (font-weight: 700, font-style: italic)

Dès que ces 4 fichiers sont présents, le site bascule automatiquement sur
Effra partout où font-sans est utilisé (aucune modification de code requise).

Format attendu : woff2 (le plus compact, supporté par tous les navigateurs
modernes ciblés par le site). Si seuls des .ttf/.otf sont disponibles,
les convertir en .woff2 avant de les déposer ici.
