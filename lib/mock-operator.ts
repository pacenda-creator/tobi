export const MOCK_AGENT_CONNECT_DELAY_MS = 5_000;

export const MOCK_AGENT = {
  id: "mock-agent-jana",
  name: "Jana",
  role: "Zákaznická péče",
} as const;

export function isOperatorRequest(input: string) {
  const normalized = input.toLocaleLowerCase("cs").normalize("NFKC").replace(/[.!?]+$/g, "").trim();
  return [
    /(?:chci|potřebuji|můžu).*(?:operátor|operátork|živým agent|člověk|něk.*podpor)/,
    /(?:spoj|přepoj).*(?:operátor|člověk|podpora|agent)/,
    /mluvit.*(?:operátor|člověk|agent|podpora)/,
  ].some((pattern) => pattern.test(normalized));
}

export function deterministicOperatorReply(input: string) {
  const normalized = input.toLocaleLowerCase("cs");
  if (normalized.includes("jak se") || normalized.includes("jak se máte")) return "Dobrý den, děkuji, mám se dobře. A jak vám dnes mohu pomoci?";
  if (normalized.includes("funguje") || normalized.includes("vyřešeno")) return "To ráda slyším. Mohu vám ještě s něčím pomoci?";
  if (normalized.includes("ne, děkuji") || normalized.includes("nic dalšího") || normalized.includes("to je vše")) return "Rádo se stalo. Přeji vám hezký den.";
  return "Rozumím. Jde o testovací konverzaci, takže nemám přístup k vašemu účtu ani nemohu provádět změny. Mohu vám ale pomoci upřesnit další postup.";
}
