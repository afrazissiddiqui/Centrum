import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationFormService } from './application-form.service';

describe('ApplicationFormService', () => {
  let service: ApplicationFormService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApplicationFormService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApplicationFormService);
  });

  it('continues from the intended sequence when the list includes a later outlier cluster', () => {
    (service as any).applicationRecords.set([
      { EmployeeCode: 'Emp-00000254' },
      { EmployeeCode: 'Emp-00003312' },
      { EmployeeCode: 'Emp-00003313' },
      { EmployeeCode: 'Emp-00003314' },
    ]);

    expect(service.getNextEmployeeCode()).toBe(255);
  });

  it('normalizes the legacy employee code to the required format', () => {
    expect(service.normalizeEmployeeCodeValue('Emp-00003283')).toBe('Emp-00000254');
  });

  it('remaps the outlier employee codes to the intended sequence', () => {
    expect(service.normalizeEmployeeCodeValue('Emp-00003312')).toBe('Emp-00000255');
    expect(service.normalizeEmployeeCodeValue('Emp-00003313')).toBe('Emp-00000256');
    expect(service.normalizeEmployeeCodeValue('Emp-00003314')).toBe('Emp-00000257');
  });

  it('resolves a unique one-word login name to the matching full employee name', () => {
    (service as any).applicationRecords.set([
      {
        EmployeeCode: 'Emp-00000011',
        EmployeeName: 'Manzoor Ahmad',
        detail: {
          personalInfo: { personName: 'Manzoor Ahmad' },
          loginDetails: { employeeName: 'Manzoor Ahmad', userId: '00000011' },
        },
      },
      {
        EmployeeCode: 'Emp-00000012',
        EmployeeName: 'Ayesha Khan',
        detail: {
          personalInfo: { personName: 'Ayesha Khan' },
          loginDetails: { employeeName: 'Ayesha Khan', userId: '00000012' },
        },
      },
    ]);

    expect(service.getSignedInUserRecord('portal-user-42', 'manzoor')?.EmployeeCode)
      .toBe('Emp-00000011');
  });

  it('does not resolve an ambiguous one-word login name to another employee', () => {
    (service as any).applicationRecords.set([
      { EmployeeCode: 'Emp-00000011', EmployeeName: 'Manzoor Ahmad' },
      { EmployeeCode: 'Emp-00000012', EmployeeName: 'Manzoor Ali' },
    ]);

    expect(service.getSignedInUserRecord('portal-user-42', 'manzoor')).toBeUndefined();
  });

  it('loads Cost Center from nested remuneration data for profile updates', () => {
    const record = (service as any).mapApiItemToFullRecord({
      id: 7,
      employeeCode: 'Emp-00000001',
      remuneration: { costCenter: 'CC-124' },
    });

    expect(record.detail.personalInfo.costCenter).toBe('CC-124');
    expect(record.detail.requisition.costCenter).toBe('CC-124');
  });

  it('preserves zero maximum loan capacity and serializes it as maximumLoanCapacity', () => {
    const record = (service as any).mapApiItemToFullRecord({
      id: 7,
      employeeCode: 'Emp-00000001',
      remuneration: {
        loanAmountAllowed: '10000000.00',
        maximumLoanCapacity: '0.00',
        maximumLoanAllowed: '5000',
      },
    });
    const payload = service.buildFlatEmployeeProfilePayload(record.detail);
    const serializedPayload = (service as any).serializeEmployeeProfilePayload(payload);

    expect(record.detail.remuneration.maximumLoanCapacity).toBe('0.00');
    expect(payload.maximumLoanCapacity).toBe('0.00');
    expect(serializedPayload.maximumLoanCapacity).toBe('0.00');
    expect(serializedPayload).not.toHaveProperty('loanAmountAllowed');
    expect(serializedPayload).not.toHaveProperty('maximumLoanAllowed');
    expect(serializedPayload.remuneration.maximumLoanCapacity).toBe('0.00');
    expect(serializedPayload.remuneration).not.toHaveProperty('loanAmountAllowed');
    expect(serializedPayload.remuneration).not.toHaveProperty('maximumLoanAllowed');
  });

  it('serializes the edited maximum loan capacity instead of a stale zero legacy value', () => {
    const record = (service as any).mapApiItemToFullRecord({
      id: 7,
      employeeCode: 'Emp-00000001',
      remuneration: {
        loanAmountAllowed: '0.00',
        maximumLoanCapacity: '0.00',
      },
    });
    record.detail.remuneration.maximumLoanCapacity = '5000';

    const payload = service.buildFlatEmployeeProfilePayload(record.detail);
    service.updateEmployeeProfile(7, payload).subscribe();

    const httpMock = TestBed.inject(HttpTestingController);
    const request = httpMock.expectOne((req) => req.url.endsWith('/employee-profile-update/7'));

    expect(request.request.body.maximumLoanCapacity).toBe('5000');
    expect(request.request.body.remuneration.maximumLoanCapacity).toBe('5000');
    expect(request.request.body).not.toHaveProperty('loanAmountAllowed');
    expect(request.request.body.remuneration).not.toHaveProperty('loanAmountAllowed');
    request.flush({});
  });

  it('maps shift and overtime applicability aliases to the employee profile flags', () => {
    const rootFlags = (service as any).mapApiItemToFullRecord({
      employeeCode: 'EMP-001',
      personName: 'Nouman Ahmad Riaz',
      employee_shift_applicable: 'Yes',
      overtime_applicable: 'Yes',
    });
    const nestedFlags = (service as any).mapApiItemToFullRecord({
      employeeCode: 'EMP-002',
      personName: 'Another Employee',
      hr_settings: { ShiftApplicable: true },
      remuneration: { OvertimeApplicable: true },
    });

    expect(rootFlags.detail.hrSettings.attendanceShiftManagement).toBe('Yes');
    expect(rootFlags.detail.remuneration.overTimeApplicable).toBe('Yes');
    expect(nestedFlags.detail.hrSettings.attendanceShiftManagement).toBe('Yes');
    expect(nestedFlags.detail.remuneration.overTimeApplicable).toBe('Yes');
  });

  it('always fetches roster rows from the employee-roster-list API', () => {
    service.fetchEmployeeRosterList().subscribe();

    const httpMock = TestBed.inject(HttpTestingController);
    const request = httpMock.expectOne((req) =>
      req.method === 'GET' && req.url.endsWith('/api/employee-roster-list'),
    );

    request.flush([]);
  });

  it('includes zero unannounced leaves in the employee profile payload by default', () => {
    const record = (service as any).mapApiItemToFullRecord({});
    const payload = service.buildFlatEmployeeProfilePayload(record.detail);

    expect(payload.unanouncedLeaves).toBe(0);
    expect((service as any).serializeEmployeeProfilePayload(payload).unanouncedLeaves).toBe(0);
  });

  it('loads and preserves the unannounced leave count in employee profile updates', () => {
    const record = (service as any).mapApiItemToFullRecord({ unanouncedLeaves: 4 });
    const payload = service.buildFlatEmployeeProfilePayload(record.detail);
    const serializedPayload = (service as any).serializeEmployeeProfilePayload(payload);

    expect(record.detail.unannouncedLeaves).toBe('4');
    expect(payload.unanouncedLeaves).toBe(4);
    expect(serializedPayload.unanouncedLeaves).toBe(4);
    expect(serializedPayload.unanounced_leaves).toBe(4);
    expect(serializedPayload.remuneration.unannouncedLeaves).toBe(4);
  });

  it('loads unannounced leaves from supported profile field spellings and remuneration', () => {
    const snakeCaseRecord = (service as any).mapApiItemToFullRecord({
      unannounced_leaves: 5,
    });
    const remunerationRecord = (service as any).mapApiItemToFullRecord({
      remuneration: { unannounced_leaves: 6 },
    });

    expect(snakeCaseRecord.detail.unannouncedLeaves).toBe('5');
    expect(remunerationRecord.detail.unannouncedLeaves).toBe('6');
  });

  it('loads the Unannounced Leave count from the Leave Management row and serializes that row for profile updates', () => {
    const record = (service as any).mapApiItemToFullRecord({
      unannouncedLeaves: '1',
      leaveManagementRows: [{
        leave_type: 'Unannounced Leave',
        leaves_allocated: '0',
        leaves_availed: '3',
        remaining_leave: '-3',
      }],
    });
    const payload = service.buildFlatEmployeeProfilePayload(record.detail);
    const serializedPayload = (service as any).serializeEmployeeProfilePayload(payload);

    expect(record.detail.unannouncedLeaves).toBe('3');
    expect(payload.unanouncedLeaves).toBe(3);
    expect(serializedPayload.leaveManagement).toContainEqual(expect.objectContaining({
      leaveType: 'Unannounced Leave',
      leave_type: 'Unannounced Leave',
      leavesAvailed: '3',
      leaves_availed: '3',
      remainingLeave: '-3',
      remaining_leave: '-3',
    }));
    expect(serializedPayload.leaveManagementRows).toEqual(serializedPayload.leaveManagement);
    expect(serializedPayload.leave_management).toEqual(serializedPayload.leaveManagement);
  });

  it('includes a null Cost Center in the employee profile update body', () => {
    service.updateEmployeeProfile(7, { costCenter: null, flag: '1' } as any).subscribe();

    const httpMock = TestBed.inject(HttpTestingController);
    const request = httpMock.expectOne((req) => req.url.endsWith('/employee-profile-update/7'));

    expect(request.request.body.costCenter).toBeNull();
    expect(request.request.body.remuneration.costCenter).toBeNull();
    expect(request.request.body.flag).toBe('1');
    request.flush({});
  });
});