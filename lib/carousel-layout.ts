export function getCarouselVisibleCount({
  containerWidth,
  itemCount,
  minCardWidth = 170,
  gap = 12,
  maxVisible = 4,
}: {
  containerWidth: number;
  itemCount: number;
  minCardWidth?: number;
  gap?: number;
  maxVisible?: number;
}) {
  if (itemCount <= 0) return 0;
  if (containerWidth <= 0) return 1;
  const fittingCards = Math.floor((containerWidth + gap) / (minCardWidth + gap));
  return Math.max(1, Math.min(itemCount, maxVisible, fittingCards));
}

export function getCarouselCardBasis(visibleCount: number, gap = 12) {
  const safeCount = Math.max(1, visibleCount);
  return `calc((100% - ${(safeCount - 1) * gap}px) / ${safeCount})`;
}
