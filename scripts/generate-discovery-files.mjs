import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_ORIGIN = "https://docs.capriole.ai";
const LOCALE_PREFIXES = {
  en: "",
  "zh-Hans": "zh",
  es: "es",
  "pt-BR": "pt-br",
  de: "de",
  ja: "ja",
  ko: "ko",
};

function collectPages(value, pages = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPages(item, pages);
    }
    return pages;
  }

  if (!value || typeof value !== "object") {
    return pages;
  }

  for (const [key, item] of Object.entries(value)) {
    if (key === "pages" && Array.isArray(item)) {
      for (const page of item) {
        if (typeof page === "string") {
          pages.push(page);
        } else {
          collectPages(page, pages);
        }
      }
    } else {
      collectPages(item, pages);
    }
  }

  return pages;
}

function stripLocalePrefix(page, locale) {
  const prefix = LOCALE_PREFIXES[locale];
  if (!prefix) {
    return page;
  }

  const expectedPrefix = `${prefix}/`;
  if (!page.startsWith(expectedPrefix)) {
    throw new Error(`Expected ${locale} page to start with ${expectedPrefix}: ${page}`);
  }

  return page.slice(expectedPrefix.length);
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  return trimmed;
}

async function readFrontmatter(page) {
  const source = await readFile(path.join(ROOT, `${page}.mdx`), "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error(`Missing frontmatter: ${page}.mdx`);
  }

  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (field) {
      fields[field[1]] = unquote(field[2]);
    }
  }

  if (!fields.title || !fields.description) {
    throw new Error(`Missing title or description: ${page}.mdx`);
  }

  return fields;
}

function publicUrl(page) {
  return `${DOCS_ORIGIN}/${page}`;
}

const docsConfig = JSON.parse(await readFile(path.join(ROOT, "docs.json"), "utf8"));
const languages = docsConfig.navigation.languages;
const pagesByLocale = new Map();

for (const language of languages) {
  if (!(language.language in LOCALE_PREFIXES)) {
    throw new Error(`Unsupported locale in docs.json: ${language.language}`);
  }

  const pages = collectPages(language);
  const byKey = new Map(
    pages.map((page) => [stripLocalePrefix(page, language.language), page]),
  );
  if (byKey.size !== pages.length) {
    throw new Error(`Duplicate page in ${language.language} navigation`);
  }
  pagesByLocale.set(language.language, byKey);
}

const sourceKeys = [...pagesByLocale.get("en").keys()].sort();
for (const [locale, pages] of pagesByLocale) {
  const keys = [...pages.keys()].sort();
  if (JSON.stringify(keys) !== JSON.stringify(sourceKeys)) {
    throw new Error(`Navigation parity failed for ${locale}`);
  }
}

const sitemapLines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
];

for (const key of sourceKeys) {
  for (const [locale, pages] of pagesByLocale) {
    sitemapLines.push("  <url>");
    sitemapLines.push(`    <loc>${escapeXml(publicUrl(pages.get(key)))}</loc>`);
    for (const [alternateLocale, alternatePages] of pagesByLocale) {
      sitemapLines.push(
        `    <xhtml:link rel="alternate" hreflang="${alternateLocale}" href="${escapeXml(publicUrl(alternatePages.get(key)))}" />`,
      );
    }
    sitemapLines.push(
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(publicUrl(pagesByLocale.get("en").get(key)))}" />`,
    );
    sitemapLines.push("  </url>");
  }
}
sitemapLines.push("</urlset>", "");

const llmsLines = [
  "# Capriole AI Docs",
  "",
  `> ${docsConfig.description}`,
  "",
];

for (const [locale, pages] of pagesByLocale) {
  llmsLines.push(`## ${locale}`, "");
  for (const key of sourceKeys) {
    const page = pages.get(key);
    const frontmatter = await readFrontmatter(page);
    llmsLines.push(
      `- [${frontmatter.title}](${publicUrl(page)}.md): ${frontmatter.description}`,
    );
  }
  llmsLines.push("");
}

llmsLines.push(
  "## OpenAPI Specs",
  "",
  `- [openapi](${DOCS_ORIGIN}/api-reference/openapi.json)`,
  "",
);

await Promise.all([
  writeFile(path.join(ROOT, "sitemap.xml"), sitemapLines.join("\n"), "utf8"),
  writeFile(path.join(ROOT, "llms.txt"), llmsLines.join("\n"), "utf8"),
]);

console.log(
  `Generated sitemap.xml and llms.txt for ${sourceKeys.length} pages across ${pagesByLocale.size} locales.`,
);
