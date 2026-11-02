import { checkImageFile, downscaleTarget, MAX_UPLOAD_BYTES, MAX_UPLOAD_EDGE } from './image-prep';

describe('image preparation', () => {
  it('accepts JPEG, PNG and WebP only', () => {
    expect(checkImageFile({ type: 'image/jpeg', size: 1 }).ok).toBe(true);
    expect(checkImageFile({ type: 'image/webp', size: 1 }).ok).toBe(true);
    expect(checkImageFile({ type: 'image/gif', size: 1 }).ok).toBe(false);
    expect(checkImageFile({ type: 'application/pdf', size: 1 }).ok).toBe(false);
  });

  it('leaves small files alone', () => {
    expect(downscaleTarget({ size: MAX_UPLOAD_BYTES }, { width: 4000, height: 3000 })).toBeNull();
  });

  it('shrinks oversized photos to the maximum edge, keeping the aspect ratio', () => {
    expect(downscaleTarget({ size: MAX_UPLOAD_BYTES + 1 }, { width: 6000, height: 4000 })).toEqual({
      width: MAX_UPLOAD_EDGE,
      height: 2000,
    });
  });

  it('never upscales', () => {
    expect(downscaleTarget({ size: MAX_UPLOAD_BYTES + 1 }, { width: 2000, height: 1000 })).toEqual({
      width: 2000,
      height: 1000,
    });
  });
});
