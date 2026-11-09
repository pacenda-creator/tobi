export const CHAT_BLOCK_TYPES_V1 = [
  "steps",
  "alert",
  "infoCard",
  "action",
  "mediaCards",
  "tariffComparison",
  "sourceList",
] as const;

type PresentableBlock = {
  id: string;
  type: string;
  sourceIds?: string[];
};

export type ChatBlockPresentationUnit<TBlock extends PresentableBlock> = {
  key: string;
  block: TBlock;
  companions: TBlock[];
  sourceIds?: string[];
};

function isCompanion(block: PresentableBlock) {
  return block.type === "alert" || block.type === "action";
}

function selectInternetAlternative<TBlock extends PresentableBlock>(blocks: TBlock[], intentId: string, preferMedia: boolean) {
  if (intentId !== "internet") return blocks;
  const stepsIndex = blocks.findIndex((block) => block.type === "steps" && block.id === "answer-steps");
  const mediaIndex = blocks.findIndex((block) => block.type === "mediaCards" && block.id === "answer-media");
  if (stepsIndex < 0 || mediaIndex < 0) return blocks;
  if (!preferMedia) return blocks.filter((_, index) => index !== mediaIndex);

  const hidden = new Set([stepsIndex, mediaIndex]);
  const insertionIndex = Math.min(stepsIndex, mediaIndex);
  const selected: TBlock[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    if (index === insertionIndex) selected.push(blocks[mediaIndex]);
    if (!hidden.has(index)) selected.push(blocks[index]);
  }
  return selected;
}

export function planChatBlockPresentationV1<TBlock extends PresentableBlock>(
  blocks: TBlock[],
  intentId: string,
  preferMedia: boolean,
): ChatBlockPresentationUnit<TBlock>[] {
  const selected = selectInternetAlternative(blocks, intentId, preferMedia);
  const units: ChatBlockPresentationUnit<TBlock>[] = [];

  for (let index = 0; index < selected.length; index += 1) {
    const block = selected[index];
    if (block.type === "sourceList") {
      units.push({ key: `block:${block.type}:${block.id}`, block, companions: [], sourceIds: block.sourceIds || [] });
      continue;
    }

    if (block.type === "steps") {
      const companions: TBlock[] = [];
      while (index + 1 < selected.length && isCompanion(selected[index + 1])) {
        companions.push(selected[index + 1]);
        index += 1;
      }
      units.push({ key: `block:${block.type}:${block.id}`, block, companions });
      continue;
    }

    units.push({ key: `block:${block.type}:${block.id}`, block, companions: [] });
  }

  return units;
}
