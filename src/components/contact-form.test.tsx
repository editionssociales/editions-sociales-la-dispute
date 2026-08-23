import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ContactForm } from "./contact-form";

vi.mock("@/app/(site)/contact/actions", () => ({
  sendContactMessage: async () => ({ status: "idle" }),
}));

describe("ContactForm — autocomplete (issue #116)", () => {
  it("identifie le but des champs (WCAG 1.3.5) sans toucher au focus d'erreur", () => {
    const html = renderToStaticMarkup(<ContactForm />);
    expect(html).toContain('autoComplete="name"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toMatch(/id="contact-subject"[\s\S]*?autoComplete="off"/);
    expect(html).toMatch(/id="contact-message"[\s\S]*?autoComplete="off"/);
    expect(html).toContain("contact-name");
    expect(html).toContain("aria-invalid");
  });
});
