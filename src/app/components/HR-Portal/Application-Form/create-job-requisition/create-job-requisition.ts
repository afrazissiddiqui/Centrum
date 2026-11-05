import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, OnDestroy, computed, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ViewportScroller } from '@angular/common';
import { finalize, forkJoin } from 'rxjs';
import { AlertService } from '../../../../services/alert.service';
import {
  ApplicationFormDetail,
  ApplicationFormRecord,
  ApplicationFormService,
} from '../../../../services/application-form.service';
import { normalizeEmploymentStatus } from '../../../../utils/employment-status.util';
import {
  formatDateForInput,
  formatDateOfBirthFromApi,
  formatDateOfBirthToApi,
  formatDateToApiIso,
} from '../../../../utils/date-format.util';
import {
  JobSpecificationRecord,
  JobSpecificationService,
} from '../../../../services/job-specification.service';
import { LeaveTypeRecord, LeaveTypeService } from '../../../../services/leave-type.service';
import { LeaveApplicationService } from '../../../../services/leave-application.service';
import { AttendanceManagementService } from '../../../../services/attendance-management.service';
import { WorkstationService } from '../../../../services/workstation.service';
import { DepartmentsPrService, DepartmentPr } from '../../../../services/departments-pr.service';
import {
  GatePassItemMaster,
  GatePassItemMasterService,
} from '../../../gate-pass/gate-pass-item-master.service';
import { GatePassDepartmentService } from '../../../gate-pass/gate-pass-department.service';
import {
  GL_ACCOUNT_BRANCH_OPTIONS,
  glAccountBranchLabel,
  resolveBranchCode,
} from '../../../setup/gl-account-determination/gl-account-branch.options';
import {
  COUNTRY_OPTIONS,
  CountryOption,
  findCountryOption,
  formatCountryDisplay,
  matchCountryOption,
} from '../../country-options.util';
import {
  countUnannouncedLeaveDaysForYear,
  countUnannouncedLeaveDaysIncludingRosterAbsences,
} from '../../../../utils/unannounced-leave-count.util';

interface AttachmentRow {
  type: string;
  fileName: string;
  fileUrl: string;
  file: File | null;
}

const ATTACHMENT_FIELD_OPTIONS = [
  'Resume / CV',
  'National ID Card (CNIC)',
  'Education Certificate',
  'Experience Letter',
  'Photo',
  'Offer Letter',
  'Medical Certificate',
  'Other',
] as const;

const DEFAULT_ATTACHMENT_ROWS: AttachmentRow[] = [{ type: '', fileName: '', fileUrl: '', file: null }];

const WORK_GRADE_LEVEL_OPTIONS = [
  'WL 1A',
  'WL 1W',
  'WL 1S',
  'WL 5',
  'WL 4',
  'WL 3B',
  'WL 3A',
  'WL 2C',
  'WL 2B',
  'WL 2A',
  'WL 1D',
  'WL 1B',
  'WL 1C',

] as const;

const BASE_MANDATORY_FIELDS = [
  'personName',
  'firstName',
  'lastName',
  'fatherOrHusbandName',
  'gender',
  'maritalStatus',
  'dateOfBirth',
  'nationality',
  'religion',
  'nationalIdCardNo',
  'incomeTaxNo',
  'contactNumber',
  'emergencyContactNumber',
  'street',
  'city',
  'departmentInAhcp',
  'branchLocation',
  'employmentCategory',
  'workGradeLevel',
  'designation',
  'employmentStatus',
  'jobDescription',
  'basicSalary',
  'dateOfJoining',
  'loginEmployeeName',
] as const;

interface LeaveManagementRow {
  leaveType: string;
  leavesAllocated: string;
  leavesAvailed: string;
}

@Component({
  selector: 'app-create-job-requisition',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-job-requisition.html',
  styleUrl: './create-job-requisition.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CreateJobRequisitionComponent implements OnInit, OnDestroy {
  protected readonly editingApiId = signal<string | null>(null);
  protected readonly submitButtonLabel = computed(() =>
    this.editingApiId() ? 'Update Application' : 'Submit Application',
  );
  protected readonly submitting = signal(false);
  protected readonly copyExisting = signal(true);
  protected readonly activeSection = signal('personal-info-section');
  protected readonly selectedJobSpecId = signal('');
  protected readonly jobSpecificationOptions = signal<JobSpecificationRecord[]>([]);
  protected readonly jobSpecificationsLoading = signal(false);
  protected readonly selectedJobSpecLabel = computed(() => {
    const id = this.selectedJobSpecId();
    if (!id) {
      return 'No Selection';
    }

    const idNum = Number.parseInt(id, 10);
    const record = this.jobSpecificationOptions().find((item) => item.Id === idNum);
    return record ? this.jobSpecOptionLabel(record) : 'No Selection';
  });
  // Personal Information (OHEM mappings where applicable)
  protected readonly personName = signal(''); // free text
  protected readonly firstName = signal(''); // OHEM.firstName
  protected readonly middleName = signal(''); // OHEM.middleName
  protected readonly lastName = signal(''); // OHEM.lastName
  protected readonly fatherOrHusbandName = signal(''); // free text
  protected readonly gender = signal<'Male' | 'Female' | 'Prefer not to say' | ''>('');
  protected readonly maritalStatus = signal<'Single' | 'Married' | ''>('');
  protected readonly dateOfBirth = signal(''); // DD-MM-YYYY
  protected readonly dateOfBirthInputValue = computed(() => formatDateForInput(this.dateOfBirth()));
  protected readonly nationality = signal(''); // free text
  protected readonly religion = signal(''); // free text
  protected readonly bloodGroup = signal(''); // free text
  protected readonly nationalIdCardNo = signal(''); // XXXXX-XXXXXXX-X
  protected readonly incomeTaxNo = signal(''); // OHEM.govID (XXXXX-XXXXXXX-X)
  protected readonly contactNumber = signal(''); // OHEM.mobile (XXXX-XXXXXXX)
  protected readonly emergencyContactNumber = signal(''); // (XXXX-XXXXXXX)
  protected readonly street = signal(''); // OHEM.workStreet
  protected readonly streetNo = signal(''); // OHEM.StreetNoW
  protected readonly buildingFloorRoom = signal('');
  protected readonly city = signal(''); // OHEM.workCity
  protected readonly state = signal<'Punjab' | 'Sindh' | 'Khyber Pakhtunkhwa' | 'Balochistan' | ''>('');
  protected readonly country = signal(''); // OHEM.workCountr
  protected readonly countrySearchText = signal('');
  protected readonly countryOptions = COUNTRY_OPTIONS;
  protected readonly zipCode = signal(''); // XXXXX
  protected readonly employmentNature = signal('');
  protected readonly employmentCategory = signal('');
  protected readonly employmentStatus = signal('');
  protected readonly departmentInAhcp = signal('');
  protected readonly departmentOptions = signal<string[]>([]);
  protected readonly designation = signal('');
  protected readonly jobDescription = signal('');
  protected readonly roleSalary = signal('');
  protected readonly workGradeLevel = signal('');
  protected readonly branchLocation = signal('');
  protected readonly branchLocationOptions = GL_ACCOUNT_BRANCH_OPTIONS;
  protected readonly shiftTimeApplicable = signal<'Yes' | 'No' | ''>('');
  protected readonly remarks = signal('');
  protected readonly workGradeLevelOptions = WORK_GRADE_LEVEL_OPTIONS;

  // Education fields - array of education sections
  protected readonly educationSections = signal<Array<{
    institute: string;
    institution: string;
    qualification: string;
    passingYear: string;
    fromDate: string;
    toDate: string;
    subject: string;
    awardedQualification: string;
    marksGrades: string;
    notes: string;
  }>>([
    {
      institute: '',
      institution: '',
      qualification: '',
      passingYear: '',
      fromDate: '',
      toDate: '',
      subject: '',
      awardedQualification: '',
      marksGrades: '',
      notes: '',
    },
  ]);

  // Past Experience fields - array of past experience sections
  protected readonly pastExperienceSections = signal<Array<{
    company: string;
    position: string;
    designation: string;
    duration: string;
    fromDate: string;
    toDate: string;
    duties: string;
    remarks: string;
    lastSalary: string;
  }>>([
    {
      company: '',
      position: '',
      designation: '',
      duration: '',
      fromDate: '',
      toDate: '',
      duties: '',
      remarks: '',
      lastSalary: '',
    },
  ]);

  // Attachments — flat list of fileName + fileUrl (API shape)
  protected readonly attachmentFieldOptions = ATTACHMENT_FIELD_OPTIONS;
  protected readonly attachmentRows = signal<AttachmentRow[]>(DEFAULT_ATTACHMENT_ROWS);

  // Remuneration fields
  protected readonly basicSalary = signal('');
  protected readonly costCenter = signal('');
  protected readonly costCenterOptions = signal<DepartmentPr[]>([]);
  protected readonly paymentMode = signal<'Cash' | 'Bank' | 'Hybrid' | ''>('');
  protected readonly accountTitle = signal('');
  protected readonly bankName = signal('');
  protected readonly branchName = signal('');
  protected readonly accountNo = signal('');
  protected readonly accountType = signal('');
  protected readonly effectiveDate = signal('');
  protected readonly taxPercentage = signal('');
  protected readonly dateOfJoining = signal('');
  protected readonly advancePercentAllowed = signal('');
  protected readonly overTimeApplicable = signal<'Yes' | 'No' | ''>('No');
  protected readonly medicalAllowances = signal('');
  protected readonly fuelAllowances = signal('');
  protected readonly mobileAllowances = signal('');
  protected readonly carAllowances = signal('');
  protected readonly maximumLoanCapacity = signal('');
  protected readonly maximumAdvanceCapacity = signal('');
  protected readonly otherAllowances = signal('');
  protected readonly allowancesApplicable = signal<'Yes' | 'No' | ''>('Yes');
  protected readonly cashSalaryPercentage = signal('');
  protected readonly eobiApplicable = signal<'Yes' | 'No' | ''>('Yes');
  protected readonly providentApplicable = signal<'Yes' | 'No' | ''>('No');
  protected readonly socialSecurityApplicable = signal<'Yes' | 'No' | ''>('No');
  protected readonly fuelLimit = signal('');
  protected readonly gratuityBalance = signal('');
  protected readonly unannouncedLeaves = signal('0');
  protected readonly leaveManagementRows = signal<LeaveManagementRow[]>([
    { leaveType: '', leavesAllocated: '', leavesAvailed: '' },
  ]);
  protected readonly leaveTypeOptions = signal<LeaveTypeRecord[]>([]);
  protected readonly salaryInBank = computed(() => {
    const grossSalary = Number.parseFloat(this.basicSalary().trim());
    const bankPercent = Number.parseFloat(this.taxPercentage().trim());

    if (!Number.isFinite(grossSalary) || grossSalary <= 0) {
      return '';
    }

    const resolvedBankPercent = Number.isFinite(bankPercent) ? bankPercent : this.paymentMode() === 'Bank' ? 100 : this.paymentMode() === 'Cash' ? 0 : 0;
    const amount = (grossSalary * resolvedBankPercent) / 100;
    return this.formatCurrencyAmount(amount);
  });
  protected readonly salaryInCash = computed(() => {
    const grossSalary = Number.parseFloat(this.basicSalary().trim());
    const cashPercent = Number.parseFloat(this.cashSalaryPercentage().trim());

    if (!Number.isFinite(grossSalary) || grossSalary <= 0) {
      return '';
    }

    const resolvedCashPercent = Number.isFinite(cashPercent)
      ? cashPercent
      : this.paymentMode() === 'Cash'
        ? 100
        : this.paymentMode() === 'Bank'
          ? 0
          : 100 - (Number.parseFloat(this.taxPercentage().trim()) || 0);
    const amount = (grossSalary * resolvedCashPercent) / 100;
    return this.formatCurrencyAmount(amount);
  });
  protected readonly totalRemainingLeaves = computed(() =>
    this.leaveManagementRows().reduce((sum, row) => {
      const remaining = this.computeRemainingLeave(row);
      if (!remaining) {
        return sum;
      }

      const numeric = Number.parseInt(remaining, 10);
      return Number.isFinite(numeric) ? sum + numeric : sum;
    }, 0).toString(),
  );

  // HR / payroll settings
  protected readonly employeeMaster = signal('');
  protected readonly salaryStructure = signal('');
  protected readonly attendanceShiftManagement = signal('');
  protected readonly loanAdvancesForm = signal('');
  protected readonly requestStatus = signal('Pending');
  protected readonly hrLeaveManagementSetting = signal('Enabled');

  // Login Detail fields
  protected readonly employeeCode = signal(''); // Employee code
  protected readonly legacyCode = signal(''); // Legacy employee code
  protected readonly loginEmployeeName = signal(''); // Employee name
  protected readonly userId = signal(''); // User ID
  protected readonly password = signal(''); // Password
  protected readonly loginStatus = signal<'1' | '3'>('1');

  // Assets fields
  protected readonly assetAllocated = signal('');
  protected readonly assetOitmCode = signal('');
  protected readonly allocationStatus = signal<'Assigned' | 'Recovered' | ''>('');
  protected readonly allocationDate = signal('');
  protected readonly allocationDateType = signal<'Current Dated' | 'Back Dated' | ''>('');
  protected readonly assetOptions: GatePassItemMaster[];

  // Create Job Requisition fields
  protected readonly reqId = signal('');
  protected readonly internalJobTitle = signal('');
  protected readonly hiringManager = signal('');
  protected readonly recruiter = signal('');
  protected readonly recruitmentCollaborator = signal('');
  protected readonly requisitionAdministrator = signal('');
  protected readonly recruitmentCoordinator = signal('');
  protected readonly hrAdministrator = signal('');

  protected readonly company = signal('No Selection');
  protected readonly department = signal('No Selection');
  protected readonly division = signal('No Selection');
  protected readonly location = signal('');

  protected readonly touched = signal<Record<string, boolean>>({});
  protected readonly validationSubmitted = signal(false);

  protected educationFieldKey(
    field: 'Institute' | 'Qualification' | 'PassingYear',
    index: number,
  ): string {
    return `education${field}-${index}`;
  }

  protected isTaxPercentageEnabled(): boolean {
    return this.paymentMode() === 'Hybrid';
  }

  protected areAllowancesEnabled(): boolean {
    return this.allowancesApplicable() === 'Yes';
  }

  protected onPaymentModeChange(value: string): void {
    this.paymentMode.set(value as 'Cash' | 'Bank' | 'Hybrid' | '');
    this.applyPaymentModeSplit(value as 'Cash' | 'Bank' | 'Hybrid' | '');
  }

  private applyPaymentModeSplit(mode: 'Cash' | 'Bank' | 'Hybrid' | ''): void {
    if (mode === 'Cash') {
      this.taxPercentage.set('0');
      this.cashSalaryPercentage.set('100');
      return;
    }

    if (mode === 'Bank') {
      this.taxPercentage.set('100');
      this.cashSalaryPercentage.set('0');
      return;
    }

    if (mode === 'Hybrid') {
      if (!this.taxPercentage().trim()) {
        this.cashSalaryPercentage.set('');
      } else {
        this.updateCashSalaryPercentageFromBank();
      }
      return;
    }

    this.taxPercentage.set('');
    this.cashSalaryPercentage.set('');
  }

  protected onAllowancesApplicableChange(value: string): void {
    this.allowancesApplicable.set(value as 'Yes' | 'No' | '');
    if (value === 'Yes') {
      this.updateMedicalAllowanceFromGrossSalary();
      return;
    }

    this.medicalAllowances.set('');
    this.mobileAllowances.set('');
    this.carAllowances.set('');
    this.otherAllowances.set('');
  }

  protected onBankSalaryPercentageChange(value: string): void {
    this.taxPercentage.set(this.sanitizeDecimalValue(value));
    this.updateCashSalaryPercentageFromBank();
  }

  protected onGrossSalaryChange(value: string): void {
    this.basicSalary.set(this.sanitizeDecimalValue(value));
    this.updateMedicalAllowanceFromGrossSalary();
    this.updateMaximumAdvanceCapacityFromAdvancePercent();
  }

  protected onAdvancePercentAllowedChange(value: string): void {
    this.advancePercentAllowed.set(this.sanitizeDecimalValue(value));
    this.updateMaximumAdvanceCapacityFromAdvancePercent();
  }

  protected isMandatory(field: string): boolean {
    if (
      field.startsWith('educationInstitute-') ||
      field.startsWith('educationQualification-')
    ) {
      return true;
    }
    if (this.isOptionalField(field)) {
      return false;
    }
    return this.getActiveMandatoryFields().includes(field);
  }

  protected showFieldError(field: string): boolean {
    if (this.isOptionalField(field) || !this.isMandatory(field) || !this.shouldShowValidation(field)) {
      return false;
    }
    return this.isFieldEmpty(field) || this.isFieldFormatInvalid(field);
  }

  protected isRequiredMissing(field: string): boolean {
    if (this.isOptionalField(field) || !this.isMandatory(field)) {
      return false;
    }
    return this.shouldShowValidation(field) && this.isFieldEmpty(field);
  }

  protected shouldShowValidation(field: string): boolean {
    return !this.editingApiId() && (this.validationSubmitted() || !!this.touched()[field]);
  }

  protected onIntegerOnlyChange(value: string, target: { set: (next: string) => void }): void {
    target.set(this.sanitizeIntegerValue(value));
  }

  protected addLeaveManagementRow(): void {
    this.leaveManagementRows.update((rows) => [
      ...rows,
      { leaveType: '', leavesAllocated: '', leavesAvailed: '' },
    ]);
  }

  protected isUnannouncedLeaveRow(row: LeaveManagementRow): boolean {
    return row.leaveType.trim().toLowerCase().replace(/[^a-z]/g, '') === 'unannouncedleave';
  }

  protected async removeLeaveManagementRow(index: number): Promise<void> {
    const rowToRemove = this.leaveManagementRows()[index];
    if (!rowToRemove || this.isUnannouncedLeaveRow(rowToRemove)) {
      return;
    }

    const confirmed = await this.alertService.confirmWarning(
      'Remove leave row?',
      'Are you sure you want to remove this leave row?',
      'Remove',
    );
    if (!confirmed) {
      return;
    }

    this.leaveManagementRows.update((rows) => {
      if (!rows[index] || this.isUnannouncedLeaveRow(rows[index])) {
        return rows;
      }
      if (rows.length <= 1) {
        return [{ leaveType: '', leavesAllocated: '', leavesAvailed: '' }];
      }
      return rows.filter((_, rowIndex) => rowIndex !== index);
    });
  }

  protected updateLeaveManagementRow(
    index: number,
    field: keyof LeaveManagementRow,
    value: string,
  ): void {
    const currentRow = this.leaveManagementRows()[index];
    if (!currentRow || this.isUnannouncedLeaveRow(currentRow)) {
      return;
    }

    const sanitized =
      field === 'leavesAllocated' || field === 'leavesAvailed'
        ? this.sanitizeIntegerValue(value)
        : value;
    this.leaveManagementRows.update((rows) => {
      const next = [...rows];
      next[index] = { ...next[index], [field]: sanitized };
      return next;
    });
  }

  protected computeRemainingLeave(row: LeaveManagementRow): string {
    const allocatedStr = row.leavesAllocated.trim();
    if (!allocatedStr) {
      return '';
    }
    const allocated = Number.parseInt(allocatedStr, 10);
    if (!Number.isFinite(allocated)) {
      return '';
    }
    const availedStr = row.leavesAvailed.trim();
    const availed = availedStr ? Number.parseInt(availedStr, 10) : 0;
    if (!Number.isFinite(availed)) {
      return '';
    }
    return String(allocated - availed);
  }

  private buildLeaveManagementPayload(): ApplicationFormDetail['leaveManagement'] {
    return this.leaveManagementRows()
      .filter(
        (row) =>
          row.leaveType.trim() || row.leavesAllocated.trim() || row.leavesAvailed.trim(),
      )
      .map((row) => ({
        leaveType: row.leaveType.trim(),
        leavesAllocated: row.leavesAllocated.trim(),
        leavesAvailed: row.leavesAvailed.trim(),
        remainingLeave: this.computeRemainingLeave(row),
      }));
  }

  private updateCashSalaryPercentageFromBank(): void {
    const bankStr = this.taxPercentage().trim();
    if (!bankStr) {
      this.cashSalaryPercentage.set('');
      return;
    }

    const bank = Number.parseFloat(bankStr);
    if (!Number.isFinite(bank)) {
      this.cashSalaryPercentage.set('');
      return;
    }

    const cash = Math.max(0, 100 - bank);
    this.cashSalaryPercentage.set(this.formatPercentageValue(cash));
  }

  private formatPercentageValue(value: number): string {
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  }

  private updateMaximumAdvanceCapacityFromAdvancePercent(): void {
    const percentStr = this.advancePercentAllowed().trim();
    const salaryStr = this.basicSalary().trim();

    if (!percentStr || !salaryStr) {
      this.maximumAdvanceCapacity.set('');
      return;
    }

    const percent = Number.parseFloat(this.sanitizeDecimalValue(percentStr));
    const salary = Number.parseFloat(this.sanitizeDecimalValue(salaryStr));

    if (!Number.isFinite(percent) || !Number.isFinite(salary)) {
      this.maximumAdvanceCapacity.set('');
      return;
    }

    const capacity = (percent / 100) * salary;
    this.maximumAdvanceCapacity.set(this.formatCurrencyAmount(capacity));
  }

  private formatCurrencyAmount(value: number): string {
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  }

  protected onNumericOnlyChange(value: string, target: { set: (next: string) => void }): void {
    target.set(this.sanitizeDecimalValue(value));
    this.cdr.markForCheck();
  }

  protected onFuelLimitChange(value: string): void {
    this.fuelLimit.set(this.sanitizeDecimalValue(value));
    this.cdr.markForCheck();
  }

  protected onAccountNoChange(value: string): void {
    this.accountNo.set(this.sanitizeIntegerValue(value));
  }

  protected onIntegerKeyDown(event: KeyboardEvent): void {
    if (this.isInputNavigationKey(event)) {
      return;
    }

    if (event.key.length === 1 && !/\d/.test(event.key)) {
      event.preventDefault();
    }
  }

  protected onDecimalKeyDown(event: KeyboardEvent): void {
    if (this.isInputNavigationKey(event)) {
      return;
    }

    if (event.key === '.') {
      const input = event.target as HTMLInputElement;
      if (input.value.includes('.')) {
        event.preventDefault();
      }
      return;
    }

    if (event.key.length === 1 && !/\d/.test(event.key)) {
      event.preventDefault();
    }
  }

  private sanitizeIntegerValue(value: string): string {
    return String(value ?? '').replace(/\D/g, '');
  }

  private sanitizeDecimalValue(value: string): string {
    const sanitized = String(value ?? '').replace(/[^\d.]/g, '');
    const [whole, ...fraction] = sanitized.split('.');
    return fraction.length ? `${whole}.${fraction.join('')}` : whole;
  }

  private isInputNavigationKey(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return true;
    }

    return [
      'Backspace',
      'Delete',
      'Tab',
      'Enter',
      'Escape',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ].includes(event.key);
  }

  private buildRemunerationPayload(): ApplicationFormDetail['remuneration'] {
    const paymentMode = this.paymentMode();
    const bankPercentage = paymentMode === 'Bank' ? '100' : paymentMode === 'Cash' ? '0' : paymentMode === 'Hybrid' ? this.taxPercentage() : '';
    const cashPercentage = paymentMode === 'Cash' ? '100' : paymentMode === 'Bank' ? '0' : paymentMode === 'Hybrid' ? this.cashSalaryPercentage() : '';

    return {
      basicSalary: this.basicSalary(),
      paymentMode,
      accountTitle: this.accountTitle(),
      bankName: this.bankName(),
      branchName: this.branchName(),
      accountNo: this.accountNo(),
      accountType: this.accountType(),
      effectiveDate: this.effectiveDate(),
      taxPercentage: bankPercentage,
      dateOfJoining: this.dateOfJoining(),
      advancePercentAllowed: this.advancePercentAllowed(),
      loanAmountAllowed: this.maximumLoanCapacity(),
      overTimeApplicable: this.overTimeApplicable(),
      leaveType: '',
      leaveDays: '',
      leavesAvailed: '',
      remainingLeaves: this.totalRemainingLeaves(),
      totalLeaves: '',
      medicalAllowances: this.areAllowancesEnabled() ? this.medicalAllowances() : '',
      fuelAllowances: this.fuelAllowances(),
      mobileAllowances: this.areAllowancesEnabled() ? this.mobileAllowances() : '',
      carAllowances: this.areAllowancesEnabled() ? this.carAllowances() : '',
      maximumLoanCapacity: this.maximumLoanCapacity(),
      maximumAdvanceCapacity: this.maximumAdvanceCapacity(),
      otherAllowances: this.areAllowancesEnabled() ? this.otherAllowances() : '',
      allowancesApplicable: this.allowancesApplicable(),
      cashSalaryPercentage: cashPercentage,
      eobiApplicable: this.eobiApplicable(),
      providentApplicable: this.providentApplicable(),
      socialSecurityApplicable: this.socialSecurityApplicable(),
      fuelLimit: this.fuelLimit(),
      grauity: this.gratuityBalance(),
      gratuityBalance: this.gratuityBalance(),
      leaveEligibilityCriteria: '',
    };
  }

  private buildHrSettingsPayload(): ApplicationFormDetail['hrSettings'] {
    return {
      employeeMaster: this.employeeMaster(),
      salaryStructure: this.salaryStructure(),
      attendanceShiftManagement: this.shiftTimeApplicable(),
      leaveManagement: this.hrLeaveManagementSetting(),
      loanAdvancesForm: this.loanAdvancesForm(),
      requestStatus: this.requestStatus(),
    };
  }

  private apiDateOrEmpty(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    return formatDateToApiIso(trimmed);
  }

  private reportingManagerValue(): string {
    return this.hiringManager().trim();
  }

  private normalizePaymentMode(value: string): 'Cash' | 'Bank' | 'Hybrid' | '' {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === 'cash' ||
      normalized === 'cash salary' ||
      normalized === 'salary in cash'
    ) {
      return 'Cash';
    }
    if (
      normalized === 'bank' ||
      normalized === 'bank salary' ||
      normalized === 'salary in bank' ||
      normalized === 'bank transfer' ||
      normalized === 'banktransfer'
    ) {
      return 'Bank';
    }
    if (normalized === 'hybrid') {
      return 'Hybrid';
    }
    return '';
  }

  private firstNonEmpty(...values: Array<string | undefined | null>): string {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
    return '';
  }

  private remunerationValue(value: string | undefined | null): string {
    if (value === undefined || value === null) {
      return '';
    }
    return String(value).trim();
  }

  private updateMedicalAllowanceFromGrossSalary(): void {
    if (!this.areAllowancesEnabled()) {
      this.medicalAllowances.set('');
      return;
    }

    const salaryStr = this.basicSalary().trim();
    if (!salaryStr) {
      this.medicalAllowances.set('');
      return;
    }

    const grossSalary = Number.parseFloat(salaryStr);
    if (!Number.isFinite(grossSalary) || grossSalary <= 0) {
      this.medicalAllowances.set('');
      return;
    }

    const bankPercentage =
      this.paymentMode() === 'Bank'
        ? 100
        : this.paymentMode() === 'Cash'
          ? 0
          : Number.parseFloat(this.taxPercentage().trim()) || 0;
    const grossSalaryInBank = (grossSalary * bankPercentage) / 100;
    const medicalAllowance = (grossSalaryInBank / 110) * 10;
    this.medicalAllowances.set(this.formatCalculatedAmount(medicalAllowance));
  }

  private formatCalculatedAmount(value: number): string {
    if (!Number.isFinite(value)) {
      return '';
    }

    return value.toFixed(2).replace(/\.00$/, '');
  }

  private yesNoToBinaryFlag(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'yes' || normalized === 'true' || normalized === '1') {
      return '1';
    }
    if (normalized === 'no' || normalized === 'false' || normalized === '0') {
      return '0';
    }
    return '';
  }

  private yesNoFromApiLocal(value: unknown): 'Yes' | 'No' | '' {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    const normalized = value === undefined || value === null ? '' : String(value).trim();
    if (!normalized) {
      return '';
    }
    const lower = normalized.toLowerCase();
    if (lower === 'true' || normalized === '1') {
      return 'Yes';
    }
    if (lower === 'false' || normalized === '0') {
      return 'No';
    }
    if (lower === 'yes') {
      return 'Yes';
    }
    if (lower === 'no') {
      return 'No';
    }
    return '';
  }

  protected onAssetAllocatedChange(value: string): void {
    this.assetAllocated.set(value);
    const asset = this.assetOptions.find((item) => item.itemCode === value);
    this.assetOitmCode.set(asset?.itemCode ?? value);
  }

  protected onAllocationDateTypeChange(value: string): void {
    this.allocationDateType.set(value as 'Current Dated' | 'Back Dated' | '');
    if (value === 'Current Dated') {
      this.allocationDate.set(new Date().toISOString().slice(0, 10));
    }
  }

  protected onDateOfBirthChange(value: string): void {
    this.dateOfBirth.set(formatDateOfBirthFromApi(value));
  }

  protected onCountryInputChange(value: string): void {
    this.countrySearchText.set(value);
    const matched = matchCountryOption(value);
    this.country.set(matched?.code ?? value.trim());
  }

  protected onCountryBlur(): void {
    const matched = matchCountryOption(this.countrySearchText());
    if (matched) {
      this.country.set(matched.code);
      this.countrySearchText.set(this.formatCountryDisplay(matched.code));
      return;
    }

    const trimmed = this.countrySearchText().trim();
    this.country.set(trimmed);
    this.countrySearchText.set(trimmed);
  }

  protected touch(field: string): void {
    this.touched.update(t => ({ ...t, [field]: true }));
  }

  private isOptionalField(field: string): boolean {
    if (['bloodGroup', 'streetNo', 'state', 'country', 'zipCode', 'effectiveDate'].includes(field)) {
      return true;
    }
    return field.startsWith('educationPassingYear-');
  }

  private getActiveMandatoryFields(): string[] {
    const fields: string[] = [...BASE_MANDATORY_FIELDS];
    if (!this.editingApiId()) {
      fields.push('password');
    }
    this.educationSections().forEach((_, index) => {
      fields.push(
        this.educationFieldKey('Institute', index),
        this.educationFieldKey('Qualification', index),
      );
    });
    return fields;
  }

  private touchAllMandatory(): void {
    this.touched.update((current) => {
      const next = { ...current };
      for (const field of this.getActiveMandatoryFields()) {
        next[field] = true;
      }
      return next;
    });
  }

  private validateForm(): boolean {
    return this.getActiveMandatoryFields().every((field) => {
      if (this.isFieldEmpty(field)) {
        return false;
      }
      return !this.isFieldFormatInvalid(field);
    });
  }

  private isFieldEmpty(field: string): boolean {
    return !this.getFieldValue(field).trim();
  }

  private getFieldValue(field: string): string {
    const educationMatch = field.match(/^education(Institute|Qualification|PassingYear)-(\d+)$/);
    if (educationMatch) {
      const [, name, indexValue] = educationMatch;
      const index = Number.parseInt(indexValue, 10);
      const row = this.educationSections()[index];
      if (!row) {
        return '';
      }
      if (name === 'Institute') {
        return row.institute || row.institution;
      }
      if (name === 'Qualification') {
        return row.qualification;
      }
      return row.passingYear;
    }

    switch (field) {
      case 'personName': return this.personName();
      case 'firstName': return this.firstName();
      case 'lastName': return this.lastName();
      case 'fatherOrHusbandName': return this.fatherOrHusbandName();
      case 'gender': return this.gender();
      case 'maritalStatus': return this.maritalStatus();
      case 'dateOfBirth': return this.dateOfBirth();
      case 'nationality': return this.nationality();
      case 'religion': return this.religion();
      case 'bloodGroup': return this.bloodGroup();
      case 'nationalIdCardNo': return this.nationalIdCardNo();
      case 'incomeTaxNo': return this.incomeTaxNo();
      case 'contactNumber': return this.contactNumber();
      case 'emergencyContactNumber': return this.emergencyContactNumber();
      case 'street': return this.street();
      case 'streetNo': return this.streetNo();
      case 'city': return this.city();
      case 'state': return this.state();
      case 'country': return this.country();
      case 'zipCode': return this.zipCode();
      case 'departmentInAhcp': return this.departmentInAhcp();
      case 'branchLocation': return this.branchLocation();
      case 'employmentCategory': return this.employmentCategory();
      case 'workGradeLevel': return this.workGradeLevel();
      case 'designation': return this.designation();
      case 'employmentStatus': return this.employmentStatus();
      case 'jobDescription': return this.jobDescription();
      case 'basicSalary': return this.basicSalary();
      case 'paymentMode': return this.paymentMode();
      case 'accountTitle': return this.accountTitle();
      case 'bankName': return this.bankName();
      case 'accountNo': return this.accountNo();
      case 'accountType': return this.accountType();
      case 'effectiveDate': return this.effectiveDate();
      case 'dateOfJoining': return this.dateOfJoining();
      case 'loginEmployeeName': return this.loginEmployeeName();
      case 'password': return this.password();
      case 'gratuityBalance': return this.gratuityBalance();
      default: return '';
    }
  }

  private isFieldFormatInvalid(field: string): boolean {
    switch (field) {
      case 'nationalIdCardNo':
        return this.nationalIdCardNoInvalid();
      case 'incomeTaxNo':
        return this.incomeTaxNoInvalid();
      case 'contactNumber':
        return this.contactNumberInvalid();
      case 'emergencyContactNumber':
        return this.emergencyContactNumberInvalid();
      case 'zipCode':
        return this.zipCodeInvalid();
      default:
        return false;
    }
  }

  private readonly cnicPattern = /^\d{5}-\d{7}-\d{1}$/;
  private readonly phonePattern = /^\d{4}-\d{7}$/;
  private readonly zipPattern = /^\d{5}$/;

  private formatWithGroups(value: string, groups: number[]): string {
    const digits = value.replace(/\D/g, '');
    const maxDigits = groups.reduce((sum, group) => sum + group, 0);
    const trimmed = digits.slice(0, maxDigits);

    const parts: string[] = [];
    let index = 0;
    for (const groupSize of groups) {
      const next = trimmed.slice(index, index + groupSize);
      if (!next) {
        break;
      }
      parts.push(next);
      index += groupSize;
    }

    return parts.join('-');
  }

  protected onNationalIdCardNoChange(value: string): void {
    this.nationalIdCardNo.set(this.formatWithGroups(value, [5, 7, 1]));
  }

  protected onIncomeTaxNoChange(value: string): void {
    this.incomeTaxNo.set(this.formatWithGroups(value, [5, 7, 1]));
  }

  protected onContactNumberChange(value: string): void {
    this.contactNumber.set(this.formatWithGroups(value, [4, 7]));
  }

  protected onEmergencyContactNumberChange(value: string): void {
    this.emergencyContactNumber.set(this.formatWithGroups(value, [4, 7]));
  }

  protected onZipCodeChange(value: string): void {
    this.zipCode.set(value.replace(/\D/g, '').slice(0, 5));
  }

  protected countryOptionValue(option: CountryOption): string {
    return formatCountryDisplay(option.code);
  }

  protected readonly nationalIdCardNoInvalid = computed(() => {
    const v = this.nationalIdCardNo().trim();
    return v.length > 0 && !this.cnicPattern.test(v);
  });

  protected readonly incomeTaxNoInvalid = computed(() => {
    const v = this.incomeTaxNo().trim();
    return v.length > 0 && !this.cnicPattern.test(v);
  });

  protected readonly contactNumberInvalid = computed(() => {
    const v = this.contactNumber().trim();
    return v.length > 0 && !this.phonePattern.test(v);
  });

  protected readonly emergencyContactNumberInvalid = computed(() => {
    const v = this.emergencyContactNumber().trim();
    return v.length > 0 && !this.phonePattern.test(v);
  });

  protected readonly zipCodeInvalid = computed(() => {
    const v = this.zipCode().trim();
    return v.length > 0 && !this.zipPattern.test(v);
  });

  protected addEducationSection(): void {
    this.educationSections.update(sections => [
      ...sections,
      {
        institute: '',
        institution: '',
        qualification: '',
        passingYear: '',
        fromDate: '',
        toDate: '',
        subject: '',
        awardedQualification: '',
        marksGrades: '',
        notes: '',
      },
    ]);
  }

  protected updateEducationField(sectionIndex: number, field: string, value: string): void {
    const nextValue =
      field === 'passingYear' ? this.sanitizeIntegerValue(value) : value;

    this.educationSections.update(sections => {
      const updated = [...sections];
      const row = { ...updated[sectionIndex], [field]: nextValue };
      if (field === 'institute' || field === 'institution') {
        row.institute = value;
        row.institution = value;
      }
      updated[sectionIndex] = row;
      return updated;
    });
    this.cdr.markForCheck();
  }

  protected removeEducationSection(sectionIndex: number): void {
    this.educationSections.update((sections) => {
      if (sections.length <= 1) {
        return sections;
      }
      return sections.filter((_, index) => index !== sectionIndex);
    });
  }

  protected addPastExperienceSection(): void {
    this.pastExperienceSections.update(sections => [
      ...sections,
      {
        company: '',
        position: '',
        designation: '',
        duration: '',
        fromDate: '',
        toDate: '',
        duties: '',
        remarks: '',
        lastSalary: '',
      },
    ]);
  }

  protected updatePastExperienceField(sectionIndex: number, field: string, value: string): void {
    const nextValue = field === 'lastSalary' ? this.sanitizeDecimalValue(value) : value;

    this.pastExperienceSections.update(sections => {
      const updated = [...sections];
      const row = { ...updated[sectionIndex], [field]: nextValue };
      if (field === 'position' || field === 'designation') {
        row.position = value;
        row.designation = value;
      }
      updated[sectionIndex] = row;
      return updated;
    });
  }

  protected removePastExperienceSection(sectionIndex: number): void {
    this.pastExperienceSections.update((sections) => {
      if (sections.length <= 1) {
        return sections;
      }
      return sections.filter((_, index) => index !== sectionIndex);
    });
  }

  protected addAttachmentRow(): void {
    this.attachmentRows.update((rows) => [...rows, this.createEmptyAttachmentRow()]);
  }

  protected removeAttachmentRow(rowIndex: number): void {
    this.attachmentRows.update((rows) => {
      if (rows.length <= 1) {
        return rows;
      }
      return rows.filter((_, index) => index !== rowIndex);
    });
  }

  protected updateAttachmentField(rowIndex: number, field: 'type' | 'fileName' | 'fileUrl', value: string): void {
    this.attachmentRows.update((rows) => {
      const updated = [...rows];
      updated[rowIndex] = { ...updated[rowIndex], [field]: value };
      return updated;
    });
  }

  protected onAttachmentFileChange(rowIndex: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.attachmentRows.update((rows) => {
      const updated = [...rows];
      updated[rowIndex] = { ...updated[rowIndex], file, fileName: file.name };
      return updated;
    });
  }

  protected clearAttachmentFile(rowIndex: number): void {
    this.attachmentRows.update((rows) => {
      const updated = [...rows];
      updated[rowIndex] = { ...updated[rowIndex], file: null, fileName: '' };
      return updated;
    });
  }

  private createEmptyAttachmentRow(): AttachmentRow {
    return { type: '', fileName: '', fileUrl: '', file: null };
  }

  private buildAttachmentsPayload(): Array<{ type: string; fileName: string; fileUrl: string }> {
    return this.attachmentRows()
      .map((row) => ({
        type: row.type.trim(),
        fileName: row.fileName.trim() || (row.file ? row.file.name : ''),
        fileUrl: row.fileUrl.trim(),
      }))
      .filter((row) => row.type || row.fileName || row.fileUrl);
  }

  private parseEmployeeCodeNumber(value: string): number {
    const trimmed = value.trim();
    const direct = Number.parseInt(trimmed, 10);
    if (Number.isFinite(direct) && direct > 0) {
      return direct;
    }

    const match = trimmed.match(/(\d+)$/);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return this.applicationFormService.getNextEmployeeCode();
  }

  private intersectionObserver: IntersectionObserver | null = null;
  private sectionIds = [
    'personal-info-section',
    'education-section',
    'past-experience-section',
    'attachments-section',
    'remunation-section',
    'login-detail-section',
    'assets-section',
  ];

  protected scrollToSection(sectionId: string): void {
    this.activeSection.set(sectionId);
    this.viewportScroller.scrollToPosition([0, 0]);
    setTimeout(() => {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 0);
  }

  private setupIntersectionObserver(): void {
    const options = {
      root: null,
      rootMargin: '-50% 0px -50% 0px',
      threshold: 0
    };

    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.activeSection.set(entry.target.id);
        }
      });
    }, options);

    this.sectionIds.forEach(sectionId => {
      const element = document.getElementById(sectionId);
      if (element && this.intersectionObserver) {
        this.intersectionObserver.observe(element);
      }
    });
  }

  private destroyIntersectionObserver(): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
  }

  ngOnInit(): void {
    this.setupIntersectionObserver();
    this.loadJobSpecificationOptions();
    this.loadLeaveTypeOptions();
    this.loadDepartmentOptions();
    this.loadCostCenterOptions();
    const editId = this.route.snapshot.paramMap.get('id');
    if (!editId) {
      const nextCode = this.applicationFormService.getNextEmployeeCode();
      this.employeeCode.set(this.applicationFormService.formatEmployeeUserId(nextCode));
      return;
    }
    this.editingApiId.set(editId);
    this.applicationFormService.fetchEmployeeProfileDetail(editId).subscribe({
      next: (record) => {
        if (!record.detail) {
          this.alertService.warning('Edit', 'No profile details found for this employee.');
          return;
        }
        this.populateFromRecord(record);
        this.refreshUnannouncedLeaveCount(record);
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        const errorMessage =
          (error as { error?: { message?: string } })?.error?.message ||
          (error as { message?: string })?.message ||
          'Failed to load employee profile for edit.';
        this.alertService.error('Load Failed', errorMessage);
      },
    });
  }

  ngOnDestroy(): void {
    this.destroyIntersectionObserver();
  }

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly viewportScroller: ViewportScroller,
    private readonly applicationFormService: ApplicationFormService,
    private readonly leaveApplicationService: LeaveApplicationService,
    private readonly attendanceService: AttendanceManagementService,
    private readonly workstationService: WorkstationService,
    private readonly jobSpecificationService: JobSpecificationService,
    private readonly leaveTypeService: LeaveTypeService,
    private readonly itemMasterService: GatePassItemMasterService,
    private readonly departmentService: GatePassDepartmentService,
    private readonly departmentsPrService: DepartmentsPrService,
    private readonly alertService: AlertService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.assetOptions = this.itemMasterService.listAllocatableAssets();
  }

  protected onJobSpecificationSelected(value: string): void {
    this.selectedJobSpecId.set(value);
    if (!value) {
      return;
    }

    const id = Number.parseInt(value, 10);
    const record = this.jobSpecificationOptions().find((item) => item.Id === id);
    if (record) {
      this.populateFromJobSpecification(record);
      return;
    }

    this.jobSpecificationService.fetchJobSpecificationsForApplication().subscribe({
      next: (records) => {
        this.jobSpecificationOptions.set(records);
        const refreshed = records.find((item) => item.Id === id);
        if (refreshed) {
          this.populateFromJobSpecification(refreshed);
        } else {
          this.alertService.warning('Job Description', 'Selected job description could not be loaded.');
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.alertService.warning('Job Description', 'Selected job description could not be loaded.');
      },
    });
  }

  protected jobSpecOptionLabel(spec: JobSpecificationRecord): string {
    const title = this.cleanJobSpecValue(spec.jobTitle);
    const description = this.cleanJobSpecValue(spec.jobDescription);
    if (title && description) {
      const shortDescription = description.length > 72 ? `${description.slice(0, 72)}…` : description;
      return `${title} — ${shortDescription}`;
    }
    return title || description || 'Untitled job description';
  }

  private loadJobSpecificationOptions(): void {
    this.jobSpecificationsLoading.set(true);
    this.jobSpecificationService.fetchJobSpecificationsForApplication().subscribe({
      next: (records) => {
        this.jobSpecificationOptions.set(records);
        this.jobSpecificationsLoading.set(false);
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        this.jobSpecificationsLoading.set(false);
        this.cdr.markForCheck();
        const errorMessage =
          (error as { error?: { message?: string } })?.error?.message ||
          (error as { message?: string })?.message ||
          'Failed to load job descriptions.';
        this.alertService.error('Load Failed', errorMessage);
      },
    });
  }

  private loadLeaveTypeOptions(): void {
    this.leaveTypeService.fetchLeaveTypes().subscribe({
      next: (records) => {
        this.leaveTypeOptions.set(
          records.filter((record) => {
            const status = String(record.status ?? '').trim().toLowerCase();
            return !status || status === '1' || status === 'active';
          }),
        );
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        this.leaveTypeOptions.set([]);
        this.cdr.markForCheck();
        const errorMessage =
          (error as { error?: { message?: string } })?.error?.message ||
          (error as { message?: string })?.message ||
          'Failed to load leave types.';
        this.alertService.error('Load Failed', errorMessage);
      },
    });
  }

  private loadDepartmentOptions(): void {
    this.departmentService.ensureLoaded().subscribe({
      next: () => {
        this.departmentOptions.set(this.departmentService.departmentNames());
        this.cdr.markForCheck();
      },
      error: () => {
        this.departmentOptions.set([]);
        this.cdr.markForCheck();
      },
    });
  }

  private loadCostCenterOptions(): void {
    this.departmentsPrService.ensureLoaded().subscribe({
      next: (options) => {
        this.costCenterOptions.set(options);
        this.cdr.markForCheck();
      },
      error: () => {
        this.costCenterOptions.set([]);
        this.cdr.markForCheck();
      },
    });
  }

  private cleanJobSpecValue(value: string): string {
    return value === '—' ? '' : value.trim();
  }

  private formatCountryDisplay(value: string): string {
    return formatCountryDisplay(value);
  }

  private mapEmploymentTypeToStatus(employmentType: string): string {
    return normalizeEmploymentStatus(employmentType) || employmentType;
  }

  private resolveWorkGradeLevel(gradeWorkLevel: string): string {
    const normalized = gradeWorkLevel.trim();
    if ((WORK_GRADE_LEVEL_OPTIONS as readonly string[]).includes(normalized)) {
      return normalized;
    }
    return '';
  }

  private resolveBranchCode(branchLocation: string | null | undefined): string {
    return resolveBranchCode(branchLocation ?? '');
  }

  private populateFromJobSpecification(record: JobSpecificationRecord): void {
    const jobTitle = this.cleanJobSpecValue(record.jobTitle);
    const department = this.cleanJobSpecValue(record.department);
    const employmentCategory = this.cleanJobSpecValue(record.employmentCategory);
    const employmentNature = this.cleanJobSpecValue(record.employmentNature);
    const employmentType = this.cleanJobSpecValue(record.employmentType);
    const gradeWorkLevel = this.cleanJobSpecValue(record.gradeWorkLevel);
    const packagePerks = this.cleanJobSpecValue(record.packagePerks);

    this.designation.set(jobTitle);
    this.internalJobTitle.set(jobTitle);
    this.departmentInAhcp.set(department);
    this.employmentCategory.set(employmentCategory);
    this.employmentNature.set(employmentNature);

    const mappedStatus = this.mapEmploymentTypeToStatus(employmentType);
    if (mappedStatus) {
      this.employmentStatus.set(mappedStatus);
    }
    if (employmentType) {
      this.division.set(employmentType);
    }

    const resolvedGrade = this.resolveWorkGradeLevel(gradeWorkLevel);
    if (resolvedGrade) {
      this.workGradeLevel.set(resolvedGrade);
    }
    if (gradeWorkLevel) {
      this.roleSalary.set(gradeWorkLevel);
      this.salaryStructure.set(gradeWorkLevel);
    }

    if (record.basicSalary) {
      this.basicSalary.set(String(record.basicSalary));
      this.updateMedicalAllowanceFromGrossSalary();
      this.updateMaximumAdvanceCapacityFromAdvancePercent();
    }
    if (record.fuelAllowance) {
      this.fuelAllowances.set(String(record.fuelAllowance));
    }
    if (packagePerks) {
      this.otherAllowances.set(packagePerks);
    }

    const hasAllowances =
      record.medicalAllowance > 0 || record.fuelAllowance > 0 || Boolean(packagePerks);
    if (hasAllowances) {
      this.allowancesApplicable.set('Yes');
    }

    const qualifications = record.qualifications.filter(Boolean);
    if (qualifications.length) {
      this.educationSections.set(
        qualifications.map((qualification) => ({
          institute: '',
          institution: '',
          qualification,
          passingYear: '',
          fromDate: '',
          toDate: '',
          subject: '',
          awardedQualification: '',
          marksGrades: '',
          notes: '',
        })),
      );
    }

    if (department && department !== 'No Selection') {
      this.department.set(department);
    }
  }

  protected back(): void {
    void this.router.navigateByUrl('/recruitment');
  }

  protected search(): void {
    // Placeholder for future integration
    console.log('Search clicked', {
      copyExisting: this.copyExisting(),
      reqId: this.reqId(),
      internalJobTitle: this.internalJobTitle(),
      hiringManager: this.hiringManager(),
      recruiter: this.recruiter(),
      recruitmentCollaborator: this.recruitmentCollaborator(),
      requisitionAdministrator: this.requisitionAdministrator(),
      recruitmentCoordinator: this.recruitmentCoordinator(),
      hrAdministrator: this.hrAdministrator(),
      educationSections: this.educationSections(),
      company: this.company(),
      department: this.department(),
      division: this.division(),
      location: this.location(),
    });
  }

  protected submitApplication(): void {
    if (this.submitting()) {
      return;
    }

    this.validationSubmitted.set(true);
    this.touchAllMandatory();
    if (!this.editingApiId() && !this.validateForm()) {
      this.alertService.warning('Validation', 'Please fill all mandatory fields highlighted in red.');
      this.cdr.markForCheck();
      return;
    }

    const noSelection = (value: string): string => (value === 'No Selection' ? '' : value);

    const codeStr = this.employeeCode().trim();
    const employeeCodeNum = this.parseEmployeeCodeNumber(codeStr);
    const displayEmployeeCode =
      codeStr || this.applicationFormService.formatEmployeeUserId(employeeCodeNum);

    const loginName = this.loginEmployeeName().trim();
    const composedName = [this.firstName(), this.middleName(), this.lastName()]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(' ');
    const displayName =
      this.personName().trim() || composedName || loginName || `Applicant-${employeeCodeNum}`;

    const detail: ApplicationFormDetail = {
      personalInfo: {
        personName: this.personName(),
        firstName: this.firstName(),
        middleName: this.middleName(),
        lastName: this.lastName(),
        fatherOrHusbandName: this.fatherOrHusbandName(),
        gender: this.gender(),
        maritalStatus: this.maritalStatus(),
        dateOfBirth: formatDateOfBirthToApi(this.dateOfBirth()),
        nationality: this.nationality(),
        religion: this.religion(),
        bloodGroup: this.bloodGroup(),
        nationalIdCardNo: this.nationalIdCardNo(),
        incomeTaxNo: this.incomeTaxNo(),
        contactNumber: this.contactNumber(),
        emergencyContactNumber: this.emergencyContactNumber(),
        street: this.street(),
        streetNo: this.streetNo(),
        buildingFloorRoom: this.buildingFloorRoom(),
        city: this.city(),
        state: this.state(),
        country: this.country(),
        zipCode: this.zipCode(),
        employmentNature: this.employmentNature(),
        employmentCategory: this.employmentCategory(),
        employmentStatus: this.employmentStatus(),
        departmentInAhcp: this.departmentInAhcp(),
        designation: this.designation(),
        jobDescription: this.jobDescription(),
        roleSalary: this.firstNonEmpty(this.roleSalary(), this.workGradeLevel()),
        workGradeLevel: this.workGradeLevel(),
        branchLocation: this.branchLocation(),
        costCenter: this.costCenter(),
        reportingManager: this.reportingManagerValue(),
        remarks: this.remarks(),
      },
      education: this.educationSections().map((row) => ({ ...row })),
      pastExperience: this.pastExperienceSections().map((row) => ({ ...row })),
      remuneration: this.buildRemunerationPayload(),
      unannouncedLeaves: this.unannouncedLeaves(),
      leaveManagement: this.buildLeaveManagementPayload(),
      hrSettings: this.buildHrSettingsPayload(),
      loginDetails: {
        employeeCode: displayEmployeeCode,
        legacyCode: this.legacyCode(),
        employeeName: this.loginEmployeeName(),
        userId: this.userId(),
        password: this.password(),
        status: this.loginStatus(),
      },
      attachments: this.buildAttachmentsPayload().map((row) => ({
        type: row.type,
        attachmentFor: row.type,
        fileName: row.fileName,
        fileUrl: row.fileUrl,
      })),
      requisition: {
        copyExisting: this.copyExisting(),
        reqId: this.selectedJobSpecId().trim() || this.reqId(),
        internalJobTitle: this.internalJobTitle(),
        hiringManager: this.reportingManagerValue(),
        recruiter: this.recruiter(),
        recruitmentCollaborator: this.recruitmentCollaborator(),
        requisitionAdministrator: this.requisitionAdministrator(),
        recruitmentCoordinator: this.recruitmentCoordinator(),
        hrAdministrator: this.hrAdministrator(),
        company: this.company(),
        department: this.department(),
        division: this.division(),
        location: glAccountBranchLabel(this.branchLocation()) || this.location(),
        costCenter: this.costCenter(),
      },
      assets: {
        assetAllocated: this.assetAllocated(),
        assetOitmCode: this.assetOitmCode(),
        allocationStatus: this.allocationStatus(),
        allocationDate: this.allocationDate(),
        allocationDateType: this.allocationDateType(),
      },
    };

    const record: ApplicationFormRecord = {
      EmployeeCode: displayEmployeeCode,
      EmployeeName: displayName,
      Department: this.departmentInAhcp().trim() || '—',
      EmployeeNature: noSelection(this.employmentNature()) || '—',
      Designation: this.designation().trim() || '—',
      ReportingManager: this.reportingManagerValue() || '—',
      EmploymentType: noSelection(this.division()) || '—',
      EmploymentStatus: normalizeEmploymentStatus(this.employmentStatus()) || 'Permanent',
      EmploymentCategory: noSelection(this.employmentCategory()) || '—',
      status: normalizeEmploymentStatus(this.employmentStatus()) || 'Permanent',
      selected: false,
      detail
    };

    const payload = this.applicationFormService.buildFlatEmployeeProfilePayload(detail, {
      jobSpecificationId: this.selectedJobSpecId().trim(),
      education: this.educationSections().map((row) => ({ ...row })),
      pastExperience: this.pastExperienceSections().map((row) => ({ ...row })),
    });
    payload.maximumLoanCapacity = this.maximumLoanCapacity().trim() || null;

    console.debug('Employee profile API payload', payload);

    const editId = this.editingApiId();
    const request$ = editId
      ? this.applicationFormService.updateEmployeeProfile(editId, payload)
      : this.applicationFormService.addEmployeeProfile(payload);

    this.submitting.set(true);
    request$.pipe(finalize(() => {
      this.submitting.set(false);
      this.cdr.markForCheck();
    })).subscribe({
      next: (response) => {
        const responseId = this.applicationFormService.extractApiIdFromResponse(response);
        const cacheKeys = new Set(
          [editId, responseId, displayEmployeeCode, String(employeeCodeNum), this.userId().trim()].filter(
            Boolean,
          ),
        );
        for (const key of cacheKeys) {
          this.applicationFormService.cacheEmployeeAttachments(String(key), detail.attachments);
          this.applicationFormService.cacheEmployeeProfileSections(
            String(key),
            detail.education,
            detail.pastExperience,
          );
        }

        if (!editId) {
          this.applicationFormService.addApplicationRecord({
            ...record,
            apiId: responseId || record.apiId,
            detail,
          });
        } else {
          this.applicationFormService.upsertApplicationRecord({
            ...record,
            apiId: String(editId),
            detail,
          });
        }
        this.alertService.success(
          'Success',
          editId ? 'Employee profile updated successfully.' : 'Application submitted successfully.',
        );
        void this.router.navigateByUrl('/recruitment');
      },
      error: (error: unknown) => {
        const errorMessage =
          (error as { error?: { message?: string } })?.error?.message ||
          (error as { message?: string })?.message ||
          (editId ? 'Failed to update employee profile.' : 'Failed to submit application form.');
        this.alertService.error(editId ? 'Update Failed' : 'Submission Failed', errorMessage);
      },
    });
  }

  private normalizeLoginStatus(value: string | number | null | undefined): '1' | '3' {
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === '3' || raw === 'inactive' || raw === '0') {
      return '3';
    }
    return '1';
  }

  private refreshUnannouncedLeaveCount(record: ApplicationFormRecord): void {
    const employeeId = (record.EmployeeCode || record.detail?.loginDetails.employeeCode || '').trim();
    if (!employeeId) {
      return;
    }

    const today = new Date();
    this.leaveApplicationService.fetchLeaveApplications().subscribe({
      next: (applications) => {
        this.setUnannouncedLeaveCount(countUnannouncedLeaveDaysForYear(
          applications,
          employeeId,
          today.getFullYear(),
          today,
        ));
        const yearStart = `${today.getFullYear()}-01-01`;
        const todayString = [
          today.getFullYear(),
          String(today.getMonth() + 1).padStart(2, '0'),
          String(today.getDate()).padStart(2, '0'),
        ].join('-');
        forkJoin({
          roster: this.applicationFormService.fetchEmployeeRosterList(),
          attendance: this.attendanceService.fetchEmployeeRosterAttendance(record, yearStart, todayString),
          workstations: this.workstationService.fetchWorkstations(),
        }).subscribe({
          next: ({ roster, attendance, workstations }) => {
            const annualCount = countUnannouncedLeaveDaysIncludingRosterAbsences(
              applications,
              roster,
              attendance,
              workstations,
              employeeId,
              today.getFullYear(),
              today,
            );
            this.setUnannouncedLeaveCount(annualCount);
            this.cdr.markForCheck();
          },
          error: (error: unknown) => {
            const message = error instanceof Error ? error.message : 'Could not load roster history for Unannounced Leave.';
            this.alertService.error('Unannounced Leave History Load Failed', message);
          },
        });
      },
      error: (error: unknown) => {
        const message = error instanceof Error ? error.message : 'Could not refresh Unannounced Leave count.';
        this.alertService.error('Unannounced Leave Load Failed', message);
      },
    });
  }

  private setUnannouncedLeaveCount(count: number): void {
    const value = String(count);
    this.unannouncedLeaves.set(value);
    if (count > 0) {
      this.leaveTypeOptions.update((options) =>
        options.some(
          (option) => option.name.trim().toLowerCase().replace(/[^a-z]/g, '') === 'unannouncedleave',
        )
          ? options
          : [
              ...options,
              {
                id: 'unannounced-leave',
                name: 'Unannounced Leave',
                code: 'Unannounced Leave',
                description: 'Unannounced Leave',
                status: 1,
              },
            ],
      );
    }
    this.leaveManagementRows.update((rows) => {
      const rowIndex = rows.findIndex(
        (row) => row.leaveType.trim().toLowerCase().replace(/[^a-z]/g, '') === 'unannouncedleave',
      );
      if (rowIndex >= 0) {
        const updatedRows = [...rows];
        updatedRows[rowIndex] = { ...updatedRows[rowIndex], leavesAvailed: value };
        return updatedRows;
      }
      if (count <= 0) {
        return rows;
      }
      return [
        ...rows.filter((row) => row.leaveType.trim() || row.leavesAllocated.trim() || row.leavesAvailed.trim()),
        { leaveType: 'Unannounced Leave', leavesAllocated: '0', leavesAvailed: value },
      ];
    });
  }

  private populateFromRecord(record: ApplicationFormRecord): void {
    const detail = record.detail;
    if (!detail) {
      return;
    }

    const unannouncedLeaveRow = detail.leaveManagement.find(
      (row) => row.leaveType.trim().toLowerCase().replace(/[^a-z]/g, '') === 'unannouncedleave',
    );
    this.unannouncedLeaves.set(unannouncedLeaveRow?.leavesAvailed || detail.unannouncedLeaves || '0');
    this.personName.set(detail.personalInfo.personName);
    this.firstName.set(detail.personalInfo.firstName);
    this.middleName.set(detail.personalInfo.middleName);
    this.lastName.set(detail.personalInfo.lastName);
    this.fatherOrHusbandName.set(detail.personalInfo.fatherOrHusbandName);
    this.gender.set((detail.personalInfo.gender as 'Male' | 'Female' | 'Prefer not to say' | '') ?? '');
    this.maritalStatus.set((detail.personalInfo.maritalStatus as 'Single' | 'Married' | '') ?? '');
    this.dateOfBirth.set(formatDateOfBirthFromApi(detail.personalInfo.dateOfBirth));
    this.nationality.set(detail.personalInfo.nationality);
    this.religion.set(detail.personalInfo.religion);
    this.bloodGroup.set(detail.personalInfo.bloodGroup);
    this.nationalIdCardNo.set(detail.personalInfo.nationalIdCardNo);
    this.incomeTaxNo.set(detail.personalInfo.incomeTaxNo);
    this.contactNumber.set(detail.personalInfo.contactNumber);
    this.emergencyContactNumber.set(detail.personalInfo.emergencyContactNumber);
    this.street.set(detail.personalInfo.street);
    this.streetNo.set(detail.personalInfo.streetNo);
    this.buildingFloorRoom.set(detail.personalInfo.buildingFloorRoom ?? '');
    this.city.set(detail.personalInfo.city);
    this.state.set((detail.personalInfo.state as 'Punjab' | 'Sindh' | 'Khyber Pakhtunkhwa' | 'Balochistan' | '') ?? '');
    this.country.set(detail.personalInfo.country);
    this.countrySearchText.set(this.formatCountryDisplay(detail.personalInfo.country));
    this.zipCode.set(detail.personalInfo.zipCode);
    this.employmentNature.set(
      detail.personalInfo.employmentNature ||
        (record.EmployeeNature !== '—' ? record.EmployeeNature : ''),
    );
    this.employmentCategory.set(
      detail.personalInfo.employmentCategory ||
        (record.EmploymentCategory !== '—' ? record.EmploymentCategory : ''),
    );
    this.employmentStatus.set(
      normalizeEmploymentStatus(
        detail.personalInfo.employmentStatus ||
          (record.EmploymentStatus !== '—' ? record.EmploymentStatus : '') ||
          (record.status !== '—' ? record.status : ''),
      ),
    );
    this.departmentInAhcp.set(
      detail.personalInfo.departmentInAhcp || (record.Department !== '—' ? record.Department : ''),
    );
    this.designation.set(
      detail.personalInfo.designation ||
        (record.Designation !== '—' ? record.Designation : detail.requisition.internalJobTitle),
    );
    this.jobDescription.set(detail.personalInfo.jobDescription);
    const roleSalaryValue =
      detail.personalInfo.roleSalary ||
      detail.hrSettings?.salaryStructure ||
      '';
    this.roleSalary.set(roleSalaryValue);
    this.salaryStructure.set(detail.hrSettings?.salaryStructure || roleSalaryValue);
    this.workGradeLevel.set(
      detail.personalInfo.workGradeLevel ||
      this.resolveWorkGradeLevel(roleSalaryValue) ||
      '',
    );
    this.branchLocation.set(
      this.resolveBranchCode(detail.personalInfo.branchLocation),
    );
    this.costCenter.set(
      detail.personalInfo.costCenter || detail.requisition.costCenter || '',
    );
    this.remarks.set(detail.personalInfo.remarks ?? '');

    this.educationSections.set(
      detail.education.length
        ? detail.education.map((row) => ({
            ...row,
            institute: row.institute || row.institution,
            institution: row.institution || row.institute,
          }))
        : [{
            institute: '',
            institution: '',
            qualification: '',
            passingYear: '',
            fromDate: '',
            toDate: '',
            subject: '',
            awardedQualification: '',
            marksGrades: '',
            notes: '',
          }],
    );

    this.pastExperienceSections.set(
      detail.pastExperience.length
        ? detail.pastExperience.map((row) => ({
            ...row,
            position: row.position || row.designation,
            designation: row.designation || row.position,
          }))
        : [{
            company: '',
            position: '',
            designation: '',
            duration: '',
            fromDate: '',
            toDate: '',
            duties: '',
            remarks: '',
            lastSalary: '',
          }],
    );

    const remuneration = detail.remuneration;
    const savedPaymentMode = this.normalizePaymentMode(remuneration.paymentMode ?? '');
    this.basicSalary.set(remuneration.basicSalary ?? '');
    this.paymentMode.set(savedPaymentMode);
    this.accountTitle.set(remuneration.accountTitle ?? '');
    this.bankName.set(remuneration.bankName ?? '');
    this.branchName.set(remuneration.branchName ?? '');
    this.accountNo.set(remuneration.accountNo ?? '');
    this.accountType.set(remuneration.accountType ?? '');
    this.effectiveDate.set(remuneration.effectiveDate ?? '');
    this.taxPercentage.set(savedPaymentMode === 'Hybrid' ? (remuneration.taxPercentage ?? '') : '');
    this.cashSalaryPercentage.set(savedPaymentMode === 'Hybrid' ? (remuneration.cashSalaryPercentage ?? '') : '');

    if (savedPaymentMode === 'Cash') {
      this.taxPercentage.set('0');
      this.cashSalaryPercentage.set('100');
    } else if (savedPaymentMode === 'Bank') {
      this.taxPercentage.set('100');
      this.cashSalaryPercentage.set('0');
    } else if (savedPaymentMode === 'Hybrid') {
      this.taxPercentage.set(remuneration.taxPercentage ?? '');
      this.updateCashSalaryPercentageFromBank();
    }

    this.dateOfJoining.set(remuneration.dateOfJoining ?? '');
    this.advancePercentAllowed.set(remuneration.advancePercentAllowed ?? '');
    this.maximumLoanCapacity.set(
      this.firstNonEmpty(
        this.remunerationValue(remuneration.loanAmountAllowed),
        this.remunerationValue(remuneration.maximumLoanCapacity),
      ),
    );
    this.allowancesApplicable.set((remuneration.allowancesApplicable as 'Yes' | 'No' | '') || 'Yes');
    this.updateMedicalAllowanceFromGrossSalary();
    const storedAdvanceCapacity = this.firstNonEmpty(
      this.remunerationValue(remuneration.maximumAdvanceCapacity),
    );
    if (storedAdvanceCapacity) {
      this.maximumAdvanceCapacity.set(storedAdvanceCapacity);
    } else {
      this.updateMaximumAdvanceCapacityFromAdvancePercent();
    }
    this.overTimeApplicable.set((remuneration.overTimeApplicable as 'Yes' | 'No' | '') ?? 'No');
    this.fuelAllowances.set(this.remunerationValue(remuneration.fuelAllowances));
    if (this.areAllowancesEnabled()) {
      this.mobileAllowances.set(this.remunerationValue(remuneration.mobileAllowances));
      this.carAllowances.set(this.remunerationValue(remuneration.carAllowances));
      this.otherAllowances.set(this.remunerationValue(remuneration.otherAllowances));
    } else {
      this.mobileAllowances.set('');
      this.carAllowances.set('');
      this.otherAllowances.set('');
    }
    this.eobiApplicable.set((remuneration.eobiApplicable as 'Yes' | 'No' | '') || 'Yes');
    const pv = this.yesNoFromApiLocal(remuneration.providentApplicable) || 'No';
    this.providentApplicable.set(pv);
    this.socialSecurityApplicable.set(
      (remuneration.socialSecurityApplicable as 'Yes' | 'No' | '') ?? 'No',
    );
    this.fuelLimit.set(this.applicationFormService.formatFuelLimitForForm(remuneration.fuelLimit));

    const gratuityValue =
      remuneration.grauity?.trim() || remuneration.gratuityBalance?.trim() || '';
    this.gratuityBalance.set(gratuityValue);

    const leaveRows = detail.leaveManagement?.length
      ? detail.leaveManagement
      : remuneration.leaveType?.trim() || remuneration.leaveDays?.trim()
        ? [
            {
              leaveType: remuneration.leaveType ?? '',
              leavesAllocated: remuneration.leaveDays ?? '',
              leavesAvailed: remuneration.leavesAvailed ?? '',
              remainingLeave: remuneration.remainingLeaves ?? '',
            },
          ]
        : [];
    this.leaveManagementRows.set(
      leaveRows.length
        ? leaveRows.map((row) => ({
            leaveType: row.leaveType ?? '',
            leavesAllocated: row.leavesAllocated ?? '',
            leavesAvailed: row.leavesAvailed ?? '',
          }))
        : [{ leaveType: '', leavesAllocated: '', leavesAvailed: '' }],
    );

    const hrSettings = detail.hrSettings;
    if (hrSettings) {
      this.employeeMaster.set(hrSettings.employeeMaster ?? '');
      this.salaryStructure.set(hrSettings.salaryStructure ?? '');
      this.shiftTimeApplicable.set((hrSettings.attendanceShiftManagement as 'Yes' | 'No' | '') ?? '');
      this.loanAdvancesForm.set(hrSettings.loanAdvancesForm ?? '');
      this.requestStatus.set(hrSettings.requestStatus?.trim() || 'Pending');
      this.hrLeaveManagementSetting.set(hrSettings.leaveManagement?.trim() || 'Enabled');
    }

    this.employeeCode.set(
      this.applicationFormService.normalizeEmployeeCodeValue(
        detail.loginDetails.employeeCode || detail.loginDetails.userId,
      ),
    );
    this.legacyCode.set(detail.loginDetails.legacyCode || record.ExtEmpNo || '');
    this.userId.set(detail.loginDetails.userId);
    this.loginEmployeeName.set(detail.loginDetails.employeeName);
    this.password.set(detail.loginDetails.password);
    this.loginStatus.set(this.normalizeLoginStatus(detail.loginDetails.status));

    const assets = detail.assets;
    if (assets) {
      this.assetAllocated.set(assets.assetAllocated ?? '');
      this.assetOitmCode.set(assets.assetOitmCode ?? '');
      this.allocationStatus.set((assets.allocationStatus as 'Assigned' | 'Recovered' | '') ?? '');
      this.allocationDate.set(assets.allocationDate ?? '');
      this.allocationDateType.set(
        (assets.allocationDateType as 'Current Dated' | 'Back Dated' | '') ?? '',
      );
    }

    this.attachmentRows.set(
      detail.attachments.length
        ? detail.attachments.map((attachment) => ({
            file: null,
            type: attachment.type ?? attachment.attachmentFor ?? '',
            fileName: attachment.fileName ?? '',
            fileUrl: attachment.fileUrl ?? '',
          }))
        : [this.createEmptyAttachmentRow()],
    );

    const req = detail.requisition;
    this.copyExisting.set(req.copyExisting);
    this.reqId.set(req.reqId);
    this.selectedJobSpecId.set(req.reqId);
    this.internalJobTitle.set(req.internalJobTitle);
    this.recruiter.set(req.recruiter);
    this.recruitmentCollaborator.set(req.recruitmentCollaborator);
    this.requisitionAdministrator.set(req.requisitionAdministrator);
    this.recruitmentCoordinator.set(req.recruitmentCoordinator);
    this.hrAdministrator.set(req.hrAdministrator);
    this.company.set(
      req.company ||
      detail.personalInfo.employmentNature ||
      (record.EmployeeNature !== '—' ? record.EmployeeNature : '') ||
      'No Selection',
    );
    this.department.set(req.department || 'No Selection');
    this.division.set(
      req.division ||
      (record.EmploymentType !== '—' ? record.EmploymentType : '') ||
      'No Selection',
    );
    this.location.set(req.location || detail.personalInfo.branchLocation || '');
    this.hiringManager.set(
      detail.personalInfo.reportingManager ||
      req.hiringManager ||
      detail.requisition.hiringManager ||
      (record.ReportingManager !== '—' ? record.ReportingManager : ''),
    );
    this.cdr.markForCheck();
  }
}