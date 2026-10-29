import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, of, tap } from 'rxjs';
import { apiUrl } from '../config/api.config';
import { AuthService } from './auth.service';
import { filterRecordsBySessionBranches } from '../utils/branch-filter.util';
import { formatSapApiFailureMessage } from '../utils/api-error.util';

export interface LeaveApplicationHeaderInfo {
  formNumber: string;
  employeeId: string;
  employeeName: string;
  employeeCategory: string;
  employmentNature: string;
  employmentType: string;
  workGradeLevel: string;
  department: string;
  jobTitle: string;
  location: string;
}

export interface LeaveApplicationRequest {
  requestDate: string;
  leaveType: string;
  causeOfLeave: string;
  fromDate: string;
  toDate: string;
  totalLeaveDaysRequested: number;
  requestStatus: string;
  remarks: string;
}

export interface LeaveBalanceInformation {
  totalLeaves: number;
  leavesAvailed: number;
  remainingLeaves: number;
}

export interface LeaveApplicationAddPayload {
  headerInfo: LeaveApplicationHeaderInfo;
  leaveRequest: LeaveApplicationRequest;
  leaveBalanceInformation: LeaveBalanceInformation;
}

export interface LeaveApplicationRecord {
  Id: number;
  FormNumber: string;
  EmployeeId: string;
  EmployeeName: string;
  Department: string;
  EmployeeCategory: string;
  EmploymentNature: string;
  EmploymentType: string;
  WorkGradeLevel: string;
  JobTitle: string;
  Location: string;
  RequestDate: string;
  LeaveType: string;
  CauseOfLeave: string;
  FromDate: string;
  ToDate: string;
  TotalLeaveDaysRequested: string;
  RequestStatus: string;
  Remarks: string;
  TotalLeaves: string;
  LeavesAvailed: string;
  RemainingLeaves: string;
  HeaderInfo: LeaveApplicationHeaderInfo;
  LeaveRequest: LeaveApplicationRequest;
  LeaveBalanceInformation: LeaveBalanceInformation;
  selected?: boolean;
}

const LEAVE_APPLICATION_LIST_URL = apiUrl('leave-application-list');
const LEAVE_APPLICATION_VIEW_URL = apiUrl('leave-application-detail');
const LEAVE_APPLICATION_ADD_URL = apiUrl('leave-application-add');
const LEAVE_APPLICATION_UPDATE_URL = apiUrl('leave-application-update');
const LEAVE_APPLICATION_DELETE_URL = apiUrl('leave-application-delete');

@Injectable({
  providedIn: 'root',
})
export class LeaveApplicationService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly leaveList = signal<LeaveApplicationRecord[]>([]);

  readonly leaves = this.leaveList.asReadonly();

  addLeaveApplication(payload: LeaveApplicationAddPayload): Observable<unknown> {
    return this.http.post<unknown>(LEAVE_APPLICATION_ADD_URL, payload).pipe(
      map((response) => {
        if (response && typeof response === 'object' && !Array.isArray(response)) {
          const result = response as Record<string, unknown>;
          if (result['status'] === false || result['success'] === false) {
            throw new Error(formatSapApiFailureMessage(response, 'Leave application could not be submitted.'));
          }
        }
        return response;
      }),
    );
  }

  updateLeaveApplication(id: string | number, payload: LeaveApplicationAddPayload): Observable<unknown> {
    const identifier = encodeURIComponent(String(id));
    return this.http.post(`${LEAVE_APPLICATION_UPDATE_URL}/${identifier}`, payload);
  }

  deleteLeaveApplication(id: string | number): Observable<unknown> {
    const identifier = encodeURIComponent(String(id));
    return this.http.delete(`${LEAVE_APPLICATION_DELETE_URL}/${identifier}`);
  }

  fetchLeaveApplications(): Observable<LeaveApplicationRecord[]> {
    return this.http.get<unknown>(LEAVE_APPLICATION_LIST_URL).pipe(
      map((response) => this.extractApiItems(response).map((item) => this.mapApiItemToRecord(item))),
      map((records) =>
        filterRecordsBySessionBranches(records, (record) => record.Location, this.authService.getSessionUser()),
      ),
      tap((records) => this.leaveList.set(records)),
    );
  }

  fetchLeaveApplicationsForEmployee(
    employeeCode: string,
    fromDate: string,
    toDate: string,
    leaveType?: string,
  ): Observable<LeaveApplicationRecord[]> {
    if (!employeeCode.trim()) {
      return of([]);
    }

    let params = new HttpParams()
      .set('search', employeeCode)
      .set('from_date', fromDate)
      .set('to_date', toDate);
    if (leaveType?.trim()) {
      params = params.set('leave_type', leaveType.trim());
    }

    return this.http.get<unknown>(LEAVE_APPLICATION_LIST_URL, { params }).pipe(
      map((response) => {
        this.throwIfApiRequestFailed(response);
        return this.extractApiItems(response).map((item) => this.mapApiItemToRecord(item));
      }),
      tap((records) => this.leaveList.set(records)),
    );
  }

  fetchLeaveApplicationsForDateRange(fromDate: string, toDate: string): Observable<LeaveApplicationRecord[]> {
    const params = new HttpParams().set('from_date', fromDate).set('to_date', toDate);

    return this.http.get<unknown>(LEAVE_APPLICATION_LIST_URL, { params }).pipe(
      map((response) => {
        this.throwIfApiRequestFailed(response);
        return this.extractApiItems(response).map((item) => this.mapApiItemToRecord(item));
      }),
      tap((records) => this.leaveList.set(records)),
    );
  }

  fetchLeaveApplicationDetail(id: string | number): Observable<LeaveApplicationRecord> {
    const identifier = encodeURIComponent(String(id));
    const numericId = Number.parseInt(String(id), 10) || 0;

    return this.http.get<unknown>(`${LEAVE_APPLICATION_VIEW_URL}/${identifier}`).pipe(
      map((response) => {
        const record = this.mapDetailResponse(response);
        if (!record.Id && numericId) {
          return { ...record, Id: numericId };
        }
        return record;
      }),
    );
  }

  removeLeaveRecord(record: LeaveApplicationRecord): void {
    this.leaveList.update((list) => list.filter((item) => item.Id !== record.Id));
  }

  findLeaveById(id: string | number): LeaveApplicationRecord | undefined {
    const numericId = Number.parseInt(String(id), 10);
    return this.leaveList().find((item) => item.Id === numericId);
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
    const arrayKeys = [
      'data',
      'items',
      'results',
      'records',
      'list',
      'leaves',
      'applications',
      'leave_applications',
      'leaveApplications',
      'leave_application_list',
      'leaveApplicationList',
    ];

    for (const key of arrayKeys) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
      }
    }

    const nestedData = obj['data'];
    if (nestedData && typeof nestedData === 'object') {
      if (Array.isArray(nestedData)) {
        return nestedData.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
      }

      const nestedRecord = this.asRecord(nestedData);
      if (this.isSingleRecordPayload(nestedRecord)) {
        return [nestedRecord];
      }

      const nestedItems = this.extractApiItems(nestedRecord);
      if (nestedItems.length > 0) {
        return nestedItems;
      }
    }

    if (this.isSingleRecordPayload(obj)) {
      return [obj];
    }

    return [];
  }

  private isSingleRecordPayload(obj: Record<string, unknown>): boolean {
    return Boolean(
      obj['headerInfo'] ||
        obj['header_info'] ||
        obj['HeaderInfo'] ||
        obj['leaveRequest'] ||
        obj['leave_request'] ||
        obj['LeaveRequest'] ||
        obj['leaveBalanceInformation'] ||
        obj['leave_balance_information'] ||
        obj['LeaveBalanceInformation'] ||
        obj['form_number'] ||
        obj['employee_name'] ||
        obj['leave_type'] ||
        obj['from_date'] ||
        obj['to_date'] ||
        obj['request_status'] ||
        obj['total_leave_days_requested'] ||
        obj['remaining_leaves'],
    );
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null) {
      return {};
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return {};
      }
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return {};
      }
      return {};
    }
    if (Array.isArray(value)) {
      const first = value[0];
      return first && typeof first === 'object' ? (first as Record<string, unknown>) : {};
    }
    if (typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private pickString(sources: Array<Record<string, unknown>>, keys: string[]): string {
    for (const source of sources) {
      for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          return String(value).trim();
        }
      }
    }
    return '';
  }

  private pickNumber(sources: Array<Record<string, unknown>>, keys: string[]): number {
    const text = this.pickString(sources, keys);
    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private throwIfApiRequestFailed(response: unknown): void {
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      const result = response as Record<string, unknown>;
      if (result['status'] === false || result['success'] === false) {
        throw new Error(formatSapApiFailureMessage(response, 'Leave applications could not be loaded.'));
      }
    }
  }

  private mapDetailResponse(response: unknown): LeaveApplicationRecord {
    const responseRecord = this.asRecord(response);
    const wrappedRecord = this.asRecord(responseRecord['data']);

    const items = this.extractApiItems(wrappedRecord && Object.keys(wrappedRecord).length > 0 ? wrappedRecord : response);
    if (items.length > 0) {
      return this.mapApiItemToRecord(items[0]);
    }

    if (wrappedRecord && Object.keys(wrappedRecord).length > 0) {
      return this.mapApiItemToRecord(wrappedRecord);
    }

    if (responseRecord && Object.keys(responseRecord).length > 0) {
      return this.mapApiItemToRecord(responseRecord);
    }

    throw new Error('Leave application not found');
  }

  private mapApiItemToRecord(item: Record<string, unknown>): LeaveApplicationRecord {
    const headerSource = this.asRecord(
      item['headerInfo'] ?? item['header_info'] ?? item['HeaderInfo'],
    );
    const leaveSource = this.asRecord(
      item['leaveRequest'] ?? item['leave_request'] ?? item['LeaveRequest'] ?? item['leaveDetail'],
    );
    const balanceSource = this.asRecord(
      item['leaveBalanceInformation'] ??
        item['leave_balance_information'] ??
        item['LeaveBalanceInformation'],
    );

    const sources = [headerSource, leaveSource, balanceSource, item];
    const id = this.pickString([item], ['id', 'Id', 'leave_application_id']);

    const headerInfo: LeaveApplicationHeaderInfo = {
      formNumber: this.pickString(sources, ['formNumber', 'form_number', 'FormNumber']),
      employeeId: this.pickString(sources, [
        'employeeId',
        'employee_id',
        'employeeID',
        'EmployeeId',
        'EmployeeID',
        'employeeCode',
        'employee_code',
        'EmployeeCode',
      ]),
      employeeName: this.pickString(sources, ['employeeName', 'employee_name', 'EmployeeName']),
      employeeCategory: this.pickString(sources, ['employeeCategory', 'employee_category']),
      employmentNature: this.pickString(sources, ['employmentNature', 'employment_nature']),
      employmentType: this.pickString(sources, [
        'employmentType',
        'employment_type',
        'employmentStatus',
        'employment_status',
        'employeeStatus',
        'employee_status',
      ]),
      workGradeLevel: this.pickString(sources, ['workGradeLevel', 'work_grade_level']),
      department: this.pickString(sources, ['department', 'Department']),
      jobTitle: this.pickString(sources, ['jobTitle', 'job_title']),
      location: this.pickString(sources, ['location', 'Location']),
    };

    const leaveRequest: LeaveApplicationRequest = {
      requestDate: this.pickString([leaveSource, item], ['requestDate', 'request_date']),
      leaveType: this.pickString(sources, ['leaveType', 'leave_type', 'LeaveType']),
      causeOfLeave: this.pickString([leaveSource, item], ['causeOfLeave', 'cause_of_leave']),
      fromDate: this.pickString(sources, ['fromDate', 'from_date', 'FromDate']),
      toDate: this.pickString(sources, ['toDate', 'to_date', 'ToDate']),
      totalLeaveDaysRequested: this.pickNumber([leaveSource, item], [
        'totalLeaveDaysRequested',
        'total_leave_days_requested',
        'leaveDays',
        'leave_days',
      ]),
      requestStatus: this.pickString(sources, [
        'requestStatus',
        'request_status',
        'status',
        'approvalStatus',
      ]),
      remarks: this.pickString([leaveSource, item], ['remarks', 'Remarks']),
    };

    const leaveBalanceInformation: LeaveBalanceInformation = {
      totalLeaves: this.pickNumber([balanceSource, item], ['totalLeaves', 'total_leaves']),
      leavesAvailed: this.pickNumber([balanceSource, item], ['leavesAvailed', 'leaves_availed']),
      remainingLeaves: this.pickNumber([balanceSource, item], ['remainingLeaves', 'remaining_leaves']),
    };

    return {
      Id: Number.parseInt(id, 10) || 0,
      FormNumber: headerInfo.formNumber || '—',
      EmployeeId: headerInfo.employeeId || '—',
      EmployeeName: headerInfo.employeeName || '—',
      Department: headerInfo.department || '—',
      EmployeeCategory: headerInfo.employeeCategory || '—',
      EmploymentNature: headerInfo.employmentNature || '—',
      EmploymentType: headerInfo.employmentType || '—',
      WorkGradeLevel: headerInfo.workGradeLevel || '—',
      JobTitle: headerInfo.jobTitle || '—',
      Location: headerInfo.location || '—',
      RequestDate: leaveRequest.requestDate || '—',
      LeaveType: leaveRequest.leaveType || '—',
      CauseOfLeave: leaveRequest.causeOfLeave || '—',
      FromDate: leaveRequest.fromDate || '—',
      ToDate: leaveRequest.toDate || '—',
      TotalLeaveDaysRequested: String(leaveRequest.totalLeaveDaysRequested),
      RequestStatus: leaveRequest.requestStatus || '—',
      Remarks: leaveRequest.remarks || '—',
      TotalLeaves: String(leaveBalanceInformation.totalLeaves),
      LeavesAvailed: String(leaveBalanceInformation.leavesAvailed),
      RemainingLeaves: String(leaveBalanceInformation.remainingLeaves),
      HeaderInfo: headerInfo,
      LeaveRequest: leaveRequest,
      LeaveBalanceInformation: leaveBalanceInformation,
      selected: false,
    };
  }
}
