import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { apiUrl } from '../config/api.config';

export interface DepartmentPr {
  code: string;
  name: string;
  ccTypeCode?: string;
}

const DEPARTMENTS_PR_URL = apiUrl('departments_PR');

@Injectable({ providedIn: 'root' })
export class DepartmentsPrService {
  private readonly http = inject(HttpClient);
  private readonly catalog = signal<DepartmentPr[]>([]);
  private load$?: Observable<DepartmentPr[]>;

  ensureLoaded(): Observable<DepartmentPr[]> {
    if (this.catalog().length > 0) {
      return of(this.catalog());
    }

    if (!this.load$) {
      this.load$ = this.http.get<unknown>(DEPARTMENTS_PR_URL).pipe(
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

  search(query: string, limit = 8): DepartmentPr[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }

    return this.catalog()
      .filter((department) =>
        department.code.toLowerCase().includes(q) || department.name.toLowerCase().includes(q),
      )
      .slice(0, limit);
  }

  getCatalog(): readonly DepartmentPr[] {
    return this.catalog();
  }

  private parse(response: unknown): DepartmentPr[] {
    if (!response) {
      return [];
    }

    if (Array.isArray(response)) {
      return this.parseArray(response);
    }

    if (typeof response !== 'object') {
      return [];
    }

    const obj = response as Record<string, unknown>;
    const arrayKeys = [
      'data',
      'items',
      'results',
      'records',
      'list',
      'departments',
      'departments_PR',
      'departments_pr',
      'departmentsPr',
      'Departments',
      'Departments_PR',
      'DepartmentsPr',
    ];

    for (const key of arrayKeys) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return this.parseArray(value);
      }
    }

    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        const parsed = this.parseArray(value);
        if (parsed.length > 0) {
          return parsed;
        }
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') {
        const parsed = this.parse(value as unknown);
        if (parsed.length > 0) {
          return parsed;
        }
      }
    }

    // If the API returns a map of code => name.
    const entries = Object.entries(obj).filter(
      ([key, value]) => typeof value === 'string' && key.trim() !== '',
    );

    if (entries.length > 0) {
      return entries
        .map(([code, value]) => ({ code: code.trim(), name: String(value).trim() }))
        .filter((item) => item.code !== '');
    }

    if (obj['code'] || obj['Code'] || obj['name'] || obj['Name'] || obj['department'] || obj['Department']) {
      return [this.mapDepartment(obj)];
    }

    return [];
  }

  private parseArray(array: unknown[]): DepartmentPr[] {
    return array
      .flatMap((item) => {
        if (item === null || item === undefined) {
          return [];
        }
        if (typeof item === 'string') {
          return [{ code: item.trim(), name: item.trim() }];
        }
        if (typeof item === 'object') {
          return [this.mapDepartment(item as Record<string, unknown>)];
        }
        return [];
      })
      .filter((item) => item.code.trim() !== '');
  }

  private mapDepartment(item: Record<string, unknown>): DepartmentPr {
    return {
      code: this.pickString([item], [
        'code',
        'OcrCode',
        'ocrCode',
        'departmentCode',
        'department_code',
        'departmentId',
        'department_id',
        'department',
        'id',
      ]),
      name: this.pickString([item], [
        'name',
        'OcrName',
        'ocrName',
        'departmentName',
        'department_name',
        'DepartmentName',
        'Department',
        'department',
        'title',
        'Title',
      ]),
      ccTypeCode: this.pickString([item], [
        'CCTypeCode',
        'ccTypeCode',
        'cctypecode',
        'typeCode',
        'TypeCode',
      ]),
    };
  }

  private pickString(sources: Array<Record<string, unknown>>, keys: string[]): string {
    const normalizedKeyMap: Record<string, unknown> = {};
    for (const source of sources) {
      for (const [rawKey, value] of Object.entries(source)) {
        normalizedKeyMap[rawKey.toLowerCase()] = value;
      }
    }

    for (const key of keys) {
      const value = normalizedKeyMap[key.toLowerCase()];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
    return '';
  }
}
