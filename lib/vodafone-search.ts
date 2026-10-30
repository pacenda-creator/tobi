import careIndex from "@/data/vodafone-care-index.json";

type IndexedPage = {
  url: string;
  title: string;
  category: string;
  headings: string[];
  text: string;
  updated: string | null;
};

const index = careIndex as {
  generatedAt: string;
  pageCount: number;
  failedCount: number;
  pages: IndexedPage[];
};

const stopWords = new Set([
  "aby", "ale", "ani", "ano", "asi", "bez", "bude", "bych", "co", "jak", "jsem", "jsou", "kde",
  "kdy", "kdyz", "ktery", "mam", "mi", "mohu", "na", "nebo", "nejde", "neni", "od", "pod", "potrebuji",
  "pro", "prosim", "se", "si", "svoje", "ten", "to", "u", "ve", "vam", "z", "za", "ze",
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("cs")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchStem(token: string) {
  if (token.length <= 4) return token;
  const withoutEnding = token.replace(/(eni|ami|emi|ove|ovy|ova|oveho|ych|im|em|am|ou|u|y|a|e|i)$/u, "");
  const stem = withoutEnding.length >= 4 ? withoutEnding : token;
  return stem.length > 5 ? stem.slice(0, 5) : stem;
}

function tokens(value: string) {
  return [...new Set(
    normalize(value)
      .split(/\s+/)
      .filter((token) => token.length > 1 && !stopWords.has(token))
      .map(searchStem),
  )];
}

const searchablePages = index.pages.map((page) => ({
  page,
  title: normalize(page.title),
  headings: normalize(page.headings.join(" ")),
  text: normalize(page.text),
  url: normalize(page.url),
  titleTerms: new Set(tokens(page.title)),
  headingTerms: new Set(tokens(page.headings.join(" "))),
  textTerms: new Set(tokens(page.text)),
}));

function occurrences(haystack: string, needle: string) {
  let count = 0;
  let cursor = 0;
  while (count < 5) {
    const next = haystack.indexOf(needle, cursor);
    if (next < 0) break;
    count += 1;
    cursor = next + needle.length;
  }
  return count;
}

function snippetFor(page: IndexedPage, queryTokens: string[]) {
  const normalizedTitle = normalize(page.title);
  const lines = page.text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && normalize(line) !== normalizedTitle);
  const ranked = lines
    .map((line, index) => {
      const lineTokens = tokens(line);
      const hits = queryTokens.reduce((sum, token) => sum + (lineTokens.includes(token) ? 1 : 0), 0);
      return { line, index, hits };
    })
    .sort((a, b) => b.hits - a.hits || a.index - b.index);
  const best = ranked[0]?.index ?? 0;
  return lines.slice(Math.max(0, best - 1), best + 3).join(" ").slice(0, 620);
}

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  updated: string | null;
  score: number;
};

export function searchVodafoneKnowledge(query: string, limit = 4): SearchResult[] {
  const queryNormalized = normalize(query);
  const queryTokens = tokens(query);
  if (!queryTokens.length) return [];

  const titleDocumentFrequency = new Map(
    queryTokens.map((token) => [
      token,
      searchablePages.filter((page) => page.titleTerms.has(token)).length,
    ]),
  );

  return searchablePages
    .map(({ page, title, headings, text, url, titleTerms, headingTerms, textTerms }) => {
      let score = 0;
      if (title.includes(queryNormalized)) score += 28;
      if (text.includes(queryNormalized)) score += 12;
      for (const token of queryTokens) {
        score += occurrences(title, token) * 9;
        score += occurrences(headings, token) * 5;
        score += occurrences(text, token) * 0.55;
        score += occurrences(url, token) * 2;
        if (titleTerms.has(token)) {
          const frequency = titleDocumentFrequency.get(token) || index.pages.length;
          score += Math.log2(index.pages.length / Math.max(1, frequency)) * 7;
        }
      }
      const titleCoverage = queryTokens.filter((token) => titleTerms.has(token)).length / queryTokens.length;
      const headingCoverage = queryTokens.filter((token) => headingTerms.has(token)).length / queryTokens.length;
      const pageCoverage = queryTokens.filter((token) => textTerms.has(token)).length / queryTokens.length;
      const urlCoverage = queryTokens.filter((token) => url.includes(token)).length / queryTokens.length;
      score += titleCoverage * titleCoverage * 42;
      score += headingCoverage * headingCoverage * 24;
      score += pageCoverage * pageCoverage * 12;
      score += urlCoverage * urlCoverage * 12;
      if (titleCoverage === 1) score += 30;
      if (page.url.includes("/pece/en/")) score *= 0.35;
      return { page, score };
    })
    .filter((item) => item.score >= Math.max(4, queryTokens.length * 2.2))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ page, score }) => ({
      title: page.title,
      url: page.url,
      snippet: snippetFor(page, queryTokens),
      updated: page.updated,
      score: Math.round(score * 10) / 10,
    }));
}

export function getKnowledgeStats() {
  return {
    pages: index.pageCount,
    failed: index.failedCount,
    generatedAt: index.generatedAt,
  };
}

export function formatRetrievedContext(results: SearchResult[]) {
  return results
    .map((result, indexNumber) => `ZDROJ ${indexNumber + 1}: ${result.title}\nURL: ${result.url}\nOBSAH: ${result.snippet}`)
    .join("\n\n");
}
