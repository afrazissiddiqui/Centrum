import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { apiUrl } from '../config/api.config';

export interface TaxCode {
  code: string;
  name: string;
}

const TAX_CODES_URL = apiUrl('tax_codes');

@Injectable({ providedIn: 'root' })
export class TaxCodesService {
  private readonly http = inject(HttpClient);
  private readonly catalog = signal<TaxCode[]>([]);
  private load$?: Observable<TaxCode[]>;

  ensureLoaded(): Observable<TaxCode[]> {
    if (this.catalog().length > 0) {
      return of(this.catalog());
    }

    if (!this.load$) {
      this.load$ = this.http.get<unknown>(TAX_CODES_URL).pipe(
        map((response) => this.parse(response)),
        tap((list) => {
          this.catalog.set(list);
          if (list.length === 0) {
            this.load$ = undefined;
          }
        }),
        catchError(() => {
          this.catalog.set([]);
          this.load$ = undefined;
          return of([]);
        }),
        shareReplay(1),
      );
    }

    return this.load$;
  }

  getCatalog(): readonly TaxCode[] {
    return this.catalog();
  }

  isLoading(): boolean {
    return !!this.load$ && this.catalog().length === 0;
  }

  search(query: string, limit = 8): TaxCode[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }

    return this.catalog()
      .filter((t) => t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
      .slice(0, limit);
  }

  private parse(response: unknown): TaxCode[] {
    if (!response) {
      return [];
    }

    if (Array.isArray(response)) {
      return response
        .flatMap((item) => {
          if (item === null || item === undefined) {
            return [];
          }
          if (typeof item === 'string') {
            return [{ code: item.trim(), name: item.trim() }];
          }
          if (typeof item === 'object') {
            return [this.mapTax(item as Record<string, unknown>)];
          }
          return [];
        })
        .filter((item) => item.code.trim() !== '');
    }

    if (typeof response !== 'object') {
      return [];
    }

    const obj = response as Record<string, unknown>;
    const arrayKeys = ['data', 'items', 'results', 'records', 'list', 'taxCodes', 'tax_codes'];

    for (const key of arrayKeys) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return value
          .flatMap((item) => {
            if (item === null || item === undefined) {
              return [];
            }
            if (typeof item === 'string') {
              return [{ code: item.trim(), name: item.trim() }];
            }
            if (typeof item === 'object') {
              return [this.mapTax(item as Record<string, unknown>)];
            }
            return [];
          })
          .filter((item) => item.code.trim() !== '');
      }
    }

    // If the API returns a map of code=>name
    const entries = Object.entries(obj).filter(([key, value]) => typeof value === 'string' && key.trim() !== '');
    if (entries.length > 0 && entries.every(([, value]) => value !== undefined && value !== null)) {
      return entries.map(([key, value]) => ({ code: key.trim(), name: String(value).trim() }));
    }

    if (
      obj['code'] ||
      obj['Code'] ||
      obj['name'] ||
      obj['Name'] ||
      obj['tax_code'] ||
      obj['taxCode'] ||
      obj['Tax_Code'] ||
      obj['TaxCode'] ||
      obj['TaxName'] ||
      obj['tax_name']
    ) {
      return [this.mapTax(obj)];
    }

    return [];
  }

  private mapTax(item: Record<string, unknown>): TaxCode {
    return {
      code: this.pickString([item], ['code', 'taxCode', 'tax_code', 'TaxCode', 'Tax_Code']),
      name: this.pickString([item], ['name', 'description', 'taxName', 'tax_name', 'TaxName']),
    };
  }

  private pickString(sources: Array<Record<string, unknown>>, keys: string[]): string {
    for (const source of sources) {
      const normalizedSource: Record<string, unknown> = {};
      for (const [rawKey, value] of Object.entries(source)) {
        normalizedSource[rawKey.toLowerCase()] = value;
      }

      for (const key of keys) {
        const value = normalizedSource[key.toLowerCase()];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          return String(value).trim();
        }
      }
    }
    return '';
  }
}
