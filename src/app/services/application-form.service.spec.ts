import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationFormService } from './application-form.service';
import { glAccountBranchLabel } from '../components/setup/gl-account-determination/gl-account-branch.options';

describe('ApplicationFormService', () => {
  let service: ApplicationFormService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApplicationFormService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApplicationFormService);
  });

  it('loads employee profiles from the public employee profile list API', () => {
    service.fetchEmployeeProfiles().subscribe();

    const request = TestBed.inject(HttpTestingController).expectOne(
      'http://116.203.172.106:8084/centrum_test/public/api/employee-profile-list',
    );
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('loads employee profile details from the public employee profile API', () => {
    service.fetchEmployeeProfileDetail(1).subscribe();

    const request = TestBed.inject(HttpTestingController).expectOne(
      'http://116.203.172.106:8084/centrum_test/public/api/employee-profile-detail/1',
    );
    expect(request.request.method).toBe('GET');
    request.flush({ data: { id: 1 } });
  });

  it('adds employee profiles through the public API with nested profile sections', () => {
    const record = (service as any).mapApiItemToFullRecord({});
    record.detail.personalInfo.personName = 'Ali Khan';
    record.detail.loginDetails.employeeName = 'alikhan';
    record.detail.loginDetails.password = 'Password@123';
    record.detail.remuneration.basicSalary = '80000';
    record.detail.education = [{
      qualification: 'BS Computer Science',
      institution: 'FAST NUCES',
      institute: 'FAST NUCES',
      passingYear: '2018',
      fromDate: '2014-09-01',
      toDate: '2018-07-01',
      subject: 'Computer Science',
      awardedQualification: '',
      marksGrades: '3.4 CGPA',
      notes: 'Honors',
    }];
    record.detail.pastExperience = [{
      company: 'Tech Solutions',
      designation: 'Associate Developer',
      position: 'Associate Developer',
      duration: '',
      fromDate: '2019-01-01',
      toDate: '2021-12-31',
      duties: '',
      remarks: 'Career Growth',
      lastSalary: '50000',
    }];
    const payload = service.buildFlatEmployeeProfilePayload(record.detail, {
      jobSpecificationId: 'JOB-101',
    });

    service.addEmployeeProfile(payload).subscribe();

    const request = TestBed.inject(HttpTestingController).expectOne(
      'http://116.203.172.106:8084/centrum_test/public/api/employee-profile-add',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body.jobSpecificationId).toBe('JOB-101');
    expect(request.request.body.personName).toBe('Ali Khan');
    expect(request.request.body.loginDetail.loginEmployeeName).toBe('alikhan');
    expect(request.request.body.loginDetail.password).toBe('Password@123');
    expect(request.request.body.remuneration.basicSalary).toBe(80000);
    expect(request.request.body.education[0].qualification).toBe('BS Computer Science');
    expect(request.request.body.education[0].institution).toBe('FAST NUCES');
    expect(request.request.body.pastExperience[0].company).toBe('Tech Solutions');
    expect(request.request.body.pastExperience[0].designation).toBe('Associate Developer');
    request.flush({ id: 1 });
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

  it('maps child benefit values from nested remuneration data', () => {
    const record = (service as any).mapApiItemToFullRecord({
      employeeCode: 'Emp-00000001',
      remuneration: { child_benefits: 250 },
    });

    expect(record.detail.remuneration.childBenefit).toBe('250');
  });

  it('uses branchLocation, not branchName, for the profile Branch dropdown', () => {
    const expectedBranches = [
      ['1', '3', 'AHCP_Faisalabad'],
      ['02', '2', 'AHCP_HO'],
      ['3', '1', 'AHCP_Peshawar'],
    ];

    for (const [responseBranch, dropdownBranch, expectedLabel] of expectedBranches) {
      const record = (service as any).mapApiItemToFullRecord({
        branchLocation: responseBranch,
        branchName: null,
      });

      expect(record.detail.personalInfo.branchLocation).toBe(dropdownBranch);
      expect(glAccountBranchLabel(record.detail.personalInfo.branchLocation)).toBe(expectedLabel);
      expect(service.buildFlatEmployeeProfilePayload(record.detail).branchLocation).toBe(dropdownBranch);
    }
  });

  it('posts only branchLocation even when requisition location is set', () => {
    const record = (service as any).mapApiItemToFullRecord({
      personalInfo: { branchLocation: '' },
      branchLocation: '',
      branchName: null,
    });
    record.detail.requisition.location = '3';
    const payload = service.buildFlatEmployeeProfilePayload(record.detail);

    expect(record.detail.personalInfo.branchLocation).toBe('');
    expect(payload.branchLocation).toBe('');
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