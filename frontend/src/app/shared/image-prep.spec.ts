import { checkImageFile, downscaleTarget, MAX_UPLOAD_BYTES, MAX_UPLOAD_EDGE } from './image-prep';

describe('image preparation', () => {
  it('accepts JPEG, PNG and WebP only', () => {
    expect(checkImageFile({ type: 'image/jpeg', size: 1 }).ok).toBe(true);
    expect(checkImageFile({ type: 'image/webp', size: 1 }).ok).toBe(true);
    expect(checkImageFile({ type: 'image/gif', size: 1 }).ok).toBe(false);
    expect(checkImageFile({ type: 'application/pdf', size: 1 }).ok).toBe(false);
  });

  it('leaves photos that are small in pixels and bytes alone', () => {
    expect(downscaleTarget({ size: MAX_UPLOAD_BYTES }, { width: 2048, height: 1536 })).toBeNull();
  });

  it('shrinks the long side to the maximum edge, keeping the aspect ratio', () => {
    expect(downscaleTarget({ size: 3_000_000 }, { width: 4000, height: 3000 })).toEqual({
      width: MAX_UPLOAD_EDGE,
      height: 1536,
    });
    expect(downscaleTarget({ size: 3_000_000 }, { width: 3000, height: 4000 })).toEqual({
      width: 1536,
      height: MAX_UPLOAD_EDGE,
    });
  });

  it('rounds to whole pixels and never yields a zero side', () => {
    expect(downscaleTarget({ size: 1 }, { width: 10_000, height: 3 })).toEqual({ width: MAX_UPLOAD_EDGE, height: 1 });
    expect(downscaleTarget({ size: 1 }, { width: 5001, height: 3333 })).toEqual({ width: 2048, height: 1365 });
  });

  it('never upscales, but re-encodes a small image that is too heavy in bytes', () => {
    expect(downscaleTarget({ size: MAX_UPLOAD_BYTES + 1 }, { width: 2000, height: 1000 })).toEqual({
      width: 2000,
      height: 1000,
    });
  });
});
