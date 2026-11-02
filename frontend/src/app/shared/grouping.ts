import { ColorRef, Detection, PartRef, PieceGroup, ScanSummary } from '../core/api/generated/models';

export const UNIDENTIFIED_LABEL = 'Unidentified piece';
export const UNKNOWN_COLOR_LABEL = 'Unknown color';

export function groupKey(part: PartRef | null | undefined, color: ColorRef | null | undefined): string {
  return `${part?.partNum ?? '?'}|${color?.id ?? '?'}`;
}

/**
 * Rebuilds the grouped summary from the active detections, with the same rules as the backend
 * (group by part+color, sorted by count desc). Used after local edits so the UI updates
 * instantly without another round trip; the server stays the source of truth on reload.
 */
export function buildSummary(detections: readonly Detection[]): ScanSummary {
  const groups = new Map<string, PieceGroup>();
  for (const detection of detections) {
    const key = groupKey(detection.part, detection.color);
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      group.detectionIds.push(detection.id);
    } else {
      groups.set(key, {
        part: detection.part ?? null,
        color: detection.color ?? null,
        count: 1,
        detectionIds: [detection.id],
      });
    }
  }
  const sorted = [...groups.values()].sort(
    (a, b) => b.count - a.count || groupTitle(a).localeCompare(groupTitle(b)),
  );
  return {
    totalPieces: detections.length,
    distinctParts: sorted.length,
    unidentifiedPieces: detections.filter((d) => !d.part).length,
    groups: sorted,
  };
}

export function groupTitle(group: Pick<PieceGroup, 'part'>): string {
  return group.part?.name ?? UNIDENTIFIED_LABEL;
}

export function colorTitle(color: ColorRef | null | undefined): string {
  return color?.name ?? UNKNOWN_COLOR_LABEL;
}

/** Lowest confidence in a group: the one the user most likely needs to look at. */
export function minConfidence(group: PieceGroup, byId: ReadonlyMap<string, Detection>): number {
  let min = 1;
  for (const id of group.detectionIds) {
    min = Math.min(min, byId.get(id)?.confidence ?? 1);
  }
  return min;
}

export function indexById(detections: readonly Detection[]): Map<string, Detection> {
  return new Map(detections.map((d) => [d.id, d]));
}

/** Picks black or white text for readable contrast on a given #RRGGBB background. */
export function readableTextColor(hex: string): '#000000' | '#ffffff' {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.179 ? '#000000' : '#ffffff';
}
