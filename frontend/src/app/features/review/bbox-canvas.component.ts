import { Component, computed, effect, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { Detection } from '../../core/api/generated/models';
import {
  BBox,
  boxFromCorners,
  clientToImagePoint,
  fitCanvasSize,
  hitTest,
  imageToCanvasScale,
  Point,
  scaleBBox,
  Size,
} from '../../shared/bbox-geometry';
import { confidenceColor } from '../../shared/confidence';

/** Longest canvas edge in device pixels. Boxes are scaled from image pixels to this size. */
const MAX_CANVAS_EDGE = 1800;

/**
 * Shows the scan photo with a box per detection, colored by confidence. Also supports tapping a
 * box to select it and dragging a new box (draw mode). All coordinates in and out are image pixels.
 */
@Component({
  selector: 'app-bbox-canvas',
  template: `
    <canvas
      #canvas
      class="photo"
      [class.drawing]="drawing()"
      [width]="canvasSize().width"
      [height]="canvasSize().height"
      role="img"
      [attr.aria-label]="ariaLabel()"
      data-testid="scan-canvas"
      [attr.data-selected-detection]="selectedId() ?? ''"
      [attr.data-highlighted-detections]="highlightedIds().join(',')"
      (click)="onClick($event)"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="cancelDrag()"
    ></canvas>
  `,
  styles: `
    :host {
      display: block;
    }
    .photo {
      display: block;
      width: 100%;
      height: auto;
      border-radius: 10px;
      background: #e7e2d6;
      cursor: pointer;
    }
    .photo.drawing {
      cursor: crosshair;
      touch-action: none;
    }
  `,
})
export class BboxCanvas {
  /** Natural size of the stored photo; boxes are expressed in these pixels. */
  readonly imageSize = input.required<Size>();
  readonly photo = input.required<HTMLImageElement | null>();
  readonly detections = input.required<readonly Detection[]>();
  readonly selectedId = input<string | null>(null);
  /** Extra boxes to emphasize, e.g. every piece of the expanded list group. */
  readonly highlightedIds = input<readonly string[]>([]);
  readonly drawing = input(false);

  readonly detectionTapped = output<string>();
  readonly boxDrawn = output<BBox>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly dragStart = signal<Point | null>(null);
  private readonly dragEnd = signal<Point | null>(null);

  protected readonly canvasSize = computed(() => fitCanvasSize(this.imageSize(), MAX_CANVAS_EDGE));
  protected readonly ariaLabel = computed(() => {
    const boxes = this.detections().filter((d) => d.bbox).length;
    return `Your photo with ${boxes} detected ${boxes === 1 ? 'piece' : 'pieces'} outlined. Use the list below to review each piece.`;
  });

  constructor() {
    effect(() => this.draw());
  }

  protected onClick(event: MouseEvent): void {
    if (this.drawing()) {
      return;
    }
    const id = hitTest(this.detections(), this.toImagePoint(event));
    if (id) {
      this.detectionTapped.emit(id);
    }
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.drawing()) {
      return;
    }
    this.canvas().nativeElement.setPointerCapture(event.pointerId);
    const point = this.toImagePoint(event);
    this.dragStart.set(point);
    this.dragEnd.set(point);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragStart()) {
      this.dragEnd.set(this.toImagePoint(event));
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    const start = this.dragStart();
    if (!start) {
      return;
    }
    const box = boxFromCorners(start, this.toImagePoint(event), this.imageSize());
    this.cancelDrag();
    if (box) {
      this.boxDrawn.emit(box);
    }
  }

  protected cancelDrag(): void {
    this.dragStart.set(null);
    this.dragEnd.set(null);
  }

  private toImagePoint(event: MouseEvent): Point {
    const rect = this.canvas().nativeElement.getBoundingClientRect();
    return clientToImagePoint({ x: event.clientX, y: event.clientY }, rect, this.imageSize());
  }

  private draw(): void {
    const element = this.canvas().nativeElement;
    const context = element.getContext('2d');
    if (!context) {
      return;
    }
    const image = this.photo();
    const scale = imageToCanvasScale(this.imageSize(), this.canvasSize());
    const selectedId = this.selectedId();
    const highlighted = new Set(this.highlightedIds());
    const lineWidth = Math.max(3, element.width / 220);
    const draft = this.draftBox();

    context.clearRect(0, 0, element.width, element.height);
    if (image) {
      context.drawImage(image, 0, 0, element.width, element.height);
    }
    for (const detection of this.detections()) {
      if (!detection.bbox) {
        continue;
      }
      const box = scaleBBox(detection.bbox, scale);
      const selected = detection.id === selectedId || highlighted.has(detection.id);
      const color = confidenceColor(detection.confidence);
      if (selected) {
        context.fillStyle = color + '33';
        context.fillRect(box.x, box.y, box.width, box.height);
      }
      this.strokeBox(context, box, color, selected ? lineWidth * 1.8 : lineWidth);
    }
    if (draft) {
      this.strokeBox(context, scaleBBox(draft, scale), '#2563eb', lineWidth * 1.4, [lineWidth * 3, lineWidth * 2]);
    }
  }

  private draftBox(): BBox | null {
    const start = this.dragStart();
    const end = this.dragEnd();
    if (!start || !end) {
      return null;
    }
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
  }

  /** White halo under the colored stroke keeps boxes visible on both dark and light backgrounds. */
  private strokeBox(
    context: CanvasRenderingContext2D,
    box: BBox,
    color: string,
    width: number,
    dash: number[] = [],
  ): void {
    context.setLineDash(dash);
    context.lineWidth = width + 3;
    context.strokeStyle = '#ffffff';
    context.strokeRect(box.x, box.y, box.width, box.height);
    context.lineWidth = width;
    context.strokeStyle = color;
    context.strokeRect(box.x, box.y, box.width, box.height);
  }
}
