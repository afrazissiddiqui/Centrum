import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
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

@Injectable({
  providedIn: 'root',
})
export class OvertimeListService {
  private readonly http = inject(HttpClient);

  fetchOvertimeList(): Observable<OvertimeListRecord[]> {
    return this.http.get<unknown>(OVERTIME_RECORD_LIST_URL).pipe(
      map((response) => this.mapResponse(response)),
    );
  }

  postOvertimeEmployee(payload: OvertimeEmployeePostPayload[]): Observable<unknown> {
    return this.http.post<unknown>(OVERTIME_EMPLOYEE_POST_URL, payload);
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
