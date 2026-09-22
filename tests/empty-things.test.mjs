import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "../src/lib/i18n/provider.tsx";
import { EmptyThings } from "../src/features/things/empty-things.tsx";
import { messages } from "../src/lib/i18n/messages.ts";

test("the dashboard renders only a real empty state and start/join actions in both languages", () => {
  for (const locale of ["en", "es"]) {
    const html = renderToStaticMarkup(createElement(LocaleProvider, { initialLocale: locale }, createElement(EmptyThings)));
    assert.ok(html.includes(messages[locale].yourThings));
    // React escapes apostrophes in English copy.
    assert.ok(html.includes(messages[locale].emptyThings.replaceAll("'", "&#x27;")));
    assert.ok(html.includes('href="/things/new"'));
    assert.ok(html.includes('href="/join"'));
    assert.doesNotMatch(html, /Mariana|Memo|Ana|streak|challenged you|3 moments|data-fixture/);
  }
});

test("production source has no sample names, fake activities, or mock fixture imports", () => {
  function visit(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? visit(path) : /\.(tsx?|jsx?)$/.test(path) ? [path] : [];
    });
  }
  for (const path of visit(fileURLToPath(new URL("../src", import.meta.url)))) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /\b(?:Mariana|Memo|Ana)\b|mock-things|12 day streak|challenged you|3 moments/, path);
  }
});
