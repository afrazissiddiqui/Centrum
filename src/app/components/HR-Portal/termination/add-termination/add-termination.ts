import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertService } from '../../../../services/alert.service';
import {
  ApplicationFormRecord,
  ApplicationFormService,
} from '../../../../services/application-form.service';
import {
  FinalSettlementAddPayload,
  TerminationRecord,
  TerminationService,
} from '../../../../services/termination.service';
import { formatApiErrorMessage } from '../../../../utils/api-error.util';
import { glAccountBranchLabel } from '../../../../components/setup/gl-account-determination/gl-account-branch.options';

function emptyIfDash(value: string): string {
  return value === '—' ? '' : value;
}

interface TerminationEmployeeOption {
  employeeId: string;
  employeeNumericId: number;
  employeeName: string;
  department: string;
  employeeCategory: string;
  designation: string;
  branchLocation: string;
  costCenter: string;
  workGradeLevel: string;
  dateOfJoining: string;
  grossMonthlySalary: string;
}

@Component({
  selector: 'app-add-termination',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-termination.html',
  styleUrls: [
    '../../Application-Form/create-job-requisition/create-job-requisition.css',
    '../../employee-action/probation-evaluation-form/add-probation-evaluation/add-probation-evaluation.css',
    './add-termination.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddTerminationComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly sectionIds = [
    'header-section',
    'dues-payable-section',
    'recoverable-amount-section',
  ] as const;

  private sectionObserver: IntersectionObserver | null = null;

  protected editingId: string | null = null;
  protected pageTitle = 'Employee Separation Form';
  protected submitButtonLabel = 'Save Employee Separation';

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly terminationService: TerminationService,
    private readonly applicationFormService: ApplicationFormService,
    private readonly alertService: AlertService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  private readonly employeeOptions = signal<TerminationEmployeeOption[]>([]);

  protected readonly activeSection = signal('header-section');
  protected readonly codeSuggestionsOpen = signal(false);
  protected readonly nameSuggestionsOpen = signal(false);
  protected readonly codeSuggestions = computed(() => this.filterEmployeeSuggestions(this.employeeId()));
  protected readonly nameSuggestions = computed(() => this.filterEmployeeSuggestions(this.employeeName()));

  protected readonly employeeId = signal('');
  protected readonly employeeNumericId = signal(0);
  protected readonly employeeName = signal('');
  protected readonly department = signal('');
  protected readonly employeeCategory = signal('');
  protected readonly designation = signal('');
  protected readonly branchLocation = signal('');
  protected readonly costCenter = signal('');
  protected readonly workGradeLevel = signal('');
  protected readonly lastWorkingDay = signal('');
  protected readonly yearOfService = signal('');
  protected readonly releasingDate = signal('');
  protected readonly grossMonthlySalary = signal('');
  protected readonly committeeMeetingHeld = signal<'Yes' | 'No' | ''>('');
  protected readonly separationType = signal('');

  protected readonly duesFromDate = signal('');
  protected readonly duesToDate = signal('');
  protected readonly noOfDaysSalaryNotPaid = signal('');
  protected readonly salaryPayable = signal('');
  protected readonly gratuity = signal('');
  protected readonly overtimeAmount = signal('');
  protected readonly noticePay = signal('');
  protected readonly leaveEncashmentAmount = signal('');
  protected readonly otherPayables = signal('');

  protected readonly salaryAdvances = signal('');
  protected readonly outstandingLoanBalance = signal('');
  protected readonly incomeTaxDeductions = signal('');
  protected readonly recoverableNoticePay = signal('');
  protected readonly leaveWithoutPay = signal('');
  protected readonly assetsHandledOver = signal<'Yes' | 'No' | ''>('');
  protected readonly assetRecovered = signal<'Yes' | 'No' | ''>('');
  protected readonly assetRecoveryName = signal('');
  protected readonly otherRecoverableAmounts = signal('');
  protected readonly sss = signal('');

  protected readonly totalDuesPayable = computed(() =>
    this.sumAmounts([
      this.salaryPayable(),
      this.gratuity(),
      this.overtimeAmount(),
      this.noticePay(),
      this.leaveEncashmentAmount(),
      this.otherPayables(),
    ]),
  );

  protected readonly totalRecoverableAmount = computed(() =>
    this.sumAmounts([
      this.salaryAdvances(),
      this.outstandingLoanBalance(),
      this.incomeTaxDeductions(),
      this.recoverableNoticePay(),
      this.leaveWithoutPay(),
      this.otherRecoverableAmounts(),
      this.sss(),
    ]),
  );

  protected readonly validationTouched = signal(false);

  ngOnInit(): void {
    this.applicationFormService.fetchEmployeeProfiles().subscribe({
      next: () => {
        this.employeeOptions.set(this.buildEmployeeOptions());
        this.recalculateLeaveEncashmentAmount();
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load employees for search.'),
        );
      },
    });

    const editId = this.route.snapshot.paramMap.get('id');
    if (!editId) {
      return;
    }

    this.editingId = editId;
    this.pageTitle = 'Update Employee Separation';
    this.submitButtonLabel = 'Update Employee Separation';

    this.terminationService.fetchFinalSettlementDetail(editId).subscribe({
      next: (record) => {
        this.populateFromRecord(record);
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load termination for edit.'),
        );
      },
    });
  }

  ngAfterViewInit(): void {
    this.initializeSectionObserver();
  }

  ngOnDestroy(): void {
    this.sectionObserver?.disconnect();
    this.sectionObserver = null;
  }

  protected scrollToSection(sectionId: string): void {
    this.activeSection.set(sectionId);
    setTimeout(() => {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 0);
  }

  protected back(): void {
    void this.router.navigateByUrl('/termination');
  }

  protected onEmployeeIdInput(value: string): void {
    this.employeeId.set(value);
    this.employeeNumericId.set(0);
    if (this.editingId) {
      return;
    }
    this.codeSuggestionsOpen.set(value.trim().length > 0);
    this.closeNameSuggestions();
  }

  protected onEmployeeNameInput(value: string): void {
    this.employeeName.set(value);
    if (this.editingId) {
      return;
    }
    this.nameSuggestionsOpen.set(value.trim().length > 0);
    this.closeCodeSuggestions();
  }

  protected openCodeSuggestions(): void {
    if (this.editingId || !this.employeeId().trim()) {
      return;
    }
    this.codeSuggestionsOpen.set(true);
    this.closeNameSuggestions();
  }

  protected openNameSuggestions(): void {
    if (this.editingId || !this.employeeName().trim()) {
      return;
    }
    this.nameSuggestionsOpen.set(true);
    this.closeCodeSuggestions();
  }

  protected closeCodeSuggestions(): void {
    this.codeSuggestionsOpen.set(false);
  }

  protected closeNameSuggestions(): void {
    this.nameSuggestionsOpen.set(false);
  }

  protected onCodeInputBlur(): void {
    setTimeout(() => this.closeCodeSuggestions(), 150);
  }

  protected onNameInputBlur(): void {
    setTimeout(() => this.closeNameSuggestions(), 150);
  }

  protected selectEmployee(employee: TerminationEmployeeOption): void {
    this.closeCodeSuggestions();
    this.closeNameSuggestions();
    this.populateFromEmployeeOption(employee);
    this.cdr.markForCheck();
  }

  protected onDuesFromDateChange(value: string): void {
    this.duesFromDate.set(value);
    this.recalculateNoOfDaysSalaryNotPaid();
  }

  protected onDuesToDateChange(value: string): void {
    this.duesToDate.set(value);
    this.recalculateNoOfDaysSalaryNotPaid();
  }

  protected onGrossMonthlySalaryChange(value: string): void {
    this.grossMonthlySalary.set(value);
    this.recalculateSalaryPayable();
    this.recalculateGratuity();
    this.recalculateLeaveEncashmentAmount();
  }

  protected save(): void {
    this.validationTouched.set(true);
    this.cdr.markForCheck();

    const employeeNumericId = this.resolvePayloadEmployeeId();
    const employeeName = this.employeeName().trim();
    const lastWorkingDay = this.lastWorkingDay().trim();
    const yearOfService = Number(this.yearOfService().trim());

    if (employeeNumericId <= 0) {
      void this.alertService.validation('Please select a valid employee or enter a numeric Employee ID.');
      this.scrollToSection('header-section');
      return;
    }
    const costCenter = this.costCenter().trim();
    if (!employeeName || !lastWorkingDay || !costCenter) {
      void this.alertService.validation('Please enter Employee Name, Cost Center, and Last Working Day.');
      this.scrollToSection('header-section');
      return;
    }
    if (!Number.isFinite(yearOfService) || yearOfService < 0) {
      void this.alertService.validation('Please enter a valid Year of Service.');
      this.scrollToSection('header-section');
      return;
    }

    const payload = this.buildPayload(employeeNumericId);
    const request$ = this.editingId
      ? this.terminationService.updateFinalSettlement(this.editingId, payload)
      : this.terminationService.addFinalSettlement(payload);

    request$.subscribe({
      next: async (response) => {
        if (response?.status === false || response?.success === false) {
          const fallback = this.editingId
            ? 'Failed to update termination.'
            : 'Failed to save termination.';
          void this.alertService.error('Error', response.message || fallback);
          this.cdr.markForCheck();
          return;
        }

        const title = this.editingId ? 'Updated' : 'Saved';
        const message = this.editingId
          ? response?.message || 'Termination updated successfully.'
          : response?.message || 'Termination saved successfully.';
        await this.alertService.successAndWait(title, message);
        this.terminationService.fetchFinalSettlements().subscribe();
        void this.router.navigateByUrl('/termination');
      },
      error: (error: unknown) => {
        const fallback = this.editingId
          ? 'Failed to update termination.'
          : 'Failed to save termination.';
        void this.alertService.error('Error', formatApiErrorMessage(error, fallback));
        this.cdr.markForCheck();
      },
    });
  }

  protected isInvalid(
    field: 'employeeId' | 'employeeName' | 'costCenter' | 'lastWorkingDay' | 'yearOfService',
  ): boolean {
    if (!this.validationTouched()) {
      return false;
    }

    if (field === 'employeeId') {
      return this.resolvePayloadEmployeeId() <= 0;
    }
    if (field === 'employeeName') {
      return !this.employeeName().trim();
    }
    if (field === 'costCenter') {
      return !this.costCenter().trim();
    }
    if (field === 'lastWorkingDay') {
      return !this.lastWorkingDay().trim();
    }
    const years = Number(this.yearOfService().trim());
    return !Number.isFinite(years) || years < 0;
  }

  private buildEmployeeOptions(): TerminationEmployeeOption[] {
    return this.applicationFormService
      .getApplicationRecords()
      .map((record) => this.toEmployeeOption(record))
      .filter((option) => option.employeeId || option.employeeName);
  }

  private toEmployeeOption(record: ApplicationFormRecord): TerminationEmployeeOption {
    const employeeId = this.resolveEmployeeCode(record);
    const personal = record.detail?.personalInfo;
    const requisition = record.detail?.requisition;
    const remuneration = record.detail?.remuneration;

    return {
      employeeId,
      employeeNumericId: this.resolveEmployeeNumericIdFromRecord(record, employeeId),
      employeeName: emptyIfDash(record.EmployeeName),
      department: emptyIfDash(record.Department),
      employeeCategory: emptyIfDash(record.EmploymentCategory),
      designation: emptyIfDash(personal?.designation ?? record.Designation ?? requisition?.internalJobTitle ?? ''),
      branchLocation: emptyIfDash(this.formatBranchLocation(personal?.branchLocation ?? requisition?.location ?? '')),
      costCenter: emptyIfDash(personal?.costCenter ?? requisition?.costCenter ?? ''),
      workGradeLevel: emptyIfDash(personal?.workGradeLevel ?? personal?.roleSalary ?? ''),
      dateOfJoining: emptyIfDash(remuneration?.dateOfJoining ?? ''),
      grossMonthlySalary: emptyIfDash(remuneration?.basicSalary ?? ''),
    };
  }

  private resolveEmployeeCode(record: ApplicationFormRecord): string {
    const fromLogin = record.detail?.loginDetails.employeeCode?.trim();
    if (fromLogin) {
      return fromLogin;
    }
    if (record.apiId?.trim()) {
      return record.apiId.trim();
    }
    if (record.EmployeeCode) {
      return String(record.EmployeeCode);
    }
    return '';
  }

  private resolveEmployeeNumericIdFromRecord(
    record: ApplicationFormRecord,
    employeeCode: string,
  ): number {
    if (record.apiId?.trim()) {
      const apiNumeric = Number(record.apiId.trim());
      if (Number.isFinite(apiNumeric) && apiNumeric > 0) {
        return apiNumeric;
      }
    }

    const fromCode = this.applicationFormService.parseEmployeeCodeSequence(
      record.EmployeeCode || employeeCode,
    );
    if (fromCode > 0) {
      return fromCode;
    }

    return this.resolveEmployeeNumericId(employeeCode);
  }

  private resolveEmployeeNumericId(value: string): number {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }

    if (!/[A-Za-z]/.test(trimmed)) {
      const direct = Number(trimmed);
      if (Number.isFinite(direct) && direct > 0) {
        return direct;
      }
    }

    return this.applicationFormService.parseEmployeeCodeSequence(trimmed);
  }

  private resolvePayloadEmployeeId(): number {
    const stored = this.employeeNumericId();
    if (stored > 0) {
      return stored;
    }

    const fromInput = this.resolveEmployeeNumericId(this.employeeId());
    if (fromInput > 0) {
      return fromInput;
    }

    const code = this.employeeId().trim();
    const match = this.employeeOptions().find((employee) => employee.employeeId === code);
    return match?.employeeNumericId ?? 0;
  }

  private filterEmployeeSuggestions(query: string): TerminationEmployeeOption[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }

    return this.employeeOptions()
      .filter(
        (employee) =>
          employee.employeeId.toLowerCase().includes(q) ||
          employee.employeeName.toLowerCase().includes(q) ||
          employee.department.toLowerCase().includes(q) ||
          employee.designation.toLowerCase().includes(q),
      )
      .slice(0, 10);
  }

  private populateFromEmployeeOption(employee: TerminationEmployeeOption): void {
    this.employeeId.set(employee.employeeId);
    this.employeeNumericId.set(employee.employeeNumericId);
    this.employeeName.set(employee.employeeName);
    this.department.set(employee.department);
    this.employeeCategory.set(employee.employeeCategory);
    this.designation.set(employee.designation);
    this.branchLocation.set(this.formatBranchLocation(employee.branchLocation));
    this.costCenter.set(employee.costCenter);
    this.workGradeLevel.set(employee.workGradeLevel);
    this.grossMonthlySalary.set(employee.grossMonthlySalary);
    this.yearOfService.set(this.calculateYearOfService(employee.dateOfJoining));
    this.recalculateSalaryPayable();
    this.recalculateGratuity();
    this.recalculateLeaveEncashmentAmount();
  }

  private formatBranchLocation(value: string): string {
    const trimmed = (value ?? '').toString().trim();
    if (!trimmed) {
      return '';
    }

    return glAccountBranchLabel(trimmed);
  }

  private calculateYearOfService(joiningDate: string): string {
    const trimmed = joiningDate.trim();
    if (!trimmed) {
      return '';
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    const now = new Date();
    const diffMs = now.getTime() - parsed.getTime();
    const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
    return years > 0 ? years.toFixed(1) : '';
  }

  private populateFromRecord(record: TerminationRecord): void {
    this.employeeNumericId.set(record.EmployeeId > 0 ? record.EmployeeId : 0);
    this.employeeId.set(record.EmployeeId > 0 ? String(record.EmployeeId) : '');
    this.employeeName.set(emptyIfDash(record.EmployeeName));
    this.department.set(emptyIfDash(record.Department));
    this.employeeCategory.set(emptyIfDash(record.EmployeeCategory));
    this.designation.set(emptyIfDash(record.Designation));
    this.branchLocation.set(emptyIfDash(this.formatBranchLocation(record.BranchLocation)));
    this.costCenter.set(emptyIfDash(record.CostCenter));
    this.workGradeLevel.set(emptyIfDash(record.WorkGradeLevel));
    this.lastWorkingDay.set(emptyIfDash(record.LastWorkingDay));
    this.yearOfService.set(record.YearOfService > 0 ? String(record.YearOfService) : '');
    this.releasingDate.set(emptyIfDash(record.ReleasingDate));
    this.grossMonthlySalary.set(emptyIfDash(record.GrossMonthlySalary));
    this.committeeMeetingHeld.set(
      record.CommitteeMeetingHeld === 'Yes' || record.CommitteeMeetingHeld === 'No'
        ? record.CommitteeMeetingHeld
        : '',
    );
    this.separationType.set(record.SeparationType ? String(record.SeparationType) : '');

    const dues = record.detail?.duesPayable;
    if (dues) {
      this.duesFromDate.set(dues.duesFromDate);
      this.duesToDate.set(dues.duesToDate);
      this.noOfDaysSalaryNotPaid.set(dues.noOfDaysSalaryNotPaid);
      this.salaryPayable.set(dues.salaryPayable);
      this.gratuity.set(dues.gratuity);
      this.overtimeAmount.set(dues.overtimeAmount);
      this.noticePay.set(dues.noticePay);
      this.leaveEncashmentAmount.set(dues.leaveEncashmentAmount);
      this.otherPayables.set(dues.otherPayables);
    }

    this.recalculateSalaryPayable();
    this.recalculateGratuity();
    this.recalculateLeaveEncashmentAmount();

    const recoverable = record.detail?.recoverableAmount;
    if (recoverable) {
      this.salaryAdvances.set(recoverable.salaryAdvances);
      this.outstandingLoanBalance.set(recoverable.outstandingLoanBalance);
      this.incomeTaxDeductions.set(recoverable.incomeTaxDeductions);
      this.recoverableNoticePay.set(recoverable.recoverableNoticePay);
      this.leaveWithoutPay.set(recoverable.leaveWithoutPay);
      this.assetsHandledOver.set(
        recoverable.assetsHandledOver === 'Yes' || recoverable.assetsHandledOver === 'No'
          ? recoverable.assetsHandledOver
          : '',
      );
      this.assetRecovered.set(
        recoverable.assetRecovered === 'Yes' || recoverable.assetRecovered === 'No'
          ? recoverable.assetRecovered
          : '',
      );
      this.assetRecoveryName.set(recoverable.assetRecoveryName);
      this.otherRecoverableAmounts.set(recoverable.otherRecoverableAmounts);
      this.sss.set(recoverable.sss);
    }
  }

  private buildPayload(employeeNumericId: number): FinalSettlementAddPayload {
    return {
      headerSection: {
        employeeId: employeeNumericId,
        employeeName: this.employeeName().trim(),
        department: this.department().trim(),
        employeeCategory: this.employeeCategory().trim(),
        designation: this.designation().trim(),
        branchLocation: this.branchLocation().trim(),
        costCenter: this.costCenter().trim(),
        workGradeLevel: this.workGradeLevel().trim(),
        lastWorkingDay: this.lastWorkingDay().trim(),
        yearOfService: this.toNumber(this.yearOfService()),
        releasingDate: this.releasingDate().trim(),
        grossMonthlySalary: this.toNumber(this.grossMonthlySalary()),
        committeeMeetingHeld: this.committeeMeetingHeld() || '',
        separationType: this.separationType() || '',
      },
      duesPayable: {
        duesFromDate: this.duesFromDate().trim(),
        duesToDate: this.duesToDate().trim(),
        noOfDaysSalaryNotPaid: this.toNumber(this.noOfDaysSalaryNotPaid()),
        salaryPayable: this.toNumber(this.salaryPayable()),
        gratuity: this.toNumber(this.gratuity()),
        overtimeAmount: this.toNumber(this.overtimeAmount()),
        noticePay: this.toNumber(this.noticePay()),
        leaveEncashmentAmount: this.toNumber(this.leaveEncashmentAmount()),
        otherPayables: this.toNumber(this.otherPayables()),
        totalDuesPayable: this.totalDuesPayable(),
      },
      recoverableAmountSection: {
        salaryAdvances: this.toNumber(this.salaryAdvances()),
        outstandingLoanBalance: this.toNumber(this.outstandingLoanBalance()),
        incomeTaxDeductions: this.toNumber(this.incomeTaxDeductions()),
        recoverableNoticePay: this.toNumber(this.recoverableNoticePay()),
        leaveWithoutPay: this.toNumber(this.leaveWithoutPay()),
        assetsHandledOver: this.assetsHandledOver() || '',
        assetRecovered: this.assetRecovered() || '',
        assetRecoveryName: this.assetRecoveryName().trim(),
        otherRecoverableAmounts: this.toNumber(this.otherRecoverableAmounts()),
        sss: this.toNumber(this.sss()),
        totalRecoverableAmount: this.totalRecoverableAmount(),
      },
    };
  }

  private sumAmounts(values: string[]): number {
    return values.reduce((sum, value) => sum + this.toNumber(value), 0);
  }

  private recalculateNoOfDaysSalaryNotPaid(): void {
    const fromDate = this.duesFromDate().trim();
    const toDate = this.duesToDate().trim();

    if (!fromDate || !toDate) {
      this.noOfDaysSalaryNotPaid.set('');
      this.cdr.markForCheck();
      return;
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      this.noOfDaysSalaryNotPaid.set('');
      this.cdr.markForCheck();
      return;
    }

    const diffMs = to.getTime() - from.getTime();
    const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
    this.noOfDaysSalaryNotPaid.set(String(diffDays));
    this.recalculateSalaryPayable();
    this.cdr.markForCheck();
  }

  private recalculateSalaryPayable(): void {
    const grossSalary = this.toNumber(this.grossMonthlySalary());
    const daysNotPaid = this.toNumber(this.noOfDaysSalaryNotPaid());

    if (!grossSalary || !daysNotPaid) {
      this.salaryPayable.set('');
      this.cdr.markForCheck();
      return;
    }

    const referenceDate = this.duesToDate().trim() || this.duesFromDate().trim();
    if (!referenceDate) {
      this.salaryPayable.set('');
      this.cdr.markForCheck();
      return;
    }

    const parsedDate = new Date(referenceDate);
    if (Number.isNaN(parsedDate.getTime())) {
      this.salaryPayable.set('');
      this.cdr.markForCheck();
      return;
    }

    const daysInMonth = new Date(parsedDate.getFullYear(), parsedDate.getMonth() + 1, 0).getDate();
    if (daysInMonth <= 0) {
      this.salaryPayable.set('');
      this.cdr.markForCheck();
      return;
    }

    const payable = (grossSalary * daysNotPaid) / daysInMonth;
    this.salaryPayable.set(String(payable.toFixed(2)));
    this.cdr.markForCheck();
  }

  private recalculateGratuity(): void {
    const grossSalary = this.toNumber(this.grossMonthlySalary());
    const yearsOfService = this.toNumber(this.yearOfService());

    if (!grossSalary || !yearsOfService) {
      this.gratuity.set('');
      this.cdr.markForCheck();
      return;
    }

    const gratuity = grossSalary * yearsOfService;
    this.gratuity.set(String(gratuity.toFixed(2)));
    this.cdr.markForCheck();
  }

  private recalculateLeaveEncashmentAmount(): void {
    const grossSalary = this.toNumber(this.grossMonthlySalary());
    const remainingLeaves = this.toNumber(this.getRemainingLeavesFromApplicationForm());

    if (!grossSalary || !remainingLeaves) {
      this.leaveEncashmentAmount.set('');
      this.cdr.markForCheck();
      return;
    }

    const leaveEncashmentAmount = (grossSalary * remainingLeaves * 12) / 365;
    this.leaveEncashmentAmount.set(String(leaveEncashmentAmount.toFixed(2)));
    this.cdr.markForCheck();
  }

  private getRemainingLeavesFromApplicationForm(): string {
    const employee = this.employeeOptions().find((option) => option.employeeNumericId === this.employeeNumericId());
    if (!employee) {
      return '';
    }

    const selectedEmployeeCode = this.employeeId().trim();
    const record = this.applicationFormService.getApplicationRecords().find((item) => {
      const resolvedCode = this.resolveEmployeeCode(item);
      const resolvedNumericId = this.resolveEmployeeNumericIdFromRecord(item, resolvedCode);
      return (
        resolvedNumericId > 0 && resolvedNumericId === employee.employeeNumericId
      ) || (selectedEmployeeCode && resolvedCode === selectedEmployeeCode);
    });

    if (!record?.detail) {
      return '';
    }

    const remunerationLeaves = this.normalizeLeaveValue(record.detail.remuneration?.remainingLeaves);
    if (remunerationLeaves) {
      return remunerationLeaves;
    }

    const leaveRows = Array.isArray(record.detail.leaveManagement) ? record.detail.leaveManagement : [];
    const summedRemainingLeaves = leaveRows.reduce((sum, row) => {
      const value = this.normalizeLeaveValue(row?.remainingLeave);
      if (!value) {
        return sum;
      }

      const numeric = Number(value);
      return Number.isFinite(numeric) ? sum + numeric : sum;
    }, 0);

    return summedRemainingLeaves > 0 ? String(summedRemainingLeaves) : '';
  }

  private normalizeLeaveValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    return String(value).trim();
  }

  private toNumber(value: string): number {
    const numeric = Number((value ?? '').toString().replace(/,/g, '').trim());
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private initializeSectionObserver(): void {
    const sections = this.sectionIds
      .map((sectionId) => document.getElementById(sectionId))
      .filter((section): section is HTMLElement => section !== null);

    if (!sections.length) {
      return;
    }

    const visibleSections = new Map<string, number>();
    this.sectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sectionId = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) {
            visibleSections.set(sectionId, entry.intersectionRatio);
          } else {
            visibleSections.delete(sectionId);
          }
        }

        if (!visibleSections.size) {
          return;
        }

        const nextActiveSection = [...visibleSections.entries()].sort((left, right) => {
          return right[1] - left[1];
        })[0]?.[0];

        if (nextActiveSection) {
          this.activeSection.set(nextActiveSection);
        }
      },
      {
        root: null,
        rootMargin: '-120px 0px -55% 0px',
        threshold: [0.2, 0.35, 0.5, 0.7],
      },
    );

    for (const section of sections) {
      this.sectionObserver.observe(section);
    }
  }
}
