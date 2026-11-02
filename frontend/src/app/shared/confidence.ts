export type ConfidenceLevel = 'high' | 'medium' | 'low';

export const HIGH_CONFIDENCE = 0.75;
export const MEDIUM_CONFIDENCE = 0.45;

/** Stroke colors for boxes drawn on the photo. All three keep >= 3:1 against the white halo. */
export const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  high: '#16a34a',
  medium: '#d97706',
  low: '#dc2626',
};

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= HIGH_CONFIDENCE) {
    return 'high';
  }
  if (confidence >= MEDIUM_CONFIDENCE) {
    return 'medium';
  }
  return 'low';
}

export function confidenceColor(confidence: number): string {
  return CONFIDENCE_COLORS[confidenceLevel(confidence)];
}

/** Text label so confidence is never conveyed by color alone. */
export function confidenceLabel(confidence: number): string {
  const percent = Math.round(confidence * 100);
  const word = { high: 'High', medium: 'Medium', low: 'Low' }[confidenceLevel(confidence)];
  return `${word} confidence (${percent}%)`;
}
