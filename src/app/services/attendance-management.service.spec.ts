import '@angular/compiler';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { of } from 'rxjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationFormRecord, ApplicationFormService } from './application-form.service';
import {
  AttendanceDailyRecord,
  AttendanceManagementService,
  formatPunchTime,
  parseWorkingDurationMinutes,
} from './attendance-management.service';

describe('AttendanceManagementService calculated working hours', () => {
  let service: AttendanceManagementService;
  let httpMock: HttpTestingController;
  let employeeRecords: ApplicationFormRecord[];

  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
  });

  beforeEach(() => {
    employeeRecords = [];
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AttendanceManagementService,
        {
          provide: ApplicationFormService,
          useValue: {
            getApplicationRecords: () => employeeRecords,
            fetchEmployeeProfiles: () => of([]),
          },
        },
      ],
    });
    service = TestBed.inject(AttendanceManagementService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the employee by padded card number and returns hours_worked', () => {
    const result: { hours: string | null } = { hours: null };
    service.fetchCalculatedWorkingHours(
      { mode: 'date', date: '2026-09-29' },
      '4023',
    ).subscribe((value) => (result.hours = value));

    const request = httpMock.expectOne((req) => req.urlWithParams.includes('card_no=00004023'));
    expect(request.request.params.get('from_date')).toBe('2026-09-29');
    expect(request.request.params.get('to_date')).toBe('2026-09-29');
    expect(request.request.headers.has('X-API-Key')).toBe(true);
    request.flush(JSON.stringify({ data: [{ hours_worked: '6h 16m' }] }));

    expect(result.hours).toBe('6h 16m');
  });

  it('fetches daily working hours for a date range with the employee legacy code', () => {
    let dailyHours: Array<{ date: string; hoursWorked: string }> = [];
    service.fetchCalculatedWorkingHoursByDate(
      { mode: 'dateRange', fromDate: '2026-09-01', toDate: '2026-09-30' },
      '4023',
    ).subscribe((value) => (dailyHours = value));

    const request = httpMock.expectOne((req) => req.urlWithParams.includes('card_no=00004023'));
    expect(request.request.params.get('from_date')).toBe('2026-09-01');
    expect(request.request.params.get('to_date')).toBe('2026-09-30');
    expect(request.request.headers.has('X-API-Key')).toBe(true);
    request.flush(JSON.stringify({
      data: [
        { date: '2026-09-01', hours_worked: '8h 30m' },
        { attendance_date: '2026-09-02T00:00:00', hours_worked: 9 },
      ],
    }));

    expect(dailyHours).toEqual([
      { date: '2026-09-01', hoursWorked: '8h 30m' },
      { date: '2026-09-02', hoursWorked: '9' },
    ]);
  });

  it('loads punch in and punch out for one employee and calendar date', () => {
    const employee: ApplicationFormRecord = {
      EmployeeCode: 'EMP-00000007',
      EmployeeName: 'Test Employee',
      ExtEmpNo: '00001161',
      Department: '',
      EmployeeNature: '',
      Designation: '',
      ReportingManager: '',
      EmploymentType: '',
      EmploymentStatus: '',
      EmploymentCategory: '',
      status: 'Active',
    };
    let result: AttendanceDailyRecord | null = null;

    service.fetchDailyAttendance(employee, '2026-10-16').subscribe((record) => {
      result = record;
    });

    const request = httpMock.expectOne((req) => req.urlWithParams.includes('card_no=00001161'));
    const requestParams = new URL(request.request.urlWithParams).searchParams;
    expect(requestParams.get('from_date')).toBe('2026-10-16');
    expect(requestParams.get('to_date')).toBe('2026-10-16');
    request.flush(JSON.stringify({
      data: [{
        card_no: '00001161',
        date: '2026-10-16',
        punch_in: '09:00:00',
        punch_out: '17:15:00',
        hours_worked: '8h 15m',
      }],
    }));

    expect(result?.PunchIn).toBe('2026-10-16T09:00:00');
    expect(result?.PunchOut).toBe('2026-10-16T17:15:00');
    expect(result?.WorkingHours).toBe('8h 15m');
  });

  it('indexes monthly punches by employee code and date for roster absence checks', () => {
    const employee: ApplicationFormRecord = {
      EmployeeCode: 'EMP-00000007',
      EmployeeName: 'Test Employee',
      ExtEmpNo: '00001161',
      Department: '',
      EmployeeNature: '',
      Designation: '',
      ReportingManager: '',
      EmploymentType: '',
      EmploymentStatus: '',
      EmploymentCategory: '',
      status: 'Active',
    };
    let attendance = new Map<string, AttendanceDailyRecord>();

    service.fetchRosterAttendance([employee], '2026-10-01', '2026-10-31').subscribe((result) => {
      attendance = result;
    });

    const request = httpMock.expectOne((req) => req.urlWithParams.includes('from_date=2026-10-01'));
    const requestParams = new URL(request.request.urlWithParams).searchParams;
    expect(requestParams.get('to_date')).toBe('2026-10-31');
    request.flush(JSON.stringify({
      data: [{
        card_no: '00001161',
        date: '2026-10-16',
        punch_in: '09:00:00',
        punch_out: '17:15:00',
      }],
    }));

    expect(attendance.get('emp-00000007|2026-10-16')?.PunchIn).toBe('2026-10-16T09:00:00');
    expect(attendance.get('emp-00000007|2026-10-16')?.PunchOut).toBe('2026-10-16T17:15:00');
    expect(attendance.has('emp-00000007|2026-10-17')).toBe(false);
  });

  it('loads year-to-date roster attendance for only the selected employee', () => {
    const employee: ApplicationFormRecord = {
      EmployeeCode: 'EMP-00000007',
      EmployeeName: 'Test Employee',
      ExtEmpNo: '00001161',
      Department: '',
      EmployeeNature: '',
      Designation: '',
      ReportingManager: '',
      EmploymentType: '',
      EmploymentStatus: '',
      EmploymentCategory: '',
      status: 'Active',
    };
    let attendance = new Map<string, AttendanceDailyRecord>();

    service.fetchEmployeeRosterAttendance(employee, '2026-01-01', '2026-10-16').subscribe((result) => {
      attendance = result;
    });

    const request = httpMock.expectOne((req) => req.urlWithParams.includes('card_no=00001161'));
    const requestParams = new URL(request.request.urlWithParams).searchParams;
    expect(requestParams.get('from_date')).toBe('2026-01-01');
    expect(requestParams.get('to_date')).toBe('2026-10-16');
    request.flush(JSON.stringify({
      data: [{
        card_no: '00001161',
        date: '2026-06-01',
        punch_in: '09:00:00',
        punch_out: '17:00:00',
      }],
    }));

    expect(attendance.get('emp-00000007|2026-06-01')?.PunchIn).toBe('2026-06-01T09:00:00');
    expect(attendance.has('emp-00000007|2026-06-02')).toBe(false);
  });

  it('resolves the user ID to the padded legacy card number for calculated range punches', () => {
    let loaded = false;
    employeeRecords = [{
      EmployeeCode: '00000007',
      EmployeeName: 'Test Employee',
      ExtEmpNo: '00001161',
      Department: '',
      EmployeeNature: '',
      Designation: '',
      ReportingManager: '',
      EmploymentType: '',
      EmploymentStatus: '',
      EmploymentCategory: '',
      status: 'Active',
      userId: '00000007',
    }];
    service.loadSession({
      mode: 'dateRange',
      userId: '00000007',
      fromDate: '2026-09-01',
      toDate: '2026-10-30',
    }).subscribe(() => (loaded = true));

    const request = httpMock.expectOne((req) => req.url.endsWith('/rawpunch'));
    expect(request.request.params.get('from_date')).toBe('2026-09-01');
    expect(request.request.params.get('to_date')).toBe('2026-10-30');
    expect(request.request.params.get('type')).toBe('calculated');
    expect(request.request.params.get('card_no')).toBe('00001161');
    request.flush(JSON.stringify({
      data: [
        {
          card_no: '00001161',
          punch_in: '2026-09-01T09:06:48.000Z',
          punch_out: '2026-09-01T17:37:31.000Z',
          hours_worked: '8h 45m',
        },
      ],
    }));

    const [slot] = service.slots();
    const [record] = service.materializeSlots([slot]);
    expect(loaded).toBe(true);
    expect(slot.date).toBe('2026-09-01');
    expect(record.PunchIn).toBe('2026-09-01T09:06:48.000Z');
    expect(record.PunchOut).toBe('2026-09-01T17:37:31.000Z');
    expect(record.PunchCount).toBe(2);
    expect(record.WorkingHours).toBe('8h 45m');
    expect(record.WorkingMinutes).toBe(525);
  });

  it('fetches all employees for a calculated date range when no user ID is provided', () => {
    let loaded = false;
    service.loadSession({
      mode: 'dateRange',
      fromDate: '2026-09-01',
      toDate: '2026-10-31',
    }).subscribe(() => (loaded = true));

    const request = httpMock.expectOne((req) => req.url.endsWith('/rawpunch'));
    expect(request.request.params.get('from_date')).toBe('2026-09-01');
    expect(request.request.params.get('to_date')).toBe('2026-10-31');
    expect(request.request.params.get('type')).toBe('calculated');
    expect(request.request.params.has('card_no')).toBe(false);
    request.flush(JSON.stringify({
      data: [
        {
          card_no: '00001161',
          punch_in: '2026-09-01T09:06:48.000Z',
          punch_out: '2026-09-01T17:37:31.000Z',
          hours_worked: '8h 45m',
        },
        {
          card_no: '00002345',
          punch_in: '2026-09-01T08:00:00.000Z',
          punch_out: '2026-09-01T16:30:00.000Z',
          hours_worked: '8h 30m',
        },
      ],
    }));

    expect(loaded).toBe(true);
    expect(service.slots().map((slot) => slot.displayId)).toContain('00001161');
    expect(service.slots().map((slot) => slot.displayId)).toContain('00002345');
    expect(service.slots().every((slot) => slot.date === '2026-09-01')).toBe(true);
  });

  it('uses the calculated hours_worked value even when it differs from the punch-time difference', () => {
    service.loadSession({ mode: 'date', userId: '00000007', date: '2026-09-01' }).subscribe();
    const request = httpMock.expectOne((req) => req.url.endsWith('/rawpunch'));
    request.flush(JSON.stringify({
      data: [{
        card_no: '00001161',
        punch_in: '2026-09-01T09:00:00',
        punch_out: '2026-09-01T17:00:00',
        hours_worked: '7h 30m',
      }],
    }));

    const [slot] = service.slots();
    const [record] = service.materializeSlots([slot]);
    expect(record.WorkingHours).toBe('7h 30m');
    expect(record.WorkingMinutes).toBe(450);
  });

  it('parses API working-hours values for date-range totals', () => {
    expect(parseWorkingDurationMinutes('12h 33m')).toBe(753);
    expect(parseWorkingDurationMinutes('9')).toBe(540);
    expect(parseWorkingDurationMinutes('')).toBeNull();
  });

  it('formats punch times in 12-hour clock with AM/PM', () => {
    expect(formatPunchTime('2026-09-29T14:30:00')).toBe('2:30 PM');
    expect(formatPunchTime('2026-09-29T00:05:00')).toBe('12:05 AM');
  });
});