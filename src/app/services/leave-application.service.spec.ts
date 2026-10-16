import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LeaveApplicationAddPayload, LeaveApplicationService } from './leave-application.service';

describe('LeaveApplicationService', () => {
  let service: LeaveApplicationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [LeaveApplicationService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(LeaveApplicationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts an Unannounced Leave application with the leave application API payload shape', () => {
    const payload: LeaveApplicationAddPayload = {
      headerInfo: {
        formNumber: 'LR-2026-0015',
        employeeId: 'EMP-1001',
        employeeName: 'Muhammad Umer',
        employeeCategory: 'Permanent',
        employmentNature: 'Full Time',
        employmentType: 'Monthly',
        workGradeLevel: 'G7',
        department: 'Information Technology',
        jobTitle: 'Software Developer',
        location: 'Lahore',
      },
      leaveRequest: {
        requestDate: '2026-05-25',
        leaveType: 'Unannounced Leave',
        causeOfLeave: 'Unannounced absence',
        fromDate: '2026-06-01',
        toDate: '2026-06-05',
        totalLeaveDaysRequested: 5,
        requestStatus: 'Submitted',
        remarks: 'Automatically generated from unannounced absence recorded in Employee Roster.',
      },
      leaveBalanceInformation: {
        totalLeaves: 30,
        leavesAvailed: 12,
        remainingLeaves: 18,
      },
    };

    service.addLeaveApplication(payload).subscribe();

    const request = httpMock.expectOne((req) => req.url.endsWith('/leave-application-add'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({ status: true });
  });

  it('maps the wrapped detail response data envelope for the modal view', () => {
    service.fetchLeaveApplicationDetail(1).subscribe((record) => {
      expect(record.Id).toBe(1);
      expect(record.EmployeeName).toBe('Molana Hitler');
      expect(record.LeaveType).toBe('Sick');
      expect(record.RequestStatus).toBe('Submitted');
      expect(record.HeaderInfo.formNumber).toBe('LR-2026-8270');
      expect(record.LeaveRequest.totalLeaveDaysRequested).toBe(1);
    });

    const req = httpMock.expectOne((request) => request.url.includes('leave-application-detail/1'));
    req.flush({
      status: true,
      message: 'Leave application retrieved successfully',
      data: {
        id: 1,
        form_number: 'LR-2026-8270',
        employee_id: 'Emp-00003321',
        employee_name: 'Molana Hitler',
        employee_category: 'Executive',
        employment_nature: '#N/A',
        employment_type: 'Technical',
        work_grade_level: 'WL 2A',
        department: 'Quality Control',
        job_title: 'kill',
        location: '1',
        request_date: '2026-07-14T00:00:00.000000Z',
        leave_type: 'Sick',
        cause_of_leave: 'Sick',
        from_date: '2026-07-14T00:00:00.000000Z',
        to_date: '2026-07-14T00:00:00.000000Z',
        total_leave_days_requested: 1,
        request_status: 'Submitted',
        remarks: null,
        total_leaves: 12,
        leaves_availed: 10,
        remaining_leaves: 2,
      },
    });
  });
});
