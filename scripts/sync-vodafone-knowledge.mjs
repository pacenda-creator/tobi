import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITEMAP_URL = "https://www.vodafone.cz/pece/sitemap-centrum-pece.xml";
const CONCURRENCY = 8;
const MAX_TEXT_LENGTH = 7000;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "data/vodafone-care-index.json");

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function cleanText(value) {
  return decodeEntities(
    value
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\t\r ]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

function unique(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractMatches(html, tagPattern) {
  const values = [];
  for (const match of html.matchAll(new RegExp(`<${tagPattern}\\b[^>]*>([\\s\\S]*?)<\\/${tagPattern}>`, "gi"))) {
    const value = cleanText(match[1]);
    if (value) values.push(value);
  }
  return values;
}

function extractPage(url, html) {
  const withoutNoise = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  const main = withoutNoise.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? withoutNoise;
  const firstHeading = main.search(/<h1\b/i);
  const fromHeading = firstHeading >= 0 ? main.slice(firstHeading) : main;
  const articleEnd = fromHeading.search(/Naposledy upraveno|Last updated|Další články k tématu|Mějte přehled o svých službách|Nenašli jste odpověď|Didn't find the answer/i);
  const article = articleEnd > 0 ? fromHeading.slice(0, articleEnd) : fromHeading;
  const title = extractMatches(article, "h1")[0]
    || cleanText(withoutNoise.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
    || url;
  const headings = unique([
    ...extractMatches(article, "h2"),
    ...extractMatches(article, "h3"),
  ]).slice(0, 40);
  const blocks = unique([
    ...extractMatches(article, "p"),
    ...extractMatches(article, "li"),
    ...extractMatches(article, "th"),
    ...extractMatches(article, "td"),
  ]).filter((text) => text.length > 1 && !/^(Úvod|English|Copyright ©|Další články k tématu)$/i.test(text));
  const text = unique([title, ...headings, ...blocks]).join("\n").slice(0, MAX_TEXT_LENGTH);
  const updated = cleanText(main).match(/(?:Naposledy upraveno|Last updated)\s+(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)?.[1] ?? null;
  const pathParts = new URL(url).pathname.split("/").filter(Boolean);

  return {
    url,
    title,
    category: pathParts[1] || "centrum-pece",
    headings,
    text,
    updated,
  };
}

async function fetchText(url, attempt = 1) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "TOBi-Prototype-Knowledge-Indexer/1.0 (+local UX prototype)",
        accept: "text/html,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (attempt < 3) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 500));
      return fetchText(url, attempt + 1);
    }
    throw error;
  }
}

async function main() {
  const sitemap = await fetchText(SITEMAP_URL);
  const allUrls = unique([...sitemap.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeEntities(match[1])))
    .filter((url) => url.startsWith("https://www.vodafone.cz/pece/"));
  const limit = Number.parseInt(process.env.KNOWLEDGE_LIMIT || "0", 10);
  const urls = limit > 0 ? allUrls.slice(0, limit) : allUrls;
  const pages = new Array(urls.length);
  const failures = [];
  let cursor = 0;
  let completed = 0;

  async function worker() {
    while (cursor < urls.length) {
      const index = cursor++;
      const url = urls[index];
      try {
        const html = await fetchText(url);
        const page = extractPage(url, html);
        if (page.text.length < 40) throw new Error("Page has no usable public text");
        pages[index] = page;
      } catch (error) {
        failures.push({ url, error: error instanceof Error ? error.message : String(error) });
      } finally {
        completed += 1;
        if (completed % 50 === 0 || completed === urls.length) {
          process.stdout.write(`Indexed ${completed}/${urls.length} pages\n`);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () => worker()));
  const validPages = pages.filter(Boolean);
  const result = {
    generatedAt: new Date().toISOString(),
    sitemap: SITEMAP_URL,
    pageCount: validPages.length,
    failedCount: failures.length,
    failures,
    pages: validPages,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result)}\n`, "utf8");
  process.stdout.write(`Saved ${validPages.length} pages to ${outputPath}\n`);
  if (failures.length) process.stdout.write(`Skipped ${failures.length} pages after retries\n`);
}

await main();
