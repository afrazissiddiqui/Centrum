import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiUrl } from '../config/api.config';
import {
  EmployeeShiftAllocationRecord,
  EmployeeShiftAllocationService,
} from './employee-shift-allocation.service';

describe('EmployeeShiftAllocationService', () => {
  let service: EmployeeShiftAllocationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        EmployeeShiftAllocationService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(EmployeeShiftAllocationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads each shift detail and maps its scheduled start and end times', () => {
    let allocations: EmployeeShiftAllocationRecord[] | undefined;
    service.fetchShiftAllocations().subscribe((records) => {
      allocations = records;
    });

    httpMock.expectOne(apiUrl('employee-shift-allocation-list')).flush([
      { id: 1 },
      { id: 2 },
    ]);
    httpMock.expectOne(apiUrl('employee-shift-allocation-detail/1')).flush({
      data: {
        id: 1,
        shift_name: 'Morning',
        office_in_time: '09:00',
        office_out_time: '17:30',
      },
    });
    httpMock.expectOne(apiUrl('employee-shift-allocation-detail/2')).flush({
      id: 2,
      name: 'Evening',
      start_time: '10:00',
      end_time: '18:00',
    });

    expect(allocations).toEqual([
      {
        id: '1',
        shift: 'Morning',
        name: 'Morning',
        code: '',
        startTime: '09:00',
        endTime: '17:30',
      },
      {
        id: '2',
        shift: 'Evening',
        name: 'Evening',
        code: '',
        startTime: '10:00',
        endTime: '18:00',
      },
    ]);
  });
});
