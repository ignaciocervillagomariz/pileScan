import { inject, Injectable, signal } from '@angular/core';
import { Api } from './api/generated/api';
import { listColors } from './api/generated/fn/catalog/list-colors';
import { searchParts } from './api/generated/fn/catalog/search-parts';
import { Color, Part } from './api/generated/models';

/** Catalog lookups for the edit dialog. The color list is small and static, so it is fetched once. */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly api = inject(Api);
  private colorsRequest: Promise<Color[]> | null = null;

  readonly colors = signal<Color[]>([]);

  async loadColors(): Promise<Color[]> {
    this.colorsRequest ??= this.api.invoke(listColors).then((colors) => {
      this.colors.set(colors);
      return colors;
    });
    try {
      return await this.colorsRequest;
    } catch (error) {
      this.colorsRequest = null;
      throw error;
    }
  }

  search(query: string, limit = 12): Promise<Part[]> {
    return this.api.invoke(searchParts, { q: query, limit });
  }
}
