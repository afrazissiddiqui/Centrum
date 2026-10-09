import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';
import { apiUrl } from '../config/api.config';

export interface EmployeeShiftAllocationRecord {
  id: string;
  shift: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
}

const EMPLOYEE_SHIFT_ALLOCATION_LIST_URL = apiUrl('employee-shift-allocation-list');
const EMPLOYEE_SHIFT_ALLOCATION_DETAIL_URL = apiUrl('employee-shift-allocation-detail');

@Injectable({
  providedIn: 'root',
})
export class EmployeeShiftAllocationService {
  private readonly http = inject(HttpClient);

  fetchShiftAllocations(): Observable<EmployeeShiftAllocationRecord[]> {
    return this.http.get<unknown>(EMPLOYEE_SHIFT_ALLOCATION_LIST_URL).pipe(
      map((response) => this.extractApiItems(response)),
      switchMap((items) => {
        if (!items.length) {
          return of([] as EmployeeShiftAllocationRecord[]);
        }
        return forkJoin(items.map((item) => this.fetchShiftAllocation(item)));
      }),
    );
  }

  private fetchShiftAllocation(item: Record<string, unknown>): Observable<EmployeeShiftAllocationRecord> {
    const id = this.pickString(item, [
      'id',
      'Id',
      'ID',
      'employee_shift_allocation_id',
      'employeeShiftAllocationId',
      'shift_allocation_id',
      'shiftAllocationId',
      'shift_id',
      'shiftId',
    ]);
    if (!id) {
      return of(this.mapRecord(item));
    }

    return this.http
      .get<unknown>(`${EMPLOYEE_SHIFT_ALLOCATION_DETAIL_URL}/${encodeURIComponent(id)}`)
      .pipe(map((response) => this.mapRecord({ ...item, ...this.extractDetail(response) })));
  }

  private extractApiItems(response: unknown): Record<string, unknown>[] {
    if (Array.isArray(response)) {
      return response.filter((item): item is Record<string, unknown> => this.isRecord(item));
    }
    if (!this.isRecord(response)) {
      return [];
    }

    for (const key of ['data', 'items', 'results', 'records', 'list', 'employee_shift_allocation_list']) {
      const value = response[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => this.isRecord(item));
      }
      if (this.isRecord(value)) {
        const nestedItems = this.extractApiItems(value);
        return nestedItems;
      }
    }

    return [response];
  }

  private extractDetail(response: unknown): Record<string, unknown> {
    if (Array.isArray(response)) {
      const firstRecord = response.find((item) => this.isRecord(item));
      return firstRecord ? this.extractDetail(firstRecord) : {};
    }
    if (!this.isRecord(response)) {
      return {};
    }
    const nested = response['data'] ?? response['record'] ?? response['detail'];
    return Array.isArray(nested) || this.isRecord(nested) ? this.extractDetail(nested) : response;
  }

  private mapRecord(item: Record<string, unknown>): EmployeeShiftAllocationRecord {
    return {
      id: this.pickString(item, [
        'id',
        'Id',
        'ID',
        'employee_shift_allocation_id',
        'employeeShiftAllocationId',
        'shift_allocation_id',
        'shiftAllocationId',
        'shift_id',
        'shiftId',
      ]),
      shift: this.pickString(item, [
        'shift',
        'Shift',
        'shift_name',
        'shiftName',
        'shift_code',
        'shiftCode',
        'name',
        'Name',
        'description',
        'Description',
      ]),
      name: this.pickString(item, ['name', 'Name', 'shift_name', 'shiftName']),
      code: this.pickString(item, ['code', 'Code', 'shift_code', 'shiftCode']),
      startTime: this.pickString(item, [
        'office_in_time',
        'officeInTime',
        'shift_start_time',
        'shiftStartTime',
        'start_time',
        'startTime',
        'in_time',
        'inTime',
        'from_time',
        'fromTime',
      ]),
      endTime: this.pickString(item, [
        'office_out_time',
        'officeOutTime',
        'shift_end_time',
        'shiftEndTime',
        'end_time',
        'endTime',
        'out_time',
        'outTime',
        'to_time',
        'toTime',
      ]),
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
