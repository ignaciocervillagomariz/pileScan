import { Detection } from '../core/api/generated/models';
import { buildSummary, groupKey, minConfidence, indexById, readableTextColor } from './grouping';

const red = { id: 4, name: 'Red', rgb: '#C91A09' };
const blue = { id: 1, name: 'Blue', rgb: '#0055BF' };
const brick = { partNum: '3001', name: 'Brick 2 x 4' };
const plate = { partNum: '3020', name: 'Plate 2 x 4' };

function detection(id: string, overrides: Partial<Detection> = {}): Detection {
  return {
    id,
    source: 'DETECTED',
    corrected: false,
    confidence: 0.9,
    partCandidates: [],
    colorCandidates: [],
    mappingStatus: 'MAPPED',
    part: brick,
    color: red,
    ...overrides,
  };
}

describe('grouping helpers', () => {
  it('groups by part and color and sorts by count, then name', () => {
    const summary = buildSummary([
      detection('a'),
      detection('b', { part: plate }),
      detection('c'),
      detection('d', { color: blue }),
    ]);
    expect(summary.totalPieces).toBe(4);
    expect(summary.distinctParts).toBe(3);
    expect(summary.groups.map((g) => g.count)).toEqual([2, 1, 1]);
    expect(summary.groups[0].detectionIds).toEqual(['a', 'c']);
    expect(summary.groups[1].part?.name).toBe('Brick 2 x 4');
    expect(summary.groups[2].part?.name).toBe('Plate 2 x 4');
  });

  it('keeps unidentified pieces in their own group and counts them', () => {
    const summary = buildSummary([
      detection('a', { part: null }),
      detection('b', { part: null }),
      detection('c', { part: null, color: null }),
    ]);
    expect(summary.unidentifiedPieces).toBe(3);
    expect(summary.groups.map((g) => g.count)).toEqual([2, 1]);
  });

  it('handles an empty pile', () => {
    expect(buildSummary([])).toEqual({
      totalPieces: 0,
      distinctParts: 0,
      unidentifiedPieces: 0,
      groups: [],
    });
  });

  it('builds distinct keys for missing part or color', () => {
    expect(groupKey(brick, red)).toBe('3001|4');
    expect(groupKey(null, red)).toBe('?|4');
    expect(groupKey(brick, undefined)).toBe('3001|?');
  });

  it('reports the lowest confidence of a group', () => {
    const detections = [detection('a', { confidence: 0.9 }), detection('b', { confidence: 0.3 })];
    const [group] = buildSummary(detections).groups;
    expect(minConfidence(group, indexById(detections))).toBe(0.3);
  });

  it('picks readable text colors', () => {
    expect(readableTextColor('#FFFFFF')).toBe('#000000');
    expect(readableTextColor('#000000')).toBe('#ffffff');
    expect(readableTextColor('#0055BF')).toBe('#ffffff');
  });
});
