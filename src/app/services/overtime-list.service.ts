import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map, retry, throwError, timer } from 'rxjs';
import { apiUrl } from '../config/api.config';

export interface OvertimeListRecord {
  id: string;
  values: Record<string, unknown>;
}

export interface OvertimeEmployeePostPayload {
  employee_code: string;
  employee_name: string;
  overtime_date: string;
  shift_id: string;
  working_hours: number;
  shift_hours: number;
  overtime_hours: number;
  overtime_rate: number;
  exceptional_ot: number;
  flag: '1';
}

const OVERTIME_RECORD_LIST_URL = apiUrl('overtime-record-list');
const OVERTIME_EMPLOYEE_POST_URL = apiUrl('overtime-record-add');
const OVERTIME_POST_RATE_LIMIT_RETRIES = 5;
const OVERTIME_POST_RETRY_BASE_DELAY_MS = 1000;
const OVERTIME_POST_RETRY_MAX_DELAY_MS = 30000;

function isRateLimitedOvertimeError(error: unknown): boolean {
  if (error instanceof HttpErrorResponse && error.status === 429) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  return /too many attempts|too many requests/i.test(message);
}

function overtimePostRetryDelay(error: unknown, retryCount: number): Observable<unknown> {
  if (!isRateLimitedOvertimeError(error)) {
    return throwError(() => error);
  }

  const backoffLimit = Math.min(
    OVERTIME_POST_RETRY_BASE_DELAY_MS * 2 ** (retryCount - 1),
    OVERTIME_POST_RETRY_MAX_DELAY_MS,
  );
  const jitteredBackoff = Math.floor(Math.random() * backoffLimit);
  const retryAfter = error instanceof HttpErrorResponse
    ? error.headers.get('Retry-After')
    : null;
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
  const retryAfterDate = retryAfter ? Date.parse(retryAfter) : Number.NaN;
  const serverDelay = Number.isFinite(retryAfterSeconds)
    ? Math.max(0, retryAfterSeconds * 1000)
    : Number.isFinite(retryAfterDate)
      ? Math.max(0, retryAfterDate - Date.now())
      : 0;

  return timer(Math.max(serverDelay, jitteredBackoff));
}

@Injectable({
  providedIn: 'root',
})
export class OvertimeListService {
  private readonly http = inject(HttpClient);

  fetchOvertimeList(): Observable<OvertimeListRecord[]> {
    return this.http.get<unknown>(OVERTIME_RECORD_LIST_URL).pipe(
      retry({
        count: 2,
        delay: (error: unknown, retryCount: number) =>
          error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500)
            ? timer(retryCount * 500)
            : throwError(() => error),
      }),
      map((response) => this.mapResponse(response)),
    );
  }

  postOvertimeEmployee(payload: OvertimeEmployeePostPayload[]): Observable<unknown> {
    return this.http.post<unknown>(OVERTIME_EMPLOYEE_POST_URL, payload).pipe(
      map((response) => {
        if (response && typeof response === 'object' && !Array.isArray(response)) {
          const result = response as Record<string, unknown>;
          if (result['status'] === false || result['success'] === false) {
            const message = result['message'] ?? result['error'];
            throw new Error(typeof message === 'string' && message.trim()
              ? message
              : 'Overtime record could not be posted.');
          }
        }
        return response;
      }),
      retry({
        count: OVERTIME_POST_RATE_LIMIT_RETRIES,
        delay: overtimePostRetryDelay,
      }),
    );
  }

  private mapResponse(response: unknown): OvertimeListRecord[] {
    const rows = this.extractRows(response);
    return rows.map((values, index) => ({
      id: this.recordId(values, index),
      values,
    }));
  }

  private extractRows(response: unknown): Record<string, unknown>[] {
    if (Array.isArray(response)) {
      return response.filter((item): item is Record<string, unknown> => this.isRecord(item));
    }
    if (!this.isRecord(response)) {
      return [];
    }

    for (const key of ['data', 'results', 'records', 'list', 'overtimeRecords', 'overtime_record_list']) {
      const value = response[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => this.isRecord(item));
      }
      if (this.isRecord(value)) {
        const nestedRows = this.extractRows(value);
        if (nestedRows.length || Object.keys(value).length === 0) {
          return nestedRows;
        }
      }
    }

    return [];
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private recordId(record: Record<string, unknown>, index: number): string {
    const id = record['id'] ?? record['Id'] ?? record['ID'] ?? record['overtime_id'] ?? record['overtimeId'];
    return id === undefined || id === null || id === '' ? `overtime-${index}` : String(id);
  }
}
