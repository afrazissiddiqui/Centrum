import { ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ViewportScroller } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CreateJobRequisitionComponent } from './create-job-requisition';
import { ApplicationFormService } from '../../../../services/application-form.service';
import { DepartmentsPrService } from '../../../../services/departments-pr.service';
import { JobSpecificationService } from '../../../../services/job-specification.service';
import { LeaveTypeService } from '../../../../services/leave-type.service';
import { LeaveApplicationRecord, LeaveApplicationService } from '../../../../services/leave-application.service';
import { AttendanceManagementService } from '../../../../services/attendance-management.service';
import { WorkstationService } from '../../../../services/workstation.service';
import { GatePassItemMasterService } from '../../../gate-pass/gate-pass-item-master.service';
import { GatePassDepartmentService } from '../../../gate-pass/gate-pass-department.service';
import { AlertService } from '../../../../services/alert.service';

describe('CreateJobRequisitionComponent validation', () => {
  let component: CreateJobRequisitionComponent;
  let confirmLeaveRemoval: jasmine.Spy;

  beforeEach(() => {
    confirmLeaveRemoval = jasmine.createSpy('confirmWarning').and.resolveTo(false);
    component = new CreateJobRequisitionComponent(
      {} as Router,
      { snapshot: {} } as ActivatedRoute,
      { scrollToAnchor: () => undefined } as unknown as ViewportScroller,
      {
        fetchEmployeeProfileDetail: () => ({ subscribe: () => undefined }),
        fetchEmployeeRosterList: () => of([]),
        formatEmployeeUserId: () => '',
        getNextEmployeeCode: () => '1234',
      } as unknown as ApplicationFormService,
      { fetchLeaveApplications: () => of([]) } as unknown as LeaveApplicationService,
      { fetchEmployeeRosterAttendance: () => of(new Map()) } as unknown as AttendanceManagementService,
      { fetchWorkstations: () => of([]) } as unknown as WorkstationService,
      { fetchJobSpecificationsForApplication: () => ({ subscribe: () => undefined }) } as unknown as JobSpecificationService,
      { fetchLeaveTypes: () => ({ subscribe: () => undefined }) } as unknown as LeaveTypeService,
      { listAllocatableAssets: () => [] } as unknown as GatePassItemMasterService,
      { ensureLoaded: () => ({ subscribe: () => undefined }), departmentNames: () => [] } as unknown as GatePassDepartmentService,
      { ensureLoaded: () => of([]) } as unknown as DepartmentsPrService,
      {
        warning: () => undefined,
        error: () => undefined,
        confirmWarning: confirmLeaveRemoval,
      } as unknown as AlertService,
      { markForCheck: () => undefined } as unknown as ChangeDetectorRef,
    );
  });

  it('keeps a Leave Management row when its removal is cancelled', async () => {
    (component as any).leaveManagementRows.set([
      { leaveType: 'Annual Leave', leavesAllocated: '10', leavesAvailed: '2' },
      { leaveType: 'Sick Leave', leavesAllocated: '5', leavesAvailed: '1' },
    ]);

    await (component as any).removeLeaveManagementRow(0);

    expect(confirmLeaveRemoval).toHaveBeenCalledWith(
      'Remove leave row?',
      'Are you sure you want to remove this leave row?',
      'Remove',
    );
    expect((component as any).leaveManagementRows()).toHaveSize(2);
  });

  it('removes a Leave Management row after confirmation', async () => {
    confirmLeaveRemoval.and.resolveTo(true);
    (component as any).leaveManagementRows.set([
      { leaveType: 'Annual Leave', leavesAllocated: '10', leavesAvailed: '2' },
      { leaveType: 'Sick Leave', leavesAllocated: '5', leavesAvailed: '1' },
    ]);

    await (component as any).removeLeaveManagementRow(0);

    expect((component as any).leaveManagementRows()).toEqual([
      { leaveType: 'Sick Leave', leavesAllocated: '5', leavesAvailed: '1' },
    ]);
  });

  it('keeps the Unannounced Leave row read-only and prevents removal or edits', async () => {
    const unannouncedRow = {
      leaveType: 'Unannounced Leave',
      leavesAllocated: '0',
      leavesAvailed: '3',
    };
    (component as any).leaveManagementRows.set([
      unannouncedRow,
      { leaveType: 'Annual Leave', leavesAllocated: '10', leavesAvailed: '2' },
    ]);

    await (component as any).removeLeaveManagementRow(0);
    (component as any).updateLeaveManagementRow(0, 'leavesAvailed', '99');

    expect(confirmLeaveRemoval).not.toHaveBeenCalled();
    expect((component as any).leaveManagementRows()[0]).toEqual(unannouncedRow);
  });

  it('does not require payment-related fields when submitting the application', () => {
    (component as unknown as { paymentMode: { set: (value: string) => void } }).paymentMode.set('Bank');
    (component as unknown as { validationSubmitted: { set: (value: boolean) => void } }).validationSubmitted.set(true);

    expect((component as unknown as { isRequiredMissing: (field: string) => boolean }).isRequiredMissing('paymentMode')).toBeFalse();
    expect((component as unknown as { isRequiredMissing: (field: string) => boolean }).isRequiredMissing('accountTitle')).toBeFalse();
    expect((component as unknown as { isRequiredMissing: (field: string) => boolean }).isRequiredMissing('bankName')).toBeFalse();
    expect((component as unknown as { isRequiredMissing: (field: string) => boolean }).isRequiredMissing('accountNo')).toBeFalse();
  });

  it('refreshes the Unannounced Leave field from this year\'s leave applications', () => {
    const applications = [{
      EmployeeId: 'EMP-1001',
      LeaveType: 'Unannounced Leave',
      RequestStatus: 'Submitted',
      RequestDate: '2026-02-01',
      FromDate: '2026-02-01',
      ToDate: '2026-02-03',
      TotalLeaveDaysRequested: '3',
    }] as LeaveApplicationRecord[];
    (component as any).leaveApplicationService.fetchLeaveApplications = () => of(applications);

    (component as any).refreshUnannouncedLeaveCount({ EmployeeCode: 'Emp-00001001' });

    expect((component as any).unannouncedLeaves()).toBe('3');
    expect((component as any).leaveManagementRows()).toEqual(jasmine.arrayContaining([{
      leaveType: 'Unannounced Leave',
      leavesAllocated: '0',
      leavesAvailed: '3',
    }]));
  });

  it('adds earlier unposted roster absences to the profile field and Leave Management row', () => {
    (component as any).applicationFormService.fetchEmployeeRosterList = () => of([
      { employee_id: 'EMP-1001', shift_date: '2026-08-03', shift: 'D' },
      { employee_id: 'Emp-00001001', shift_date: '2026-08-04', shift: 'A' },
    ]);
    (component as any).refreshUnannouncedLeaveCount({ EmployeeCode: 'Emp-00001001' });

    expect((component as any).unannouncedLeaves()).toBe('2');
    expect((component as any).leaveManagementRows()).toEqual(jasmine.arrayContaining([{
      leaveType: 'Unannounced Leave',
      leavesAllocated: '0',
      leavesAvailed: '2',
    }]));
  });

  it('allows the legacy code field to be edited in the login details form', async () => {
    await TestBed.configureTestingModule({
      imports: [CreateJobRequisitionComponent],
      providers: [
        { provide: Router, useValue: {} },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: ViewportScroller, useValue: { scrollToAnchor: () => undefined } },
        {
          provide: ApplicationFormService,
          useValue: {
            getNextEmployeeCode: () => '1234',
            formatEmployeeUserId: (value: string) => value,
            fetchEmployeeProfileDetail: () => of({ detail: null }),
            normalizeEmployeeCodeValue: (value: string) => value,
          },
        },
        {
          provide: LeaveApplicationService,
          useValue: { fetchLeaveApplications: () => of([]) },
        },
        {
          provide: AttendanceManagementService,
          useValue: { fetchEmployeeRosterAttendance: () => of(new Map()) },
        },
        {
          provide: WorkstationService,
          useValue: { fetchWorkstations: () => of([]), workstations: () => [] },
        },
        {
          provide: JobSpecificationService,
          useValue: { fetchJobSpecificationsForApplication: () => of([]) },
        },
        {
          provide: LeaveTypeService,
          useValue: { fetchLeaveTypes: () => of([]) },
        },
        {
          provide: GatePassItemMasterService,
          useValue: { listAllocatableAssets: () => [] },
        },
        {
          provide: GatePassDepartmentService,
          useValue: { ensureLoaded: () => of([]), departmentNames: () => [] },
        },
        { provide: DepartmentsPrService, useValue: { ensureLoaded: () => of([]) } },
        { provide: AlertService, useValue: { warning: () => undefined, error: () => undefined } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CreateJobRequisitionComponent);
    fixture.detectChanges();

    const inputs = Array.from(fixture.nativeElement.querySelectorAll('input')) as HTMLInputElement[];
    const legacyInput = inputs.find((input) => input.placeholder === 'Legacy code');

    expect(legacyInput).toBeTruthy();
    expect(legacyInput?.hasAttribute('readonly')).toBeFalse();

    legacyInput!.value = 'EL-1025';
    legacyInput!.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect((fixture.componentInstance as any).legacyCode()).toBe('EL-1025');
  });

  it('restores the saved cost center when editing an application', () => {
    const record = {
      EmployeeCode: 'EMP-00000001',
      EmployeeName: 'Test Employee',
      Department: 'HR',
      EmployeeNature: '—',
      Designation: 'Developer',
      ReportingManager: '—',
      EmploymentType: '—',
      EmploymentStatus: 'Permanent',
      EmploymentCategory: '—',
      status: 'Permanent',
      detail: {
        personalInfo: {
          personName: 'Test Employee',
          firstName: 'Test',
          middleName: '',
          lastName: 'Employee',
          fatherOrHusbandName: '',
          gender: 'Male',
          maritalStatus: 'Single',
          dateOfBirth: '',
          nationality: 'Pakistani',
          religion: 'Islam',
          bloodGroup: '',
          nationalIdCardNo: '',
          incomeTaxNo: '',
          contactNumber: '',
          emergencyContactNumber: '',
          street: '',
          streetNo: '',
          buildingFloorRoom: '',
          city: '',
          state: '',
          country: 'Pakistan',
          zipCode: '',
          employmentNature: 'Permanent',
          employmentCategory: 'Permanent',
          employmentStatus: 'Permanent',
          departmentInAhcp: 'HR',
          designation: 'Developer',
          jobDescription: '',
          roleSalary: '',
          workGradeLevel: '',
          branchLocation: 'Karachi',
          costCenter: 'CC-124',
          reportingManager: '',
          remarks: '',
        },
        education: [],
        pastExperience: [],
        remuneration: {
          paymentMode: 'Bank',
          basicSalary: '',
          accountTitle: '',
          bankName: '',
          branchName: '',
          accountNo: '',
          accountType: '',
          effectiveDate: '',
          taxPercentage: '',
          dateOfJoining: '',
          advancePercentAllowed: '',
          loanAmountAllowed: '',
          maximumLoanCapacity: '',
          maximumAdvanceCapacity: '',
          allowancesApplicable: 'Yes',
          overTimeApplicable: 'No',
          eobiApplicable: 'Yes',
          providentApplicable: 'No',
          socialSecurityApplicable: 'No',
          fuelLimit: '',
          medicalAllowances: '',
          fuelAllowances: '',
          mobileAllowances: '',
          carAllowances: '',
          otherAllowances: '',
          leaveType: '',
          leaveDays: '',
          leavesAvailed: '',
          remainingLeaves: '',
          totalLeaves: '',
          gratuityBalance: '',
          grauity: '',
          leaveEligibilityCriteria: '',
          cashSalaryPercentage: '',
        },
        leaveManagement: [],
        hrSettings: {
          employeeMaster: '',
          salaryStructure: '',
          attendanceShiftManagement: 'No',
          loanAdvancesForm: '',
          requestStatus: 'Pending',
          leaveManagement: 'Enabled',
        },
        loginDetails: {
          employeeCode: 'EMP-00000001',
          legacyCode: '',
          employeeName: 'Test Employee',
          userId: '1',
          password: '',
          status: '1',
        },
        attachments: [],
        requisition: {
          copyExisting: false,
          reqId: '',
          internalJobTitle: 'Developer',
          hiringManager: '',
          recruiter: '',
          recruitmentCollaborator: '',
          requisitionAdministrator: '',
          recruitmentCoordinator: '',
          hrAdministrator: '',
          company: '',
          department: 'HR',
          division: '',
          location: 'Karachi',
          costCenter: 'CC-124',
        },
        assets: {
          assetAllocated: '',
          assetOitmCode: '',
          allocationStatus: '',
          allocationDate: '',
          allocationDateType: '',
        },
      },
    } as any;

    (component as any).populateFromRecord(record);

    expect((component as any).costCenter()).toBe('CC-124');
  });
});