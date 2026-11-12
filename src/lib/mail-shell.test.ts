import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INK,
  INSTAGRAM_URL,
  LINE_COLOR,
  MUTED,
  PAPER,
  POP_ORANGE,
  POP_TEAL,
  renderMailShell,
  socialRowHtml,
  socialTextBlock,
  TWITTER_URL,
} from "./mail-shell";
import { renderDonationThanksEmail } from "./donation-mail";

/**
 * Les teintes des e-mails sont recopiées en dur (aucun client mail ne lit
 * `globals.css`) — ce test les COMPARE à la source, pour qu'une dérive (le
 * logo d'un mail à une autre teinte que celui du site, retour client
 * 2026-11) rougisse la suite au lieu de se voir dans une boîte de réception.
 */
const css = readFileSync(new URL("../app/(site)/globals.css", import.meta.url), "utf8");
const token = (name: string): string => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--color-${name} introuvable dans globals.css`);
  return m[1].toLowerCase();
};

describe("mail-shell — teintes alignées sur globals.css", () => {
  it.each([
    ["paper", PAPER],
    ["ink", INK],
    ["muted", MUTED],
    ["line", LINE_COLOR],
    ["pop-teal", POP_TEAL],
    ["pop-orange", POP_ORANGE],
  ])("--color-%s", (name, value) => {
    expect(value.toLowerCase()).toBe(token(name));
  });
});

describe("mail-shell — monogrammes du logo", () => {
  const html = renderMailShell({ documentTitle: "t", preheader: "p", heading: "h", bodyHtml: "" });
  const cell = (sigle: string) => html.match(new RegExp(`<td[^>]*background-color:[^>]*>${sigle}</td>`))?.[0] ?? "";

  it("ES : fond pop-teal (bleu clair), sigle ink — comme le header du site", () => {
    expect(cell("ES")).toContain(`background-color:${POP_TEAL}`);
    expect(cell("ES")).toContain(`color:${INK}`);
    expect(html).not.toContain("#262a5c");
  });

  it("LD : fond pop-orange, sigle ink — jamais la brique", () => {
    expect(cell("LD")).toContain(`background-color:${POP_ORANGE}`);
    expect(cell("LD")).toContain(`color:${INK}`);
    expect(html).not.toContain("#a8422b");
  });
});

describe("mail-shell — invitation à suivre les réseaux (tous les e-mails)", () => {
  const PHRASE = "Pour suivre nos actualités et découvrir nos prochaines publications, retrouvez-nous sur";

  it("comptes officiels : Instagram ladispute.ed, Twitter/X @DisputeEditions", () => {
    expect(INSTAGRAM_URL).toBe("https://www.instagram.com/ladispute.ed/");
    expect(TWITTER_URL).toBe("https://x.com/DisputeEditions");
  });

  it("bloc HTML : phrase, liens sur les deux noms, puis les deux icônes cliquables (PNG hébergés)", () => {
    const html = socialRowHtml();
    expect(html).toContain(PHRASE);
    expect(html).toContain(`href="${INSTAGRAM_URL}"`);
    expect(html).toContain(`href="${TWITTER_URL}"`);
    expect(html).toMatch(/>Instagram<\/a> et <a[^>]*>Twitter\/X<\/a>\./);
    expect(html).toContain('src="https://ld-es.fr/mail/instagram.png"');
    expect(html).toContain('src="https://ld-es.fr/mail/x.png"');
    expect(html).toContain('alt="Instagram"');
    expect(html).toContain('alt="Twitter/X"');
    // L'identifiant de chaque plateforme est visible, et cliquable.
    expect(html).toMatch(/<a href="https:\/\/www\.instagram\.com\/ladispute\.ed\/"[^>]*>@ladispute\.ed<\/a>/);
    expect(html).toMatch(/<a href="https:\/\/x\.com\/DisputeEditions"[^>]*>@DisputeEditions<\/a>/);
  });

  it("le gabarit commun, lui, ne l'ajoute plus : chaque mail la place avant son récapitulatif", () => {
    const html = renderMailShell({ documentTitle: "t", preheader: "p", heading: "h", bodyHtml: "" });
    expect(html).not.toContain(INSTAGRAM_URL);
  });

  it("les fichiers d'icônes existent dans public/mail", () => {
    for (const f of ["instagram.png", "x.png"]) {
      expect(existsSync(new URL(`../../public/mail/${f}`, import.meta.url))).toBe(true);
    }
  });

  it("version texte : phrase + adresses en clair", () => {
    const text = socialTextBlock();
    expect(text).toContain(PHRASE);
    expect(text).toContain(`Instagram @ladispute.ed : ${INSTAGRAM_URL}`);
    expect(text).toContain(`Twitter/X @DisputeEditions : ${TWITTER_URL}`);
  });

  it("don : après la signature, AVANT le récapitulatif de contrepartie (HTML et texte)", () => {
    const recap = { tierTitle: "Palier 100", amountEuros: 100, lines: [{ title: "Un livre", quantity: 1 }] };
    const { html, text } = renderDonationThanksEmail(recap);
    expect(html.indexOf(INSTAGRAM_URL)).toBeGreaterThan(html.indexOf("L’équipe des éditions sociales"));
    expect(html.indexOf(INSTAGRAM_URL)).toBeLessThan(html.indexOf("Un livre"));
    expect(text.indexOf(TWITTER_URL)).toBeLessThan(text.indexOf("Un livre"));
  });
});
