import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { apiUrl } from '../config/api.config';

export interface PublicHolidayRecord {
  id: string;
  date: string;
  description: string;
  company?: string;
}

export interface PublicHolidayPayload {
  date: string;
  description: string;
}

@Injectable({
  providedIn: 'root',
})
export class PublicHolidayService {
  private readonly http = inject(HttpClient);

  addPublicHoliday(payload: PublicHolidayPayload): Observable<unknown> {
    return this.http.post<unknown>(apiUrl('public-holiday-add'), payload);
  }

  fetchPublicHolidays(): Observable<PublicHolidayRecord[]> {
    return this.http.get<unknown>(apiUrl('public-holiday-list')).pipe(
      map((response) => this.extractApiItems(response).map((item) => this.mapRecord(item))),
      map((records) => records.filter((record): record is PublicHolidayRecord => record !== null)),
      map((records) => {
        const uniqueRecords = new Map<string, PublicHolidayRecord>();
        for (const record of records) {
          const key = `${record.date}|${record.description.toLocaleLowerCase()}|${record.company?.toLocaleLowerCase() ?? ''}`;
          if (!uniqueRecords.has(key)) {
            uniqueRecords.set(key, record);
          }
        }
        return [...uniqueRecords.values()];
      }),
    );
  }

  private extractApiItems(response: unknown): Record<string, unknown>[] {
    if (Array.isArray(response)) {
      return response.filter((item): item is Record<string, unknown> => this.isRecord(item));
    }
    if (!this.isRecord(response)) {
      throw new Error('Unexpected public holiday API response.');
    }

    for (const key of ['data', 'items', 'results', 'records', 'list']) {
      const value = response[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => this.isRecord(item));
      }
      if (this.isRecord(value)) {
        return this.extractApiItems(value);
      }
    }

    throw new Error('Public holiday API response does not contain a holiday list.');
  }

  private mapRecord(item: Record<string, unknown>): PublicHolidayRecord | null {
    const date = this.pickString(item, ['date', 'holiday_date', 'holidayDate']);
    const description = this.pickString(item, ['description', 'name', 'holiday_name', 'holidayName']);
    if (!this.isDateKey(date) || !description) {
      return null;
    }

    return {
      id: this.pickString(item, ['id', 'Id', 'ID']) || `${date}-${description}`,
      date,
      description,
      company: this.pickString(item, ['company', 'company_name', 'companyName']) || undefined,
    };
  }

  private pickString(source: Record<string, unknown>, keys: string[]): string {
    const normalizedKeys = new Set(keys.map((key) => this.normalizeKey(key)));
    const entry = Object.entries(source).find(([key, value]) =>
      normalizedKeys.has(this.normalizeKey(key)) &&
      value !== undefined &&
      value !== null &&
      String(value).trim() !== '',
    );
    return entry ? String(entry[1]).trim() : '';
  }

  private normalizeKey(value: string): string {
    return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private isDateKey(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
