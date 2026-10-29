// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  LeaveApplicationAddPayload,
  LeaveApplicationRecord,
  LeaveApplicationService,
} from './leave-application.service';
import { AuthService } from './auth.service';

describe('LeaveApplicationService', () => {
  let service: LeaveApplicationService;
  let httpMock: HttpTestingController;

  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        LeaveApplicationService,
        { provide: AuthService, useValue: { getSessionUser: () => null } },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(LeaveApplicationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  afterAll(() => {
    TestBed.resetTestEnvironment();
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

  it('surfaces API-level failures returned with a successful HTTP response', () => {
    let submissionError: unknown;
    service.addLeaveApplication({
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
        toDate: '2026-06-01',
        totalLeaveDaysRequested: 1,
        requestStatus: 'Submitted',
        remarks: 'Automatically generated from unannounced absence recorded in Employee Roster.',
      },
      leaveBalanceInformation: {
        totalLeaves: 0,
        leavesAvailed: 1,
        remainingLeaves: -1,
      },
    }).subscribe({ error: (error: unknown) => submissionError = error });

    const request = httpMock.expectOne((req) => req.url.endsWith('/leave-application-add'));
    request.flush({ status: false, message: 'Duplicate leave request.' });

    expect(submissionError).toEqual(new Error('Duplicate leave request.'));
  });

  it('loads the employee-scoped leave records without branch or response-id filtering', () => {
    let records: LeaveApplicationRecord[] | undefined;
    service.fetchLeaveApplicationsForEmployee('Emp-00000011', '2026-10-01', '2026-10-30').subscribe((result) => {
      records = result;
    });

    const request = httpMock.expectOne((req) =>
      req.url.endsWith('/leave-application-list') &&
      req.params.get('search') === 'Emp-00000011' &&
      req.params.get('from_date') === '2026-10-01' &&
      req.params.get('to_date') === '2026-10-30',
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      status: true,
      message: 'Leave Application List',
      data: [
        {
          id: 2501,
          employee_id: 'Emp-00000011',
          employee_name: 'Manzoor Ahmad',
          location: '02',
          leave_type: 'Special',
          from_date: '01/10/2026',
          to_date: '2026-10-10T00:00:00.000000Z',
          request_status: 'Submitted',
        },
        {
          id: 2502,
          employee_id: 'Emp-00000012',
          employee_name: 'Another employee',
          location: '02',
          leave_type: 'Annual',
          from_date: '2026-10-01',
          to_date: '2026-10-02',
          request_status: 'Submitted',
        },
      ],
    });

    expect(records?.length).toBe(2);
    expect(records?.[0].EmployeeId).toBe('Emp-00000011');
    expect(records?.[0].EmployeeName).toBe('Manzoor Ahmad');
    expect(records?.[0].LeaveType).toBe('Special');
    expect(records?.[0].FromDate).toBe('01/10/2026');
    expect(records?.[0].ToDate).toBe('2026-10-10T00:00:00.000000Z');
    expect(records?.[0].RequestStatus).toBe('Submitted');
  });

  it('surfaces API-level leave list failures instead of treating them as empty results', () => {
    let requestError: unknown;
    service
      .fetchLeaveApplicationsForEmployee('Emp-00000011', '2026-10-01', '2026-10-31')
      .subscribe({ error: (error: unknown) => (requestError = error) });

    const request = httpMock.expectOne((req) => req.url.endsWith('/leave-application-list'));
    request.flush({ status: false, message: 'Too Many Attempts', data: [] });

    expect(requestError).toEqual(new Error('Too Many Attempts'));
  });

  it('supports filtering employee leave requests by leave type', () => {
    let records: LeaveApplicationRecord[] | undefined;
    service
      .fetchLeaveApplicationsForEmployee('Emp-00000060', '2026-10-01', '2026-10-29', 'Unannounced Leave')
      .subscribe((result) => {
        records = result;
      });

    const request = httpMock.expectOne((req) =>
      req.url.endsWith('/leave-application-list') &&
      req.params.get('search') === 'Emp-00000060' &&
      req.params.get('from_date') === '2026-10-01' &&
      req.params.get('to_date') === '2026-10-29' &&
      req.params.get('leave_type') === 'Unannounced Leave',
    );
    expect(request.request.method).toBe('GET');
    request.flush({ status: true, data: [] });

    expect(records).toEqual([]);
  });

  it('loads leave applications for a date range without per-employee requests', () => {
    let records: LeaveApplicationRecord[] | undefined;
    service.fetchLeaveApplicationsForDateRange('2026-10-01', '2026-10-31').subscribe((result) => {
      records = result;
    });

    const request = httpMock.expectOne((req) =>
      req.url.endsWith('/leave-application-list') &&
      req.params.get('from_date') === '2026-10-01' &&
      req.params.get('to_date') === '2026-10-31' &&
      !req.params.has('search'),
    );
    request.flush({
      status: true,
      data: [{
        id: 2501,
        employee_id: 'Emp-00000011',
        leave_type: 'Unannounced Leave',
        from_date: '2026-10-05',
        to_date: '2026-10-06',
      }],
    });

    expect(records).toHaveLength(1);
    expect(records?.[0]).toMatchObject({
      EmployeeId: 'Emp-00000011',
      LeaveType: 'Unannounced Leave',
    });
  });

  it('maps employee_code from leave list responses so searched requests are retained', () => {
    let records: LeaveApplicationRecord[] | undefined;
    service.fetchLeaveApplicationsForEmployee('Emp-00000011', '2026-10-01', '2026-10-30').subscribe((result) => {
      records = result;
    });

    const request = httpMock.expectOne((req) => req.url.endsWith('/leave-application-list'));
    request.flush({
      status: true,
      data: [
        {
          id: 2501,
          employee_code: 'Emp-00000011',
          employee_name: 'Manzoor Ahmad',
          leave_type: 'Special',
          from_date: '2026-10-01',
          to_date: '2026-10-10',
          request_status: 'Submitted',
        },
      ],
    });

    expect(records).toHaveLength(1);
    expect(records?.[0]).toMatchObject({
      EmployeeId: 'Emp-00000011',
      LeaveType: 'Special',
      FromDate: '2026-10-01',
      ToDate: '2026-10-10',
      RequestStatus: 'Submitted',
    });
  });

  it('keeps employee-scoped API results when the response omits the employee code', () => {
    let records: LeaveApplicationRecord[] | undefined;
    service.fetchLeaveApplicationsForEmployee('Emp-00000011', '2026-10-01', '2026-10-30').subscribe((result) => {
      records = result;
    });

    const request = httpMock.expectOne((req) => req.url.endsWith('/leave-application-list'));
    request.flush({
      status: true,
      data: {
        leave_application_list: [{
          id: 2502,
          leave_type: 'Annual',
          from_date: '2026-10-12',
          to_date: '2026-10-14',
          request_status: 'Submitted',
        }],
      },
    });

    expect(records).toHaveLength(1);
    expect(records?.[0].EmployeeId).toBe('—');
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
