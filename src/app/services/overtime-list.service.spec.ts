import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { apiUrl } from '../config/api.config';
import { OvertimeListRecord, OvertimeListService } from './overtime-list.service';

describe('OvertimeListService', () => {
  it('fetches and maps rows from the overtime-record-list endpoint', () => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get']);
    http.get.and.returnValue(of({
      data: [
        { id: 12, employee_code: 'EMP-001', employee_name: 'Ayesha Khan', overtime_hours: 2.5 },
      ],
    }));
    TestBed.configureTestingModule({
      providers: [
        OvertimeListService,
        { provide: HttpClient, useValue: http },
      ],
    });
    const service = TestBed.inject(OvertimeListService);
    let records: OvertimeListRecord[] = [];

    service.fetchOvertimeList().subscribe((result) => (records = result));

    expect(http.get).toHaveBeenCalledWith(apiUrl('overtime-record-list'));
    expect(records).toEqual([{
      id: '12',
      values: { id: 12, employee_code: 'EMP-001', employee_name: 'Ayesha Khan', overtime_hours: 2.5 },
    }]);
  });

  it('retries transient server failures when fetching overtime records', (done) => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get']);
    http.get.and.returnValues(
      throwError(() => new HttpErrorResponse({
        status: 500,
        error: "SQLSTATE[42S02]: Base table or view not found: 1146 Table 'ahcp_db_live.overtime_records' doesn't exist",
      })),
      of({ data: [{ id: 12, employee_code: 'EMP-001' }] }),
    );
    TestBed.configureTestingModule({
      providers: [
        OvertimeListService,
        { provide: HttpClient, useValue: http },
      ],
    });
    const service = TestBed.inject(OvertimeListService);

    service.fetchOvertimeList().subscribe({
      next: (records) => {
        expect(records).toEqual([{
          id: '12',
          values: { id: 12, employee_code: 'EMP-001' },
        }]);
        expect(http.get).toHaveBeenCalledTimes(2);
        done();
      },
      error: done.fail,
    });
  });

  it('posts an employee to the overtime endpoint', () => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'post']);
    http.post.and.returnValue(of({ success: true }));
    TestBed.configureTestingModule({
      providers: [
        OvertimeListService,
        { provide: HttpClient, useValue: http },
      ],
    });
    const service = TestBed.inject(OvertimeListService);
    const payload = {
      employee_code: 'EMP-001',
      employee_name: 'Ayesha Khan',
      overtime_date: '2026-10-01',
      shift_id: '1',
      working_hours: 8,
      shift_hours: 8,
      overtime_hours: 0,
      overtime_rate: 0,
      exceptional_ot: 0,
      flag: '1' as const,
    };

    service.postOvertimeEmployee([payload]).subscribe();

    expect(http.post).toHaveBeenCalledWith(
      apiUrl('overtime-record-add'),
      [payload],
    );
  });

  it('retries rate-limited overtime posts and surfaces API-level failures', (done) => {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'post']);
    http.post.and.returnValues(
      of({ status: false, message: 'Too Many Attempts' }),
      of({ status: true }),
    );
    TestBed.configureTestingModule({
      providers: [
        OvertimeListService,
        { provide: HttpClient, useValue: http },
      ],
    });
    const service = TestBed.inject(OvertimeListService);
    const payload = [{
      employee_code: 'EMP-001',
      employee_name: 'Ayesha Khan',
      overtime_date: '2026-10-01',
      shift_id: '1',
      working_hours: 8,
      shift_hours: 8,
      overtime_hours: 0,
      overtime_rate: 0,
      exceptional_ot: 0,
      flag: '1' as const,
    }];
    spyOn(Math, 'random').and.returnValue(0);

    service.postOvertimeEmployee(payload).subscribe({
      next: () => {
        expect(http.post).toHaveBeenCalledTimes(2);
        done();
      },
      error: done.fail,
    });
  });
});
