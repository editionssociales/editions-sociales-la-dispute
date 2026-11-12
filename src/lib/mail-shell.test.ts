import { readFileSync } from "node:fs";
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

  it("le gabarit commun ajoute la phrase et les deux liens à TOUT e-mail", () => {
    const html = renderMailShell({ documentTitle: "t", preheader: "p", heading: "h", bodyHtml: "" });
    expect(html).toContain(PHRASE);
    expect(html).toContain(`href="${INSTAGRAM_URL}"`);
    expect(html).toContain(`href="${TWITTER_URL}"`);
    expect(html).toMatch(/>Instagram<\/a> et <a[^>]*>Twitter\/X<\/a>\./);
  });

  it("version texte : phrase + adresses en clair", () => {
    const text = socialTextBlock();
    expect(text).toContain(PHRASE);
    expect(text).toContain(`Instagram : ${INSTAGRAM_URL}`);
    expect(text).toContain(`Twitter/X : ${TWITTER_URL}`);
  });

  it("le mail de remerciement de don (HTML et texte) la porte aussi", () => {
    const { html, text } = renderDonationThanksEmail();
    expect(html).toContain(INSTAGRAM_URL);
    expect(text).toContain(TWITTER_URL);
  });
});
