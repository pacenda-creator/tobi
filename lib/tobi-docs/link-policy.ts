function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part))) return false;
  const [a, b, c, d] = parts.map(Number);
  if ([a, b, c, d].some((part) => part > 255)) return true;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isPrivateIpv6(hostname: string) {
  if (!hostname.includes(":")) return false;
  if (hostname === "::" || hostname === "::1") return true;
  const first = Number.parseInt(hostname.split(":", 1)[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return true;

  if (hostname.startsWith("::ffff:")) {
    const mapped = hostname.slice("::ffff:".length);
    if (mapped.includes(".")) return isPrivateIpv4(mapped);
    const words = mapped.split(":");
    if (words.length === 2 && words.every((word) => /^[a-f0-9]{1,4}$/u.test(word))) {
      const address = (Number.parseInt(words[0], 16) * 65_536) + Number.parseInt(words[1], 16);
      return isPrivateIpv4(`${address >>> 24}.${(address >>> 16) & 255}.${(address >>> 8) & 255}.${address & 255}`);
    }
  }
  return false;
}

export function isAllowedDocumentationLink(value: string) {
  if (value.startsWith("#")) return /^#[a-z0-9-]+$/u.test(value);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const hostname = url.hostname.toLocaleLowerCase("en-US").replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return false;
    if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) return false;
    return hostname.includes(".") || hostname.includes(":");
  } catch {
    return false;
  }
}
