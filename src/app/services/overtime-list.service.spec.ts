import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
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
});
