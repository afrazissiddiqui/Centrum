import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay, tap, throwError } from 'rxjs';
import { apiUrl } from '../config/api.config';
import { OitmItem } from '../constants/oitm-items';

@Injectable({
  providedIn: 'root',
})
export class OitmItemsService {
  private readonly http = inject(HttpClient);
  private readonly catalog = signal<OitmItem[]>([]);
  private load$?: Observable<OitmItem[]>;

  /** Returns cached items when available; otherwise fetches once and reuses. */
  ensureLoaded(): Observable<OitmItem[]> {
    if (this.catalog().length > 0) {
      return of(this.catalog());
    }

    return this.fetchCatalog();
  }

  /** Clears cache and fetches items again (Retry). */
  reload(): Observable<OitmItem[]> {
    this.load$ = undefined;
    this.catalog.set([]);
    return this.fetchCatalog();
  }

  getItems(): Observable<OitmItem[]> {
    return this.ensureLoaded();
  }

  getCatalog(): readonly OitmItem[] {
    return this.catalog();
  }

  isLoaded(): boolean {
    return this.catalog().length > 0;
  }

  private fetchCatalog(): Observable<OitmItem[]> {
    if (!this.load$) {
      this.load$ = this.http.get<unknown>(apiUrl('items')).pipe(
        map((response) => this.parseItems(response)),
        tap((items) => {
          this.catalog.set(items);
          if (items.length === 0) {
            this.load$ = undefined;
          }
        }),
        catchError((error) => {
          this.load$ = undefined;
          this.catalog.set([]);
          return throwError(() => error);
        }),
        shareReplay(1),
      );
    }

    return this.load$;
  }

  private parseItems(response: unknown): OitmItem[] {
    return this.extractApiItems(response)
      .map((item) => this.mapOitmItem(item))
      .filter((item) => item.itemCode.trim() !== '')
      .sort((left, right) =>
        left.itemCode.localeCompare(right.itemCode, undefined, { numeric: true, sensitivity: 'base' }),
      );
  }

  private extractApiItems(response: unknown): Array<Record<string, unknown>> {
    if (!response) {
      return [];
    }

    if (Array.isArray(response)) {
      return response.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }

    if (typeof response !== 'object') {
      return [];
    }

    const obj = response as Record<string, unknown>;
    if (obj['status'] === false) {
      return [];
    }

    const arrayKeys = ['data', 'items', 'results', 'records', 'list'];

    for (const key of arrayKeys) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
      }
    }

    const nestedData = obj['data'];
    if (nestedData && typeof nestedData === 'object') {
      const nestedItems = this.extractApiItems(nestedData);
      if (nestedItems.length > 0) {
        return nestedItems;
      }
    }

    return [];
  }

  private mapOitmItem(item: Record<string, unknown>): OitmItem {
    return {
      itemCode: this.pickString([item], ['ItemCode', 'itemCode', 'item_code', 'code', 'Code']),
      itemName: this.pickString([item], ['ItemName', 'itemName', 'item_name', 'name', 'Name', 'description', 'Description']),
      itemType: this.pickString([item], ['ItemType', 'itemType', 'item_type', 'type', 'Type']),
      fetchPro: this.pickString([item], ['U_FetchPro', 'u_fetch_pro', 'uFetchPro']),
      cavityNumber: this.pickString([item], ['U_CavityNo', 'u_cavity_no', 'uCavityNo']),
      properties: this.pickProperties(item),
      uom: this.pickString([item], ['uom', 'UOM', 'Uom', 'unit', 'Unit']),
      availableQty: this.pickQtyValue(item),
      batches: this.pickBatches(item),
    };
  }

  private cleanSapText(value: unknown): string {
    return String(value ?? '')
      .replace(/\u0000/g, '')
      .trim();
  }

  private pickString(sources: Array<Record<string, unknown>>, keys: string[]): string {
    for (const source of sources) {
      for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null) {
          const text = this.cleanSapText(value);
          if (text !== '') {
            return text;
          }
        }
      }
    }
    return '';
  }

  private pickQtyValue(item: Record<string, unknown>): string | number | undefined {
    const value = item['availableQty'] ?? item['available_qty'] ?? item['quantity'];
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value === 'number') {
      return value;
    }
    const text = this.cleanSapText(value);
    return text || undefined;
  }

  private pickProperties(item: Record<string, unknown>): OitmItem['properties'] {
    const raw = item['Properties'] ?? item['properties'];
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((property): property is Record<string, unknown> => !!property && typeof property === 'object')
      .map((property) => ({
        code: this.pickString([property], ['code', 'Code']),
        name: this.pickString([property], ['name', 'Name']),
      }))
      .filter((property) => property.code || property.name);
  }

  private pickBatches(item: Record<string, unknown>): OitmItem['batches'] {
    const raw = item['batches'];
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((batch): batch is Record<string, unknown> => !!batch && typeof batch === 'object')
      .map((batch) => ({
        batchNumber: this.pickString([batch], ['batchNumber', 'batch_number', 'BatchNumber', 'BatchNum']),
        warehouse: this.pickString([batch], [
          'warehouse',
          'Warehouse',
          'warehouseCode',
          'warehouse_code',
          'WhsCode',
        ]),
        quantity: this.pickQtyValue(batch),
        legacyBatch: this.pickString([batch], ['U_LegacyBatch', 'u_legacy_batch', 'legacyBatch', 'legacy_batch']),
        manufacturingDate: this.pickString([batch], [
          'manufacturingDate',
          'manufacturing_date',
          'ManufacturingDate',
        ]),
        expiryDate: this.pickString([batch], ['expiryDate', 'expiry_date', 'ExpiryDate']),
      }))
      .filter(
        (batch) =>
          batch.batchNumber || batch.warehouse || batch.quantity || batch.legacyBatch || batch.manufacturingDate || batch.expiryDate,
      );
  }
}
