import {
  CONFIDENCE_COLORS,
  confidenceColor,
  confidenceLabel,
  confidenceLevel,
  HIGH_CONFIDENCE,
  MEDIUM_CONFIDENCE,
} from './confidence';

describe('confidence helpers', () => {
  it('buckets confidence at the documented thresholds', () => {
    expect(confidenceLevel(1)).toBe('high');
    expect(confidenceLevel(HIGH_CONFIDENCE)).toBe('high');
    expect(confidenceLevel(HIGH_CONFIDENCE - 0.01)).toBe('medium');
    expect(confidenceLevel(MEDIUM_CONFIDENCE)).toBe('medium');
    expect(confidenceLevel(MEDIUM_CONFIDENCE - 0.01)).toBe('low');
    expect(confidenceLevel(0)).toBe('low');
  });

  it('maps levels to green, amber and red', () => {
    expect(confidenceColor(0.95)).toBe(CONFIDENCE_COLORS.high);
    expect(confidenceColor(0.6)).toBe(CONFIDENCE_COLORS.medium);
    expect(confidenceColor(0.1)).toBe(CONFIDENCE_COLORS.low);
  });

  it('describes confidence in words as well as color', () => {
    expect(confidenceLabel(0.876)).toBe('High confidence (88%)');
    expect(confidenceLabel(0.2)).toBe('Low confidence (20%)');
  });
});
