import { ColorStripe } from "./color-stripe";
import { BlockMenu, BlockMenuItem, SocialCircles, type BlockCell } from "./block-menu";
import { SiteMenuMobile } from "./site-menu-mobile";

const COMPACT_LINK_LABEL_CLASS = "font-sans text-[12.5px] font-bold uppercase tracking-[.06em]";

/** Bandeau compact (desktop) : recouvert par l'affiche au chargement, révélé au scroll — voir SiteHeader. */
const COMPACT_CELLS: BlockCell[] = [
  {
    key: "home",
    variant: "lien",
    href: "/",
    className: "flex min-w-0 flex-1 items-center whitespace-nowrap px-[clamp(16px,2vw,26px)]",
    label: (
      <>
        Éditions sociales <span className="px-[7px] opacity-50">×</span> La Dispute
      </>
    ),
    labelClassName: "font-serif text-[15px] font-semibold tracking-[.01em]",
  },
  {
    key: "catalogue",
    variant: "lien",
    href: "/catalogue",
    className: "flex items-center whitespace-nowrap px-[clamp(13px,1.4vw,20px)]",
    label: "Catalogue",
    labelClassName: COMPACT_LINK_LABEL_CLASS,
  },
  {
    key: "a-paraitre",
    variant: "lien",
    href: "/catalogue?upcoming=1",
    className: "flex items-center whitespace-nowrap px-[clamp(13px,1.4vw,20px)]",
    label: "À paraître",
    labelClassName: COMPACT_LINK_LABEL_CLASS,
  },
  {
    key: "rencontres",
    variant: "lien",
    href: "/rencontres",
    className: "flex items-center whitespace-nowrap px-[clamp(13px,1.4vw,20px)]",
    label: "Rencontres",
    labelClassName: COMPACT_LINK_LABEL_CLASS,
  },
  {
    key: "geme",
    variant: "lien",
    href: "/catalogue/editions-sociales?collection=geme",
    className: "flex items-center whitespace-nowrap px-[clamp(13px,1.4vw,20px)]",
    label: "La GEME",
    labelClassName: COMPACT_LINK_LABEL_CLASS,
  },
  {
    key: "soutenir",
    variant: "cta",
    href: "/souscription",
    className: "flex items-center gap-2 whitespace-nowrap px-[clamp(16px,1.8vw,24px)]",
    label: (
      <>
        Nous soutenir <span aria-hidden="true">→</span>
      </>
    ),
    labelClassName: "font-sans text-[12.5px] font-extrabold uppercase tracking-[.06em]",
  },
];

const MAISON_KICKER_CLASS = "font-sans text-[11px] uppercase tracking-[.2em] opacity-55";
const MAISON_LABEL_CLASS =
  "font-serif text-[clamp(22px,2.5vw,38px)] font-semibold uppercase leading-[0.98] tracking-[.005em]";
const NUMERO_LABEL_CLASS =
  "font-sans text-[clamp(17px,1.7vw,24px)] font-bold uppercase leading-none tracking-[.05em]";

/** Affiche (poster navbar) desktop : grille 4 colonnes × 6 rangées. */
const POSTER_CELLS: BlockCell[] = [
  {
    key: "la-dispute",
    variant: "lien",
    href: "/editions/la-dispute",
    colStart: 1,
    rowStart: 1,
    rowSpan: 2,
    className: "flex flex-col justify-end gap-[5px] px-7 py-6",
    kicker: "Maison",
    kickerClassName: MAISON_KICKER_CLASS,
    label: "La Dispute",
    labelClassName: MAISON_LABEL_CLASS,
  },
  {
    key: "editions-sociales",
    variant: "lien",
    href: "/editions/editions-sociales",
    colStart: 1,
    rowStart: 3,
    rowSpan: 2,
    className: "flex flex-col justify-end gap-[5px] px-7 py-6",
    kicker: "Maison",
    kickerClassName: MAISON_KICKER_CLASS,
    label: "Les Éditions sociales",
    labelClassName: MAISON_LABEL_CLASS,
  },
  {
    key: "nous-suivre",
    variant: "socials",
    colStart: 1,
    rowStart: 5,
    rowSpan: 2,
    className: "flex items-center gap-4 px-7 py-[18px]",
    content: (
      <>
        <span className="whitespace-nowrap font-sans text-[11px] uppercase tracking-[.22em] opacity-50">
          Nous suivre
        </span>
        <SocialCircles size="desktop" />
      </>
    ),
  },
  {
    key: "soutenir",
    // Le proto inverse ce grand bloc en paper/ink comme les autres cellules de
    // l'affiche ; le hover ocre est réservé au bandeau compact et au mobile.
    variant: "lien",
    href: "/souscription",
    colStart: 2,
    rowStart: 1,
    rowSpan: 6,
    className: "flex flex-col justify-between px-6 py-[26px]",
    // Le kicker du proto (« Souscription 2025 ») est erroné : aucune année n'est actée.
    kicker: "Souscription",
    kickerClassName: "font-sans text-[11px] uppercase tracking-[.2em] opacity-60",
    label: (
      <>
        Nous
        <br />
        soutenir
      </>
    ),
    labelClassName:
      "font-serif text-[clamp(30px,3.5vw,54px)] font-semibold uppercase leading-[0.94] tracking-[.004em]",
    note: (
      <>
        Soutenir les deux maisons <span aria-hidden="true">→</span>
      </>
    ),
    noteClassName: "font-sans text-[13px] tracking-[.02em] opacity-70",
  },
  {
    key: "catalogue",
    variant: "lien",
    href: "/catalogue",
    colStart: 3,
    rowStart: 1,
    rowSpan: 3,
    numero: "01",
    className: "flex flex-col justify-end gap-1.5 p-[22px]",
    label: "Catalogue",
    labelClassName: NUMERO_LABEL_CLASS,
  },
  {
    key: "a-paraitre",
    variant: "lien",
    href: "/catalogue?upcoming=1",
    colStart: 4,
    rowStart: 1,
    rowSpan: 3,
    numero: "02",
    className: "flex flex-col justify-end gap-1.5 p-[22px]",
    label: "À paraître",
    labelClassName: NUMERO_LABEL_CLASS,
  },
  {
    key: "rencontres",
    variant: "lien",
    href: "/rencontres",
    colStart: 3,
    rowStart: 4,
    rowSpan: 3,
    numero: "03",
    className: "flex flex-col justify-end gap-1.5 p-[22px]",
    label: "Rencontres",
    labelClassName: NUMERO_LABEL_CLASS,
  },
  {
    key: "geme",
    variant: "lien",
    href: "/catalogue/editions-sociales?collection=geme",
    colStart: 4,
    rowStart: 4,
    rowSpan: 3,
    numero: "04",
    className: "flex flex-col justify-end gap-1.5 p-[22px]",
    label: "La GEME",
    labelClassName: NUMERO_LABEL_CLASS,
  },
];

export function SiteHeader() {
  return (
    // `contents` : le <header> ne crée pas de boîte, ses enfants deviennent
    // des enfants directs du <body> (pleine hauteur de page). Indispensable
    // pour que le bandeau compact sticky colle au-delà de la hauteur du
    // header — un sticky ne dépasse jamais les limites de son parent.
    <header className="contents">
      <ColorStripe className="h-1" />

      {/*
        Bandeau compact desktop : sticky, hauteur 56px, margin-bottom négatif de la même
        valeur. L'affiche qui suit (position relative, z-index supérieur) le recouvre au
        chargement ; au scroll, l'affiche défile normalement hors du viewport tandis que
        le bandeau reste collé en haut — pur CSS, aucun JavaScript.
      */}
      <div className="sticky top-0 z-40 -mb-14 hidden h-14 shadow-[0_1px_0_rgba(23,20,15,.12),0_10px_24px_rgba(23,20,15,.10)] lg:flex lg:gap-[3px] lg:bg-paper">
        {COMPACT_CELLS.map((cell) => (
          <BlockMenuItem key={cell.key} cell={cell} />
        ))}
      </div>

      <BlockMenu
        cells={POSTER_CELLS}
        ariaLabel="Navigation principale"
        cols="lg:grid-cols-[1.72fr_1.04fr_1.06fr_1.06fr]"
        rows="lg:grid-rows-6"
        className="relative z-[41] hidden h-[clamp(330px,40vw,424px)] lg:grid"
      />

      <SiteMenuMobile />
    </header>
  );
}
