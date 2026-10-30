import '@angular/compiler';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { of } from 'rxjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationFormDetail, ApplicationFormRecord, ApplicationFormService } from './application-form.service';
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
    const requestParams = new URL(request.request.urlWithParams).searchParams;
    expect(requestParams.get('from_date')).toBe('2026-09-29');
    expect(requestParams.get('to_date')).toBe('2026-09-29');
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
    const requestParams = new URL(request.request.urlWithParams).searchParams;
    expect(requestParams.get('from_date')).toBe('2026-09-01');
    expect(requestParams.get('to_date')).toBe('2026-09-30');
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

    const request = httpMock.expectOne((req) => req.url.includes('/api/attendance-raw-punch-list'));
    const requestParams = new URL(request.request.urlWithParams).searchParams;
    expect(requestParams.get('date')).toBe('2026-10-16');
    expect(requestParams.get('card_no')).toBe('00001161');
    expect(requestParams.get('per_page')).toBe('100');
    expect(requestParams.get('page')).toBe('1');
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

  it('loads every page from the attendance list API', () => {
    let loaded = false;
    service.loadSession({ mode: 'date', date: '2026-10-16' }).subscribe(() => {
      loaded = true;
    });

    const firstPage = httpMock.expectOne((req) => req.url.includes('/api/attendance-raw-punch-list'));
    const firstParams = new URL(firstPage.request.urlWithParams).searchParams;
    expect(firstParams.get('date')).toBe('2026-10-16');
    expect(firstParams.get('per_page')).toBe('100');
    expect(firstParams.get('page')).toBe('1');
    firstPage.flush(JSON.stringify({
      current_page: 1,
      last_page: 2,
      data: [{
        id: 'attendance-1',
        card_no: '00000001',
        date: '2026-10-16',
        punch_in: '09:00:00',
        punch_out: '17:00:00',
      }],
    }));

    const secondPage = httpMock.expectOne((req) => req.url.includes('/api/attendance-raw-punch-list'));
    expect(new URL(secondPage.request.urlWithParams).searchParams.get('page')).toBe('2');
    secondPage.flush(JSON.stringify({
      current_page: 2,
      last_page: 2,
      data: [{
        card_no: '00000002',
        date: '2026-10-16',
        punch_in: '08:00:00',
        punch_out: '16:00:00',
      }],
    }));

    expect(loaded).toBe(true);
    expect(service.slots()).toHaveLength(2);
    expect(service.materializeSlots([service.slots()[0]])[0].Punches[0].RecordId).toBe('attendance-1');
  });

  it('updates an attendance record using its API ID and the supplied payload', () => {
    const payload = {
      card_no: '00000003',
      punch_in: '2026-10-28 09:00:00',
      punch_out: '2026-10-28 17:30:00',
      hours_worked: '8h 30m',
      machine_id: '3',
      status: '01',
      attendance_date: '2026-10-28 17:30:00',
    };
    let updated = false;

    service.updateAttendanceRecord(payload.card_no, payload).subscribe(() => {
      updated = true;
    });

    const request = httpMock.expectOne(
      'http://alhafiz.vdc.services:8084/ahcp/public/api/attendance-raw-punch-update/00000003',
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(payload);
    request.flush({ message: 'updated' });
    expect(updated).toBe(true);
  });

  it('keeps the employee card number on generated absent attendance slots', () => {
    employeeRecords = [{
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
    }];
    service.loadSession({ mode: 'date', date: '2026-10-28' }).subscribe();

    const request = httpMock.expectOne((req) => req.url.includes('/api/attendance-raw-punch-list'));
    request.flush(JSON.stringify({ data: [] }));

    const [slot] = service.slots();
    const [record] = service.materializeSlots([slot]);
    expect(slot.status).toBe('Absent');
    expect(record.CardNo).toBe('00001161');
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

  it('assigns card punches to the employee legacy code when it collides with another employee ID', () => {
    const sakhi: ApplicationFormRecord = {
      EmployeeCode: '00000076',
      EmployeeName: 'Sakhi Marjan',
      Department: '',
      EmployeeNature: '',
      Designation: '',
      ReportingManager: '',
      EmploymentType: '',
      EmploymentStatus: '',
      EmploymentCategory: '',
      status: 'Active',
      userId: '00000076',
    };
    const inam: ApplicationFormRecord = {
      EmployeeCode: 'EMP-00000179',
      EmployeeName: 'Inam Ullah',
      Department: '',
      EmployeeNature: '',
      Designation: '',
      ReportingManager: '',
      EmploymentType: '',
      EmploymentStatus: '',
      EmploymentCategory: '',
      status: 'Active',
      userId: '00000179',
      detail: {
        loginDetails: { legacyCode: '00000076' },
      } as ApplicationFormDetail,
    };
    let attendance = new Map<string, AttendanceDailyRecord>();

    service.fetchRosterAttendance([sakhi, inam], '2026-09-01', '2026-09-30').subscribe((result) => {
      attendance = result;
    });

    const request = httpMock.expectOne((req) => req.url.includes('/api/attendance-raw-punch-list'));
    request.flush(JSON.stringify({
      data: [{
        card_no: '00000076',
        punch_in: '2026-08-24T20:16:12.000Z',
        punch_out: '2026-08-24T05:50:10.000Z',
        hours_worked: '16h 34m',
      }],
    }));

    const inamAttendance = attendance.get('emp-00000179|2026-08-24');
    expect(inamAttendance?.Punches.map((punch) => punch.PunchDatetime)).toEqual([
      '2026-08-24T05:50:10.000Z',
      '2026-08-24T20:16:12.000Z',
    ]);
    expect(inamAttendance?.PunchIn).toBe('2026-08-24T20:16:12.000Z');
    expect(inamAttendance?.PunchOut).toBe('2026-08-24T05:50:10.000Z');
    expect(formatPunchTime(inamAttendance?.PunchIn ?? '')).toBe('8:16:12 PM');
    expect(formatPunchTime(inamAttendance?.PunchOut ?? '')).toBe('5:50:10 AM');
    expect(inamAttendance?.AttendanceStatus).toBe('Present');
    expect(inamAttendance?.PunchIn).toBeTruthy();
    expect(inamAttendance?.PunchOut).toBeTruthy();
    expect(attendance.has('00000076|2026-08-24')).toBe(false);
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

  it('resolves the user ID to the padded legacy card number for date-range punches', () => {
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

    const request = httpMock.expectOne((req) => req.url.includes('/api/attendance-raw-punch-list'));
    const requestParams = new URL(request.request.urlWithParams).searchParams;
    expect(requestParams.get('from_date')).toBe('2026-09-01');
    expect(requestParams.get('to_date')).toBe('2026-10-30');
    expect(requestParams.get('card_no')).toBe('00001161');
    expect(requestParams.get('per_page')).toBe('100');
    expect(requestParams.get('page')).toBe('1');
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

  it('loads date-range punches by card number when searching by employee code', () => {
    employeeRecords = [{
      EmployeeCode: '00000076',
      EmployeeName: 'Sakhi Marjan',
      apiId: '00000076',
      Department: '',
      EmployeeNature: '',
      Designation: '',
      ReportingManager: '',
      EmploymentType: '',
      EmploymentStatus: '',
      EmploymentCategory: '',
      status: 'Active',
      userId: '00000076',
    }, {
      EmployeeCode: 'EMP-00000179',
      EmployeeName: 'Inam Ullah',
      apiId: '00000179',
      Department: '',
      EmployeeNature: '',
      Designation: '',
      ReportingManager: '',
      EmploymentType: '',
      EmploymentStatus: '',
      EmploymentCategory: '',
      status: 'Active',
      userId: '00000179',
      detail: {
        loginDetails: { legacyCode: '00000076' },
      } as ApplicationFormDetail,
    }];

    service.loadSession({
      mode: 'dateRange',
      userId: '179',
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
    }).subscribe();

    const request = httpMock.expectOne((req) => req.url.includes('/api/attendance-raw-punch-list'));
    const requestParams = new URL(request.request.urlWithParams).searchParams;
    expect(requestParams.get('card_no')).toBe('00000076');
    request.flush(JSON.stringify({
      success: true,
      type: 'calculated',
      total: 1,
      data: [{
        id: '00003',
        card_no: '00000076',
        punch_in: '2026-09-10T18:57:44.000Z',
        punch_out: null,
        hours_worked: null,
        machine_id: '3',
        status: '01',
      }],
    }));

    const slot = service.slots().find((item) => item.date === '2026-09-10');
    expect(service.slots()).toHaveLength(30);
    expect(slot).toMatchObject({
      date: '2026-09-10',
      displayId: 'Emp-00000179',
      employeeName: 'Inam Ullah',
      punchIn: '2026-09-10T18:57:44.000Z',
      punchOut: '',
      status: 'Present',
    });
  });

  it('prefers the profile User ID over another employee code and displays EmployeeCode instead of apiId', () => {
    employeeRecords = [{
      EmployeeCode: 'Emp-00000115',
      EmployeeName: 'Different Employee',
      apiId: '401',
      Department: '',
      EmployeeNature: '',
      Designation: '',
      ReportingManager: '',
      EmploymentType: '',
      EmploymentStatus: '',
      EmploymentCategory: '',
      status: 'Active',
      userId: '401',
    }, {
      EmployeeCode: 'Emp-00003300',
      EmployeeName: 'Sayed Awais Bilal Bukhari',
      apiId: '293',
      Department: '',
      EmployeeNature: '',
      Designation: '',
      ReportingManager: '',
      EmploymentType: '',
      EmploymentStatus: '',
      EmploymentCategory: '',
      status: 'Active',
      userId: '115',
    }];

    service.loadSession({
      mode: 'dateRange',
      userId: 'Emp-00000115',
      fromDate: '2026-09-01',
      toDate: '2026-09-01',
    }).subscribe();

    const request = httpMock.expectOne((req) => req.url.includes('/api/attendance-raw-punch-list'));
    const requestParams = new URL(request.request.urlWithParams).searchParams;
    expect(requestParams.get('card_no')).toBe('00000115');
    request.flush(JSON.stringify({ data: [] }));

    expect(service.slots()).toHaveLength(1);
    expect(service.slots()[0]).toMatchObject({
      displayId: 'Emp-00003300',
      employeeName: 'Sayed Awais Bilal Bukhari',
      status: 'Absent',
    });
  });

  it('groups filtered punches by employee when the API returns login and card IDs', () => {
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
      toDate: '2026-09-30',
    }).subscribe();

    const request = httpMock.expectOne((req) => req.url.includes('/api/attendance-raw-punch-list'));
    expect(new URL(request.request.urlWithParams).searchParams.get('card_no')).toBe('00001161');
    request.flush(JSON.stringify({
      data: [
        {
          card_no: '00001161',
          punch_in: '2026-09-01T09:00:00',
          punch_out: '2026-09-01T17:00:00',
        },
        {
          card_no: '00000007',
          punch_in: '2026-09-01T09:00:00',
          punch_out: '2026-09-01T17:00:00',
        },
      ],
    }));

    expect(service.slots()).toHaveLength(1);
    expect(service.slots()[0].employeeName).toBe('Test Employee');
    expect(service.slots()[0].punchCount).toBe(4);
  });

  it('fetches all employees for a date range when no user ID is provided', () => {
    let loaded = false;
    service.loadSession({
      mode: 'dateRange',
      fromDate: '2026-09-01',
      toDate: '2026-10-31',
    }).subscribe(() => (loaded = true));

    const request = httpMock.expectOne((req) => req.url.includes('/api/attendance-raw-punch-list'));
    const requestParams = new URL(request.request.urlWithParams).searchParams;
    expect(requestParams.get('from_date')).toBe('2026-09-01');
    expect(requestParams.get('to_date')).toBe('2026-10-31');
    expect(requestParams.get('per_page')).toBe('100');
    expect(requestParams.get('page')).toBe('1');
    expect(requestParams.has('card_no')).toBe(false);
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
    const request = httpMock.expectOne((req) => req.url.includes('/api/attendance-raw-punch-list'));
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