import { connectionAllows3d, pickTier, QualitySignals, TIERS } from './quality';

const laptop: QualitySignals = {
  cores: 10,
  memoryGb: 8,
  coarsePointer: false,
  shortSidePx: 900,
  devicePixelRatio: 2,
};

describe('pickTier', () => {
  it('gives a capable laptop the high tier with ~35 bricks and DPR capped at 2', () => {
    const tier = pickTier(laptop);
    expect(tier.name).toBe('high');
    expect(tier.brickCount).toBe(35);
    expect(tier.maxPixelRatio).toBe(2);
  });

  it('gives phones the mid tier with ~15 bricks', () => {
    const phone = { ...laptop, cores: 8, coarsePointer: true, shortSidePx: 390, devicePixelRatio: 3 };
    expect(pickTier(phone).name).toBe('mid');
    expect(pickTier(phone).brickCount).toBe(15);
  });

  it('treats a narrow window as phone-like even with a mouse', () => {
    expect(pickTier({ ...laptop, shortSidePx: 500 }).name).toBe('mid');
  });

  it('drops modest machines (4 cores or 4 GB) to mid', () => {
    expect(pickTier({ ...laptop, cores: 4 }).name).toBe('mid');
    expect(pickTier({ ...laptop, memoryGb: 4 }).name).toBe('mid');
  });

  it('puts very weak devices on the low tier, which never renders 3D', () => {
    expect(pickTier({ ...laptop, cores: 2 }).render3d).toBe(false);
    expect(pickTier({ ...laptop, memoryGb: 2 }).name).toBe('low');
  });

  it('assumes 4 cores when hardwareConcurrency is unknown and ignores a missing deviceMemory', () => {
    expect(pickTier({ ...laptop, cores: 0, memoryGb: undefined }).name).toBe('mid');
    expect(pickTier({ ...laptop, memoryGb: undefined }).name).toBe('high');
  });

  it('caps DPR and shadow cost lower on every step down', () => {
    expect(TIERS.mid.maxPixelRatio).toBeLessThan(TIERS.high.maxPixelRatio);
    expect(TIERS.mid.shadowMapSize).toBeLessThan(TIERS.high.shadowMapSize);
  });
});

describe('connectionAllows3d', () => {
  it('allows 3D when the Network Information API is missing (Safari, Firefox)', () => {
    expect(connectionAllows3d(undefined)).toBe(true);
  });

  it('allows 4g and unknown types', () => {
    expect(connectionAllows3d({ effectiveType: '4g' })).toBe(true);
    expect(connectionAllows3d({})).toBe(true);
  });

  it('blocks save-data and slow connections', () => {
    expect(connectionAllows3d({ saveData: true, effectiveType: '4g' })).toBe(false);
    for (const effectiveType of ['slow-2g', '2g', '3g']) {
      expect(connectionAllows3d({ effectiveType })).toBe(false);
    }
  });
});
