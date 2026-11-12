import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INK, LINE_COLOR, MUTED, NAVY, PAPER, POP_ORANGE, renderMailShell } from "./mail-shell";

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
    ["navy", NAVY],
    ["pop-orange", POP_ORANGE],
  ])("--color-%s", (name, value) => {
    expect(value.toLowerCase()).toBe(token(name));
  });
});

describe("mail-shell — monogrammes du logo", () => {
  const html = renderMailShell({ documentTitle: "t", preheader: "p", heading: "h", bodyHtml: "" });
  const cell = (sigle: string) => html.match(new RegExp(`<td[^>]*background-color:[^>]*>${sigle}</td>`))?.[0] ?? "";

  it("ES : fond navy, sigle paper (comme le header du site)", () => {
    expect(cell("ES")).toContain(`background-color:${NAVY}`);
    expect(cell("ES")).toContain(`color:${PAPER}`);
  });

  it("LD : fond pop-orange, sigle ink — jamais la brique", () => {
    expect(cell("LD")).toContain(`background-color:${POP_ORANGE}`);
    expect(cell("LD")).toContain(`color:${INK}`);
    expect(html).not.toContain("#a8422b");
  });
});
