import { z } from "zod";

export const INTRO_HELPER_MAX_LENGTH = 1_000;
export const INTRO_HELPER_MAX_LINKS = 8;
export const INTRO_HELPER_MAX_LABEL_LENGTH = 120;
export const INTRO_HELPER_MAX_URL_LENGTH = 512;

export type IntroHelperMarkupToken =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "link"; label: string; url: string };

export type IntroHelperMarkupErrorCode =
  | "too_long"
  | "too_many_links"
  | "incomplete_link"
  | "empty_label"
  | "label_too_long"
  | "url_too_long"
  | "invalid_url"
  | "credentials";

export type IntroHelperMarkupError = {
  code: IntroHelperMarkupErrorCode;
  message: string;
  linkNumber?: number;
};

export type IntroHelperMarkupResult =
  | { success: true; tokens: IntroHelperMarkupToken[]; linkCount: number }
  | { success: false; error: IntroHelperMarkupError; tokens: [{ type: "text"; value: string }]; linkCount: number };

const escapableCharacters = new Set(["[", "]", "(", ")", "*", "\\"]);

function linkMessage(message: string, linkNumber: number) {
  return linkNumber > 1 ? `U ${linkNumber}. odkazu ${message.charAt(0).toLocaleLowerCase("cs-CZ")}${message.slice(1)}` : message;
}

function errorResult(input: string, code: IntroHelperMarkupErrorCode, message: string, linkCount: number, linkNumber?: number): IntroHelperMarkupResult {
  return {
    success: false,
    error: { code, message: linkNumber ? linkMessage(message, linkNumber) : message, ...(linkNumber ? { linkNumber } : {}) },
    tokens: [{ type: "text", value: input }],
    linkCount,
  };
}

function readEscaped(input: string, index: number) {
  const next = input[index + 1];
  if (input[index] === "\\" && next && escapableCharacters.has(next)) {
    return { value: next, nextIndex: index + 2 };
  }
  return { value: input[index], nextIndex: index + 1 };
}

function appendText(tokens: IntroHelperMarkupToken[], value: string) {
  if (!value) return;
  const previous = tokens.at(-1);
  if (previous?.type === "text") previous.value += value;
  else tokens.push({ type: "text", value });
}

export function parseIntroHelperMarkup(input: string): IntroHelperMarkupResult {
  if (input.length > INTRO_HELPER_MAX_LENGTH) {
    return errorResult(input, "too_long", "Zkraťte text na 1 000 znaků včetně zápisu odkazů.", 0);
  }

  const tokens: IntroHelperMarkupToken[] = [];
  let textBuffer = "";
  let index = 0;
  let linkCount = 0;

  while (index < input.length) {
    const escaped = readEscaped(input, index);
    if (escaped.nextIndex > index + 1) {
      textBuffer += escaped.value;
      index = escaped.nextIndex;
      continue;
    }
    if (input.startsWith("**", index)) {
      let strongIndex = index + 2;
      let strongValue = "";
      let strongClosed = false;
      while (strongIndex < input.length) {
        const strongEscaped = readEscaped(input, strongIndex);
        if (strongEscaped.nextIndex > strongIndex + 1) {
          strongValue += strongEscaped.value;
          strongIndex = strongEscaped.nextIndex;
          continue;
        }
        if (input.startsWith("**", strongIndex)) {
          if (strongValue) {
            strongClosed = true;
            strongIndex += 2;
          }
          break;
        }
        strongValue += input[strongIndex];
        strongIndex += 1;
      }
      if (strongClosed) {
        appendText(tokens, textBuffer);
        textBuffer = "";
        tokens.push({ type: "strong", value: strongValue });
        index = strongIndex;
        continue;
      }
      textBuffer += "**";
      index += 2;
      continue;
    }
    if (input[index] !== "[") {
      textBuffer += input[index];
      index += 1;
      continue;
    }

    appendText(tokens, textBuffer);
    textBuffer = "";
    const linkNumber = linkCount + 1;
    index += 1;

    let label = "";
    let labelClosed = false;
    while (index < input.length) {
      const labelEscaped = readEscaped(input, index);
      if (labelEscaped.nextIndex > index + 1) {
        label += labelEscaped.value;
        index = labelEscaped.nextIndex;
        continue;
      }
      const character = input[index];
      if (character === "]") {
        labelClosed = true;
        index += 1;
        break;
      }
      if (character === "[" || character === "(" || character === ")") {
        return errorResult(input, "incomplete_link", "Dokončete odkaz ve tvaru [text odkazu](https://…).", linkCount, linkNumber);
      }
      label += character;
      index += 1;
    }

    if (!labelClosed || input[index] !== "(") {
      return errorResult(input, "incomplete_link", "Dokončete odkaz ve tvaru [text odkazu](https://…).", linkCount, linkNumber);
    }
    if (!label.trim()) {
      return errorResult(input, "empty_label", "Doplňte text odkazu mezi hranaté závorky.", linkCount, linkNumber);
    }
    if (label.length > INTRO_HELPER_MAX_LABEL_LENGTH) {
      return errorResult(input, "label_too_long", "Zkraťte text odkazu na nejvýše 120 znaků.", linkCount, linkNumber);
    }

    index += 1;
    let url = "";
    let urlClosed = false;
    while (index < input.length) {
      const urlEscaped = readEscaped(input, index);
      if (urlEscaped.nextIndex > index + 1) {
        url += urlEscaped.value;
        index = urlEscaped.nextIndex;
        continue;
      }
      const character = input[index];
      if (character === ")") {
        urlClosed = true;
        index += 1;
        break;
      }
      if (character === "(") {
        if (!url.toLocaleLowerCase("en-US").startsWith("https://")) {
          return errorResult(input, "invalid_url", "Použijte úplnou adresu začínající https://.", linkCount, linkNumber);
        }
        return errorResult(input, "incomplete_link", "Dokončete odkaz ve tvaru [text odkazu](https://…).", linkCount, linkNumber);
      }
      if (character === "[" || character === "]") {
        return errorResult(input, "incomplete_link", "Dokončete odkaz ve tvaru [text odkazu](https://…).", linkCount, linkNumber);
      }
      url += character;
      index += 1;
    }

    if (!urlClosed) {
      return errorResult(input, "incomplete_link", "Dokončete odkaz ve tvaru [text odkazu](https://…).", linkCount, linkNumber);
    }
    if (url.length > INTRO_HELPER_MAX_URL_LENGTH) {
      return errorResult(input, "url_too_long", "Zkraťte adresu odkazu na nejvýše 512 znaků.", linkCount, linkNumber);
    }

    if (!url.startsWith("https://") || /[\\\s\u0000-\u001f\u007f]/u.test(url)) {
      return errorResult(input, "invalid_url", "Použijte úplnou adresu začínající https://.", linkCount, linkNumber);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return errorResult(input, "invalid_url", "Použijte úplnou adresu začínající https://.", linkCount, linkNumber);
    }
    if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname) {
      return errorResult(input, "invalid_url", "Použijte úplnou adresu začínající https://.", linkCount, linkNumber);
    }
    if (parsedUrl.username || parsedUrl.password) {
      return errorResult(input, "credentials", "Odstraňte z adresy odkazu uživatelské jméno a heslo.", linkCount, linkNumber);
    }

    linkCount += 1;
    if (linkCount > INTRO_HELPER_MAX_LINKS) {
      return errorResult(input, "too_many_links", "Text může obsahovat nejvýše 8 odkazů.", linkCount);
    }
    tokens.push({ type: "link", label, url: parsedUrl.href });
  }

  appendText(tokens, textBuffer);
  return { success: true, tokens, linkCount };
}

export const introHelperTextSchema = z.string().superRefine((value, context) => {
  const result = parseIntroHelperMarkup(value);
  if (!result.success) context.addIssue({ code: z.ZodIssueCode.custom, message: result.error.message });
}).default("");
