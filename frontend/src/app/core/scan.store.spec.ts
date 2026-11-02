import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Api } from './api/generated/api';
import { Detection, Scan } from './api/generated/models';
import { ScanStore } from './scan.store';

const red = { id: 4, name: 'Red', rgb: '#C91A09' };
const brick = { partNum: '3001', name: 'Brick 2 x 4' };

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

function scan(detections: Detection[]): Scan {
  return {
    id: 'scan-1',
    status: 'COMPLETED',
    createdAt: '2026-11-02T10:00:00Z',
    image: { url: '/api/scans/scan-1/image', width: 1000, height: 800 },
    detections,
    summary: { totalPieces: 0, distinctParts: 0, unidentifiedPieces: 0, groups: [] },
    warnings: [],
  };
}

describe('ScanStore', () => {
  let invoke: ReturnType<typeof vi.fn>;
  let store: ScanStore;

  async function loadScan(detections: Detection[]): Promise<void> {
    invoke.mockResolvedValueOnce(scan(detections));
    await store.load('scan-1');
  }

  beforeEach(() => {
    invoke = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: { invoke } }] });
    store = TestBed.inject(ScanStore);
  });

  it('derives the grouped summary from the detections, not from the server summary', async () => {
    await loadScan([detection('a'), detection('b')]);
    expect(store.summary().totalPieces).toBe(2);
    expect(store.summary().groups).toHaveLength(1);
    expect(store.summary().groups[0].count).toBe(2);
  });

  it('does not reload a scan that is already current', async () => {
    await loadScan([detection('a')]);
    await store.load('scan-1');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('replaces a detection with the server response after an update', async () => {
    await loadScan([detection('a'), detection('b')]);
    const plate = { partNum: '3020', name: 'Plate 2 x 4' };
    invoke.mockResolvedValueOnce(detection('a', { part: plate, corrected: true, confidence: 1 }));

    expect(await store.update('a', { partNum: '3020' })).toBe(true);

    expect(store.summary().groups.map((g) => g.part?.partNum).sort()).toEqual(['3001', '3020']);
    expect(store.detections().find((d) => d.id === 'a')?.corrected).toBe(true);
  });

  it('removes a deleted piece at once and restores it if the server fails', async () => {
    await loadScan([detection('a'), detection('b')]);
    let fail!: (error: unknown) => void;
    invoke.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));

    const pending = store.remove('a');
    expect(store.detections().map((d) => d.id)).toEqual(['b']);

    fail(new HttpErrorResponse({ status: 500 }));
    expect(await pending).toBe(false);
    expect(store.detections().map((d) => d.id)).toEqual(['a', 'b']);
    expect(store.error()?.status).toBe(500);
  });

  it('appends manually added pieces', async () => {
    await loadScan([detection('a')]);
    invoke.mockResolvedValueOnce(detection('m', { source: 'MANUAL', confidence: 1, bbox: null }));

    expect(await store.add('3001', 4, null)).toBe(true);
    expect(store.summary().totalPieces).toBe(2);
    expect(invoke.mock.calls.at(-1)?.[1]).toMatchObject({
      scanId: 'scan-1',
      body: { partNum: '3001', colorId: 4, bbox: null },
    });
  });

  it('exposes an error and returns null when the upload fails', async () => {
    invoke.mockRejectedValueOnce(new HttpErrorResponse({ status: 413 }));
    expect(await store.upload(new Blob(['x']))).toBeNull();
    expect(store.error()?.message).toContain('too large');
    expect(store.scan()).toBeNull();
  });
});
