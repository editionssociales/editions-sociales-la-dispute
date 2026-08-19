#!/usr/bin/env node
/**
 * Ré-encodage des 9 visuels de contreparties de `/souscription` — de la
 * livraison brute de Clara (JPEG 5333 px de large, ~7 Mo pièce, ~66 Mo le
 * lot) vers les assets versionnés de
 * `src/app/(site)/souscription/_contreparties/`, importés STATIQUEMENT par
 * `_components/tiers-rail.tsx` (donc au poids du dépôt : ~10 à 250 Ko pièce).
 *
 * Ce script EST la recette : jusqu'ici elle n'existait que dans la tête de
 * celui qui avait lancé sharp à la main en juillet. Rejoué sur la livraison
 * de juillet, il reproduit 8 des 9 assets versionnés **à l'octet près** — le
 * neuvième, « camarade pour la vie », diffère justement parce qu'il corrige
 * le liseré noir de bord parti en prod (cf. point 1 ci-dessous).
 *
 * Usage :
 *   node scripts/contreparties-visuels.mjs --src <dossier>            # rapport seul
 *   node scripts/contreparties-visuels.mjs --src <dossier> --apply    # écrit les assets
 *   node scripts/contreparties-visuels.mjs --src <dossier> --apply --out <dir>
 *
 * Le dossier `--src` est le zip client dézippé — attention à l'encodage
 * hérité des noms accentués dans l'archive : `ditto -x -k archive.zip <dst>`
 * (macOS) ou `unzip -O cp437` produisent les vrais noms, `unzip` nu produit
 * « camarade fid+?le.jpg ». Les noms sont comparés en NFC, HFS/APFS rendant
 * les accents en NFD.
 *
 * Recette, en trois temps :
 *
 * 1. **Déliseré** (`stripDarkFrame`) — certains exports de Clara portent une
 *    bande de bord ENTIÈREMENT noire, artefact de l'outil de montage : 6 px
 *    en haut de « camarade pour la vie » en juillet (partie en prod, visible
 *    en liseré gris sur la carte), 8 px à gauche de « camarade d'honneur » en
 *    août. Un `trim` ne les enlève pas — il s'arrête dessus. On rogne donc
 *    d'abord les lignes de bord uniformément sombres, avant tout le reste.
 * 2. **Détourage** (`trim`) — appliqué aux SEULS visuels compacts. Les deux
 *    premiers paliers s'affichent en vignette (~35 % de la largeur de la
 *    carte, à droite du montant, cf. `COMPACT_TIERS`) : sans rognage des
 *    marges blanches du montage, l'objet y serait minuscule. Les 7 autres
 *    s'affichent en bandeau pleine largeur et GARDENT leurs marges — elles
 *    font respirer le montage dans le cadre de la carte, et `mix-blend-
 *    multiply` les fond dans le `bg-paper` du site. L'ombre portée fait
 *    partie du cadrage dans les deux cas (seuil de trim volontairement bas).
 * 3. **Redimension + ré-encodage** — 800 px de large en compact, 1600 px en
 *    bandeau (le rail fait 380 px CSS : 1600 px couvre le 2× rétine avec de
 *    la marge, `next/image` se charge des tailles intermédiaires), JPEG
 *    qualité 80 mozjpeg.
 *
 * CONTRAINTE DURE : le fond des visuels doit rester du BLANC PUR (255/255/255).
 * `tiers-rail.tsx` les rend en `mix-blend-multiply` pour fondre le fond du
 * montage dans le `bg-paper` (blanc cassé) du site ; un fond même légèrement
 * gris ou crème dessinerait un rectangle sale sur la carte. Le script vérifie
 * les quatre coins de chaque sortie et refuse d'écrire si l'un d'eux dérive.
 *
 * `sharp` est ÉPINGLÉ en 0.34.5 dans ce dépôt (0.35 + Next 16.2 = /admin en
 * 500 en prod, libvips non tracé par Turbopack) : ne pas le mettre à jour
 * pour faire tourner ce script.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEST_PAR_DEFAUT = path.join(
  __dirname,
  "..",
  "src",
  "app",
  "(site)",
  "souscription",
  "_contreparties",
);

/** Largeur de sortie par variante d'affichage (cf. en-tête, point 3). */
const WIDTH = { compact: 800, bandeau: 1600 };

/** Réglages d'encodage JPEG — identiques aux 9 assets déjà versionnés. */
const JPEG = { quality: 80, mozjpeg: true };

/**
 * Seuil de détourage des marges blanches (variante compacte). 12 est la
 * valeur qui reproduit `coup-de-pouce.jpg`/`coup-de-main.jpg` du dépôt à
 * l'octet près : assez haut pour manger le blanc bruité du montage, assez bas
 * pour garder l'ombre portée.
 */
const TRIM_THRESHOLD = 12;

/**
 * Une ligne de bord dont AUCUN canal ne dépasse ce niveau est un artefact de
 * bord, jamais du contenu (le montage vit sur fond blanc, ses noirs les plus
 * profonds — tote bag, typographie — ne touchent pas les bords sur toute une
 * ligne).
 */
const DARK_LEVEL = 48;

/**
 * Une bande noire laisse derrière elle une « barbe » : quelques lignes grises
 * de sonnerie JPEG, uniformes elles aussi (aucun pixel ne remonte au blanc).
 * On les rogne à la suite de la bande — sans elles, le coin du visuel reste
 * gris et le fond n'est plus blanc pur. Une ligne de contenu, elle, garde
 * toujours du fond blanc quelque part : son niveau le plus clair est 255.
 */
const FADE_LEVEL = 250;
const MAX_FADE = 8;

/** Garde-fou : on ne rogne jamais plus que ça par bord (~1 % de 5333 px). */
const MAX_FRAME = 64;

/**
 * Tolérance du garde-fou « fond blanc pur » : le ré-encodage JPEG fait
 * dériver un pixel de coin de un ou deux niveaux (chroma 4:2:0), ce qui est
 * invisible sous `mix-blend-multiply`. En dessous, c'est un vrai fond sale.
 */
const BLANC_MIN = 250;

/**
 * Appariement livraison → asset. La clé est le nom de fichier livré par
 * Clara (sans extension, accents compris) ; `nom` est l'asset versionné,
 * importé statiquement par `tiers-rail.tsx` — il ne change JAMAIS sans
 * toucher aussi les imports. `variante` suit `COMPACT_TIERS` du rail.
 */
const VISUELS = [
  { source: "coup de pouce", nom: "coup-de-pouce", variante: "compact" },
  { source: "coup de main", nom: "coup-de-main", variante: "compact" },
  { source: "camarade de lecture", nom: "camarade-de-lecture", variante: "bandeau" },
  { source: "camarade fidèle", nom: "camarade-fidele", variante: "bandeau" },
  { source: "camarade de lutte", nom: "camarade-de-lutte", variante: "bandeau" },
  {
    source: "camarade de la première heure",
    nom: "camarade-de-la-premiere-heure",
    variante: "bandeau",
  },
  { source: "camarade infatigable", nom: "camarade-infatigable", variante: "bandeau" },
  { source: "camarade d'honneur", nom: "camarade-d-honneur", variante: "bandeau" },
  { source: "camarade pour la vie", nom: "camarade-pour-la-vie", variante: "bandeau" },
];

/**
 * Nombre de lignes de bord à rogner, depuis le début d'une suite de niveaux
 * de bord : les lignes consécutives entièrement sombres (`<= level`), puis
 * la barbe grise qui les suit (`< fade`, au plus `maxFade` lignes), le tout
 * plafonné à `max`. Rend 0 dès que la première ligne n'est pas sombre — pas
 * de bande noire, pas de rognage. `niveaux[i]` est le niveau le plus CLAIR
 * de la i-ème ligne à partir du bord. Pur, sans I/O — c'est la seule
 * décision non triviale du script, et donc la seule testée.
 */
export function darkFrameRun(
  niveaux,
  { level = DARK_LEVEL, fade = FADE_LEVEL, maxFade = MAX_FADE, max = MAX_FRAME } = {},
) {
  let n = 0;
  while (n < niveaux.length && n < max && niveaux[n] <= level) n += 1;
  if (n === 0) return 0;
  for (let barbe = 0; barbe < maxFade; barbe += 1) {
    if (n >= niveaux.length || n >= max || niveaux[n] >= fade) break;
    n += 1;
  }
  return n;
}

/** Niveau le plus clair (max des canaux RVB) de chaque ligne/colonne de bord. */
function niveauxDeBord(data, { width, height, channels }, bord, profondeur) {
  const niveaux = [];
  const clair = (x, y) => {
    const i = (y * width + x) * channels;
    return Math.max(data[i], data[i + 1], data[i + 2]);
  };
  for (let n = 0; n < profondeur; n += 1) {
    let max = 0;
    if (bord === "gauche" || bord === "droite") {
      const x = bord === "gauche" ? n : width - 1 - n;
      for (let y = 0; y < height; y += 1) max = Math.max(max, clair(x, y));
    } else {
      const y = bord === "haut" ? n : height - 1 - n;
      for (let x = 0; x < width; x += 1) max = Math.max(max, clair(x, y));
    }
    niveaux.push(max);
  }
  return niveaux;
}

/**
 * Rogne les bandes de bord uniformément sombres des quatre côtés. Renvoie le
 * `sharp` d'origine (aucune extraction) quand il n'y a rien à rogner — cas
 * normal de 8 visuels sur 9.
 */
async function stripDarkFrame(image) {
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const profondeur = Math.min(MAX_FRAME + 1, info.width, info.height);
  const rogne = Object.fromEntries(
    ["gauche", "droite", "haut", "bas"].map((bord) => [
      bord,
      darkFrameRun(niveauxDeBord(data, info, bord, profondeur)),
    ]),
  );
  const total = Object.values(rogne).reduce((a, b) => a + b, 0);
  const region = {
    left: rogne.gauche,
    top: rogne.haut,
    width: info.width - rogne.gauche - rogne.droite,
    height: info.height - rogne.haut - rogne.bas,
  };
  return { rogne, total, region };
}

/** Les quatre coins d'une sortie, en 1 px — garde-fou du blanc pur. */
async function coins(buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  return [
    px(0, 0),
    px(info.width - 1, 0),
    px(0, info.height - 1),
    px(info.width - 1, info.height - 1),
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const valeur = (nom) => {
    const i = args.indexOf(nom);
    return i === -1 ? null : args[i + 1];
  };
  const src = valeur("--src");
  const dest = valeur("--out") ?? DEST_PAR_DEFAUT;
  const apply = args.includes("--apply");
  if (!src) {
    console.error(
      "Usage : node scripts/contreparties-visuels.mjs --src <dossier de la livraison> [--apply] [--out <dir>]",
    );
    process.exitCode = 1;
    return;
  }

  // Index NFC des fichiers livrés (HFS/APFS rend les accents en NFD).
  const livres = new Map(
    (await readdir(src))
      .filter((f) => /\.jpe?g$/i.test(f))
      .map((f) => [path.basename(f, path.extname(f)).normalize("NFC"), f]),
  );

  let echec = false;
  let poidsTotal = 0;
  for (const { source, nom, variante } of VISUELS) {
    const fichier = livres.get(source.normalize("NFC"));
    if (!fichier) {
      console.error(`✗ ${nom} : « ${source}.jpg » absent de ${src}`);
      echec = true;
      continue;
    }
    const chemin = path.join(src, fichier);
    const { rogne, total, region } = await stripDarkFrame(sharp(chemin));
    let pipeline = sharp(chemin);
    if (total > 0) pipeline = pipeline.extract(region);
    if (variante === "compact") {
      pipeline = pipeline.trim({ background: "#ffffff", threshold: TRIM_THRESHOLD });
    }
    const buffer = await pipeline
      .resize({ width: WIDTH[variante] })
      .jpeg(JPEG)
      .toBuffer();

    const sale = (await coins(buffer)).filter((c) => c.some((v) => v < BLANC_MIN));
    const { width, height } = await sharp(buffer).metadata();
    const ancien = await readFile(path.join(dest, `${nom}.jpg`)).catch(() => null);
    poidsTotal += buffer.length;
    const liseré = total > 0 ? ` liseré rogné=${JSON.stringify(rogne)}` : "";
    console.log(
      `${apply ? "→" : "·"} ${nom.padEnd(30)} ${width}×${height} ${Math.round(buffer.length / 1024)} Ko` +
        ` (avant : ${ancien ? `${Math.round(ancien.length / 1024)} Ko` : "—"})${liseré}`,
    );
    if (sale.length > 0) {
      console.error(
        `✗ ${nom} : fond non blanc en coin (${sale.map((c) => c.join("/")).join(" ")}) —` +
          " incompatible avec `mix-blend-multiply` ; visuel à re-livrer.",
      );
      echec = true;
      continue;
    }
    if (apply) await writeFile(path.join(dest, `${nom}.jpg`), buffer);
  }

  console.log(`Total : ${Math.round(poidsTotal / 1024)} Ko pour ${VISUELS.length} visuels.`);
  if (echec) {
    console.error("Rien n'a été écrit pour les visuels en échec.");
    process.exitCode = 1;
    return;
  }
  if (!apply) console.log("Rapport seul — relancer avec --apply pour écrire les assets.");
}

await main();
