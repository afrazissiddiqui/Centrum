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
import { GatePassItemMasterService } from '../../../gate-pass/gate-pass-item-master.service';
import { GatePassDepartmentService } from '../../../gate-pass/gate-pass-department.service';
import { AlertService } from '../../../../services/alert.service';

describe('CreateJobRequisitionComponent validation', () => {
  let component: CreateJobRequisitionComponent;

  beforeEach(() => {
    component = new CreateJobRequisitionComponent(
      {} as Router,
      { snapshot: {} } as ActivatedRoute,
      { scrollToAnchor: () => undefined } as unknown as ViewportScroller,
      { fetchEmployeeProfileDetail: () => ({ subscribe: () => undefined }), formatEmployeeUserId: () => '', getNextEmployeeCode: () => '1234' } as unknown as ApplicationFormService,
      { fetchJobSpecificationsForApplication: () => ({ subscribe: () => undefined }) } as unknown as JobSpecificationService,
      { fetchLeaveTypes: () => ({ subscribe: () => undefined }) } as unknown as LeaveTypeService,
      { listAllocatableAssets: () => [] } as unknown as GatePassItemMasterService,
      { ensureLoaded: () => ({ subscribe: () => undefined }), departmentNames: () => [] } as unknown as GatePassDepartmentService,
      { ensureLoaded: () => of([]) } as unknown as DepartmentsPrService,
      { warning: () => undefined, error: () => undefined } as unknown as AlertService,
      { markForCheck: () => undefined } as unknown as ChangeDetectorRef,
    );
  });

  it('does not require payment-related fields when submitting the application', () => {
    (component as unknown as { paymentMode: { set: (value: string) => void } }).paymentMode.set('Bank');
    (component as unknown as { validationSubmitted: { set: (value: boolean) => void } }).validationSubmitted.set(true);

    expect((component as unknown as { isRequiredMissing: (field: string) => boolean }).isRequiredMissing('paymentMode')).toBeFalse();
    expect((component as unknown as { isRequiredMissing: (field: string) => boolean }).isRequiredMissing('accountTitle')).toBeFalse();
    expect((component as unknown as { isRequiredMissing: (field: string) => boolean }).isRequiredMissing('bankName')).toBeFalse();
    expect((component as unknown as { isRequiredMissing: (field: string) => boolean }).isRequiredMissing('accountNo')).toBeFalse();
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