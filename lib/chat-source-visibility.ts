type SourceWithId = {
  id: string;
};

type GetVisibleChatSourcesInput<TSource extends SourceWithId> = {
  showSources: boolean;
  sources: readonly TSource[];
  blockSourceIds: readonly string[];
  presentationSourceIds?: readonly string[];
};

export function getVisibleChatSources<TSource extends SourceWithId>({
  showSources,
  sources,
  blockSourceIds,
  presentationSourceIds,
}: GetVisibleChatSourcesInput<TSource>): TSource[] {
  if (!showSources) return [];

  const visibleIds = new Set(presentationSourceIds || blockSourceIds);
  return sources.filter((source) => visibleIds.has(source.id)).slice(0, 3);
}
