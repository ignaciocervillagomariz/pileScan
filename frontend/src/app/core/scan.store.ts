import { computed, inject, Injectable, signal } from '@angular/core';
import { Api } from './api/generated/api';
import { addDetection } from './api/generated/fn/detections/add-detection';
import { deleteDetection } from './api/generated/fn/detections/delete-detection';
import { updateDetection } from './api/generated/fn/detections/update-detection';
import { createScan } from './api/generated/fn/scans/create-scan';
import { getScan } from './api/generated/fn/scans/get-scan';
import { Detection, DetectionUpdate, Scan } from './api/generated/models';
import { BBox } from '../shared/bbox-geometry';
import { AppError, toAppError } from './api-error';
import { buildSummary } from '../shared/grouping';

/**
 * Holds the scan being reviewed. Detections are the source of truth in the store; the grouped
 * summary is derived from them so every edit is reflected immediately.
 */
@Injectable({ providedIn: 'root' })
export class ScanStore {
  private readonly api = inject(Api);

  private readonly _scan = signal<Scan | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<AppError | null>(null);
  private readonly _selectedId = signal<string | null>(null);

  readonly scan = this._scan.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly selectedId = this._selectedId.asReadonly();

  readonly detections = computed(() => this._scan()?.detections ?? []);
  readonly summary = computed(() => buildSummary(this.detections()));
  readonly selected = computed(
    () => this.detections().find((d) => d.id === this._selectedId()) ?? null,
  );

  select(id: string | null): void {
    this._selectedId.set(id);
  }

  clearError(): void {
    this._error.set(null);
  }

  /** Uploads a photo. Resolves with the scan id, or null if the upload failed (see `error`). */
  async upload(image: Blob): Promise<string | null> {
    const scan = await this.run(() => this.api.invoke(createScan, { body: { image } }));
    if (!scan) {
      return null;
    }
    this._scan.set(scan);
    this._selectedId.set(null);
    return scan.id;
  }

  /** Loads a scan unless it is already the current one. */
  async load(id: string): Promise<boolean> {
    if (this._scan()?.id === id) {
      return true;
    }
    const scan = await this.run(() => this.api.invoke(getScan, { scanId: id }));
    if (!scan) {
      return false;
    }
    this._scan.set(scan);
    this._selectedId.set(null);
    return true;
  }

  async update(detectionId: string, patch: DetectionUpdate): Promise<boolean> {
    const scanId = this.requireScanId();
    const updated = await this.run(() =>
      this.api.invoke(updateDetection, { scanId, detectionId, body: patch }),
    );
    if (!updated) {
      return false;
    }
    this.replaceDetections((list) => list.map((d) => (d.id === detectionId ? updated : d)));
    return true;
  }

  async add(partNum: string, colorId: number, bbox: BBox | null): Promise<boolean> {
    const scanId = this.requireScanId();
    const created = await this.run(() =>
      this.api.invoke(addDetection, { scanId, body: { partNum, colorId, bbox } }),
    );
    if (!created) {
      return false;
    }
    this.replaceDetections((list) => [...list, created]);
    return true;
  }

  /** Optimistic: the piece disappears at once and comes back if the server rejects the delete. */
  async remove(detectionId: string): Promise<boolean> {
    const scanId = this.requireScanId();
    const before = this.detections();
    this.replaceDetections((list) => list.filter((d) => d.id !== detectionId));
    if (this._selectedId() === detectionId) {
      this._selectedId.set(null);
    }
    const result = await this.run(async () => {
      await this.api.invoke(deleteDetection, { scanId, detectionId });
      return true;
    });
    if (!result) {
      this.replaceDetections(() => before);
    }
    return result === true;
  }

  private replaceDetections(change: (list: Detection[]) => Detection[]): void {
    this._scan.update((scan) => (scan ? { ...scan, detections: change([...scan.detections]) } : scan));
  }

  private requireScanId(): string {
    const scan = this._scan();
    if (!scan) {
      throw new Error('No scan loaded');
    }
    return scan.id;
  }

  private async run<T>(work: () => Promise<T>): Promise<T | null> {
    this._loading.set(true);
    this._error.set(null);
    try {
      return await work();
    } catch (error) {
      this._error.set(toAppError(error));
      return null;
    } finally {
      this._loading.set(false);
    }
  }
}
