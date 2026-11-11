import { afterEach, describe, expect, it, vi } from "vitest";

import { mergeLabels } from "../src/labels";
import { LOCALES, resolveLocale } from "../src/locales";

function setBrowser(htmlLang: string, languages: string[]) {
  document.documentElement.lang = htmlLang;
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
  vi.spyOn(navigator, "language", "get").mockReturnValue(languages[0] ?? "");
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.lang = "";
});

describe("resolveLocale", () => {
  it("prefers the locale option over the page and the browser", () => {
    setBrowser("de", ["it-IT"]);
    expect(resolveLocale("fr")).toBe("fr");
  });

  it("uses <html lang> when no locale is given", () => {
    setBrowser("pt", ["it-IT"]);
    expect(resolveLocale()).toBe("pt");
  });

  it("falls back to the browser languages, in order", () => {
    setBrowser("", ["ja-JP", "es-MX", "fr"]);
    expect(resolveLocale()).toBe("es");
  });

  it.each([
    ["pt-BR", "pt"],
    ["fr_CA", "fr"],
    ["NL", "nl"],
    [" cs-CZ ", "cs"],
  ])("maps the region variant %s to its base language %s", (tag, expected) => {
    setBrowser("", []);
    expect(resolveLocale(tag)).toBe(expected);
  });

  it("skips an unsupported locale option and keeps looking", () => {
    setBrowser("it", []);
    expect(resolveLocale("ja")).toBe("it");
  });

  it("falls back to English when nothing is supported", () => {
    setBrowser("zh", ["ja-JP"]);
    expect(resolveLocale("ko")).toBe("en");
  });
});

describe("locales", () => {
  const keys = (value: object): string[] =>
    Object.entries(value).flatMap(([key, child]) =>
      typeof child === "object" ? keys(child).map((sub) => `${key}.${sub}`) : [key],
    );

  it.each(Object.keys(LOCALES))("%s translates every label and keeps the placeholders", (code) => {
    const labels = LOCALES[code as keyof typeof LOCALES];
    expect(keys(labels).sort()).toEqual(keys(LOCALES.en).sort());
    for (const value of keys(labels).map((path) => path.split(".").reduce<any>((node, key) => node[key], labels)))
      expect(value).not.toBe("");
    expect(labels.tooMany).toContain("{max}");
    expect(labels.sentBody).toContain("{ref}");
  });

  it("lets labels override the translated defaults", () => {
    const labels = mergeLabels({ title: "Contactez-nous", types: { bug: { tab: "Un souci ?" } } }, "fr");
    expect(labels.title).toBe("Contactez-nous");
    expect(labels.cancel).toBe("Annuler");
    expect(labels.types.bug.tab).toBe("Un souci ?");
    expect(labels.types.bug.label).toBe(LOCALES.fr.types.bug.label);
  });
});
