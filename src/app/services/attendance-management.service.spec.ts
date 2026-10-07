import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApplicationFormService } from './application-form.service';
import {
  AttendanceManagementService,
  formatPunchTime,
} from './attendance-management.service';

describe('AttendanceManagementService calculated working hours', () => {
  let service: AttendanceManagementService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AttendanceManagementService,
        { provide: ApplicationFormService, useValue: {} },
      ],
    });
    service = TestBed.inject(AttendanceManagementService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the employee by padded card number and returns hours_worked', () => {
    let hours: string | null = null;
    service.fetchCalculatedWorkingHours(
      { mode: 'date', date: '2026-09-29' },
      '4023',
    ).subscribe((value) => (hours = value));

    const request = httpMock.expectOne((req) => req.urlWithParams.includes('card_no=00004023'));
    expect(request.request.params.get('from_date')).toBe('2026-09-29');
    expect(request.request.params.get('to_date')).toBe('2026-09-29');
    expect(request.request.headers.has('X-API-Key')).toBeTrue();
    request.flush(JSON.stringify({ data: [{ hours_worked: '6h 16m' }] }));

    expect(hours).toBe('6h 16m');
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
    expect(request.request.headers.has('X-API-Key')).toBeTrue();
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

  it('formats punch times in 12-hour clock with AM/PM', () => {
    expect(formatPunchTime('2026-09-29T14:30:00')).toBe('2:30 PM');
    expect(formatPunchTime('2026-09-29T00:05:00')).toBe('12:05 AM');
  });
});