import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AlertService } from '../../../../../services/alert.service';
import { LoanAdvanceRecord, LoanAdvancePayload, LoanAdvanceService } from '../../../../../services/loan-advance.service';
import { ApplicationFormService, ApplicationFormRecord } from '../../../../../services/application-form.service';
import { GlAccountDeterminationService } from '../../../../../services/gl-account-determination.service';
import { formatApiErrorMessage } from '../../../../../utils/api-error.util';
import { formatApiToDateSlash, formatDateForInput, formatDateSlashToApi } from '../../../../../utils/date-format.util';
import {
  GL_ACCOUNT_BRANCH_OPTIONS,
  glAccountBranchLabel,
} from '../../../../setup/gl-account-determination/gl-account-branch.options';

interface LoanEmployeeOption {
  code: string;
  name: string;
  department: string;
  designation: string;
  branch: string;
  dateOfJoining: string;
  eligibleAmount: string;
  advanceEligibleAmount: string;
  employeeNature: string;
  employmentType: string;
  workGradeLevel: string;
  jobTitle: string;
  employeeCategory: string;
  reportingManager: string;
}

@Component({
  selector: 'app-add-loan-advance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-loan-advance.html',
  styleUrls: [
    '../../../Application-Form/create-job-requisition/create-job-requisition.css',
    '../../probation-evaluation-form/add-probation-evaluation/add-probation-evaluation.css',
    './add-loan-advance.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AddLoanAdvanceComponent implements OnInit {
  pageTitle = 'Add Loan/Advance';
  submitButtonLabel = 'Save Loan/Advance';

  get pageSubtitle(): string {
    return 'Submit employee loan or salary advance requests with repayment details.';
  }

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly alertService: AlertService,
    private readonly loanAdvanceService: LoanAdvanceService,
    private readonly applicationFormService: ApplicationFormService,
    private readonly glAccountDeterminationService: GlAccountDeterminationService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  private readonly employeeOptions = signal<LoanEmployeeOption[]>([]);
  private editingId: string | null = null;

  protected readonly activeSection = signal('header-info-section');
  protected readonly documentNo = signal(this.generateDocumentNo());
  protected readonly headerEmployeeID = signal('');
  protected readonly headerEmployeeName = signal('');
  protected readonly codeSuggestionsOpen = signal(false);
  protected readonly nameSuggestionsOpen = signal(false);
  protected readonly codeSuggestions = computed(() =>
    this.filterEmployeeSuggestions(this.headerEmployeeID()),
  );
  protected readonly nameSuggestions = computed(() =>
    this.filterEmployeeSuggestions(this.headerEmployeeName()),
  );
  protected readonly designation = signal('');
  protected readonly branchOptions = GL_ACCOUNT_BRANCH_OPTIONS;
  protected readonly branch = signal('');
  protected readonly employeeNature = signal('');
  protected readonly employmentType = signal('');
  protected readonly workGradeLevel = signal('');
  protected readonly jobTitle = signal('');
  protected readonly employeeCategory = signal('');
  protected readonly reportingManager = signal('');
  protected readonly requestType = signal('');
  protected readonly requestTypeOptions = signal<string[]>([]);
  protected readonly requestDate = signal(this.getTodayDateDisplay());
  protected readonly status = signal('');
  protected readonly joiningDate = signal('');
  protected readonly department = signal('');
  protected readonly payrollMonth = signal(this.getCurrentPayrollMonth());
  protected readonly yearsOfService = computed(() =>
    this.calculateYearsOfService(this.joiningDate()),
  );
  protected readonly existingLoan = signal<'Yes' | 'No' | ''>('');
  protected readonly loanAcquiredDate = signal('');
  protected readonly installmentNumber = signal('');
  protected readonly loanEndingDate = signal('');
  protected readonly previousInstallmentAmount = signal('');
  protected readonly previousLoanPurpose = signal('');
  protected readonly loanAmount = signal('');
  protected readonly loanAmountDeductedTillNow = signal('');
  protected readonly loanBalance = computed(() =>
    this.calculateBalance(this.loanAmount(), this.loanAmountDeductedTillNow()),
  );
  protected readonly newLoanPurpose = signal('');
  protected readonly loanAmountRequested = signal('');
  protected readonly noOfInstallments = computed(() =>
    this.loanTenure(),
  );
  protected readonly loanEndMonth = signal('');
  protected readonly loanStartMonth = signal('');
  protected readonly loanTenure = computed(() =>
    this.calculateLoanTenure(this.loanStartMonth(), this.loanEndMonth()),
  );
  protected readonly installmentAmount = computed(() =>
    this.calculateInstallmentAmount(this.loanAmountRequested(), this.noOfInstallments()),
  );
  protected readonly eligibleAmount = signal('');
  protected readonly remarks = signal('');
  protected readonly existingAdvance = signal<'Yes' | 'No' | ''>('');
  protected readonly advanceAcquiredDate = signal('');
  protected readonly previousAdvancePurpose = signal('');
  protected readonly advanceAmount = signal('');
  protected readonly advanceAmountToBeDeductedThisMonth = signal('');
  protected readonly advanceBalance = signal('');
  protected readonly advanceEligibleAmount = signal('');
  protected readonly advanceRemarks = signal('');
  protected readonly newAdvancePurpose = signal('');
  protected readonly newAdvanceAmountEligible = signal('');
  protected readonly newAdvanceAmountRequested = signal('');
  protected readonly repaymentStartDate = signal('');
  protected readonly repaymentFrequency = signal('');
  protected readonly deductionAmount = signal('');
  protected readonly repaymentRemarks = signal('');
  protected readonly repaymentScheduleRows = computed(() => {
    const start = this.parseMonthValue(this.loanStartMonth());
    const end = this.parseMonthValue(this.loanEndMonth());
    const installmentText = this.installmentAmount() || this.deductionAmount();
    const loanAmountValue = this.parseDecimal(this.loanAmountRequested() || this.loanAmount());
    const installmentValue = this.parseDecimal(installmentText) ?? 0;

    if (!start || !end) {
      return [];
    }

    const totalMonths = (end.year - start.year) * 12 + (end.month - start.month) + 1;
    if (totalMonths <= 0) {
      return [];
    }

    return Array.from({ length: totalMonths }, (_, index) => {
      const absoluteMonth = start.month - 1 + index;
      const year = start.year + Math.floor(absoluteMonth / 12);
      const month = (absoluteMonth % 12) + 1;
      const deducted = installmentValue * (index + 1);
      const rawBalance = loanAmountValue === null ? null : Math.max(loanAmountValue - deducted, 0);

      return {
        sr: index + 1,
        monthLabel: this.formatMonthLabel(year, month),
        installment: installmentText,
        balance: rawBalance === null ? '' : this.formatDecimal(rawBalance),
        status: 'Payable',
      };
    });
  });

  protected readonly isLoanRequest = computed(() => /\bloans?\b/i.test(this.requestType()));
  protected readonly isAdvanceRequest = computed(() => /\badvances?\b/i.test(this.requestType()));
  protected readonly hasExistingLoanDetails = signal(false);
  protected readonly hasExistingAdvanceDetails = signal(false);
  protected readonly isEditing = signal(false);
  protected readonly existingLoanFieldsLocked = computed(() => !this.isEditing() && this.isLoanRequest());
  protected readonly newLoanRequestLocked = computed(() => !this.isEditing() && this.hasExistingLoanDetails());
  protected readonly existingAdvanceFieldsLocked = computed(() => !this.isEditing() && this.isAdvanceRequest());
  protected readonly newAdvanceRequestLocked = computed(() => !this.isEditing() && this.hasExistingAdvanceDetails());
  protected readonly saving = signal(false);

  ngOnInit(): void {
    this.glAccountDeterminationService.fetchLoanAdvanceRequestTypeOptions().subscribe({
      next: (options) => {
        this.requestTypeOptions.set(options);
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load loan/advance request types.'),
        );
      },
    });

    this.applicationFormService.fetchEmployeeProfiles().subscribe({
      next: () => {
        this.employeeOptions.set(this.buildEmployeeOptions());
        if (this.editingId) {
          this.populateLoanEligibleFromProfile();
        }
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load employees for search.'),
        );
      },
    });

    this.loanAdvanceService.fetchLoanAdvances().subscribe({
      error: () => {
        // Keep the form usable even if prior loan history cannot be loaded.
      },
    });

    const editId = this.route.snapshot.paramMap.get('id');
    if (!editId) {
      return;
    }

    this.editingId = editId;
    this.isEditing.set(true);
    this.pageTitle = 'Update Loan/Advance';
    this.submitButtonLabel = 'Update Loan/Advance';
    this.loadRecordForEdit(editId);
  }

  private loadRecordForEdit(editId: string): void {
    const applyRecord = (record: LoanAdvanceRecord): void => {
      this.populateFromRecord(record);
      this.cdr.markForCheck();
    };

    const state = history.state as {
      loanAdvanceRecord?: LoanAdvanceRecord;
      loanAdvancePayload?: LoanAdvancePayload;
    };

    if (state?.loanAdvancePayload) {
      applyRecord(this.loanAdvanceService.buildRecordFromPayload(editId, state.loanAdvancePayload));
    } else if (state?.loanAdvanceRecord) {
      applyRecord(state.loanAdvanceRecord);
    } else {
      const cachedPayload = this.loanAdvanceService.getCachedPayload(editId);
      if (cachedPayload) {
        applyRecord(this.loanAdvanceService.buildRecordFromPayload(editId, cachedPayload));
      } else {
        const cachedRecord = this.loanAdvanceService.findLoanById(editId);
        if (cachedRecord) {
          applyRecord(cachedRecord);
        }
      }
    }

    this.loanAdvanceService.loadRecordForEdit(editId).subscribe({
      next: (record) => {
        if (record?.Id) {
          applyRecord(record);
        }
      },
      error: (error: unknown) => {
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load loan/advance for edit.'),
        );
      },
    });
  }

  protected onRequestTypeChange(type: string): void {
    this.requestType.set(type);
    if (this.editingId) {
      return;
    }
    this.refreshExistingDetailsForEmployee();
    this.cdr.markForCheck();
  }

  protected back(): void {
    void this.router.navigateByUrl('/employee-action/loan-advance-form');
  }

  protected selectEmployee(employee: LoanEmployeeOption): void {
    this.closeCodeSuggestions();
    this.closeNameSuggestions();
    this.populateFromEmployeeOption(employee);
    this.cdr.markForCheck();
  }

  protected onEmployeeCodeChange(code: string): void {
    this.headerEmployeeID.set(code);
    if (this.editingId) {
      return;
    }
    this.codeSuggestionsOpen.set(code.trim().length > 0);
    this.closeNameSuggestions();
  }

  protected onEmployeeNameChange(name: string): void {
    this.headerEmployeeName.set(name);
    if (this.editingId) {
      return;
    }
    this.nameSuggestionsOpen.set(name.trim().length > 0);
    this.closeCodeSuggestions();
  }

  protected openCodeSuggestions(): void {
    if (this.editingId || !this.headerEmployeeID().trim()) {
      return;
    }
    this.codeSuggestionsOpen.set(true);
    this.closeNameSuggestions();
  }

  protected openNameSuggestions(): void {
    if (this.editingId || !this.headerEmployeeName().trim()) {
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

  protected onLoanAmountRequestedChange(value: string): void {
    const eligible = this.parseDecimal(this.eligibleAmount());
    const requested = this.parseDecimal(value);

    if (eligible !== null && requested !== null && requested > eligible) {
      this.loanAmountRequested.set(this.eligibleAmount());
      return;
    }

    this.loanAmountRequested.set(value);
  }

  protected onAdvanceAmountRequestedChange(value: string): void {
    const eligible = this.parseDecimal(this.newAdvanceAmountEligible());
    const requested = this.parseDecimal(value);

    if (eligible !== null && requested !== null && requested > eligible) {
      this.newAdvanceAmountRequested.set(this.newAdvanceAmountEligible());
      return;
    }

    this.newAdvanceAmountRequested.set(value);
  }

  private buildEmployeeOptions(): LoanEmployeeOption[] {
    return this.applicationFormService
      .getApplicationRecords()
      .map((record) => this.toEmployeeOption(record))
      .filter((option) => option.code || option.name);
  }

  private toEmployeeOption(record: ApplicationFormRecord): LoanEmployeeOption {
    const emptyIfDash = (value: string): string => (value === '—' ? '' : value);
    const remuneration = record.detail?.remuneration;
    const loanAmountAllowed = remuneration?.loanAmountAllowed;

    return {
      code: this.resolveEmployeeCode(record),
      name: emptyIfDash(record.EmployeeName),
      department: emptyIfDash(record.Department),
      designation: emptyIfDash(record.Designation),
      branch: glAccountBranchLabel(
        emptyIfDash(record.detail?.personalInfo.branchLocation ?? '') ||
          emptyIfDash(record.detail?.requisition.location ?? ''),
      ),
      dateOfJoining: formatDateForInput(
        emptyIfDash(record.detail?.remuneration?.dateOfJoining ?? ''),
      ),
      eligibleAmount: emptyIfDash(
        loanAmountAllowed?.trim() ? loanAmountAllowed : remuneration?.maximumLoanCapacity ?? '',
      ),
      advanceEligibleAmount: emptyIfDash(
        record.detail?.remuneration
          ? this.applicationFormService.resolveMaximumAdvanceCapacity(record.detail.remuneration)
          : '',
      ),
      employeeNature: emptyIfDash(record.EmployeeNature),
      employmentType: emptyIfDash(record.EmploymentType),
      workGradeLevel: emptyIfDash(record.detail?.requisition.costCenter ?? ''),
      jobTitle:
        emptyIfDash(record.detail?.requisition.internalJobTitle ?? '') ||
        emptyIfDash(record.Designation),
      employeeCategory: emptyIfDash(record.EmploymentCategory),
      reportingManager: emptyIfDash(record.ReportingManager),
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

  private filterEmployeeSuggestions(query: string): LoanEmployeeOption[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }

    return this.employeeOptions()
      .filter(
        (employee) =>
          employee.code.toLowerCase().includes(q) ||
          employee.name.toLowerCase().includes(q) ||
          employee.department.toLowerCase().includes(q) ||
          employee.designation.toLowerCase().includes(q),
      )
      .slice(0, 10);
  }

  private populateFromEmployeeOption(employee: LoanEmployeeOption): void {
    this.headerEmployeeID.set(employee.code);
    this.headerEmployeeName.set(employee.name);
    this.department.set(employee.department);
    this.designation.set(employee.designation);
    this.branch.set(employee.branch);
    this.joiningDate.set(employee.dateOfJoining);
    this.eligibleAmount.set(employee.eligibleAmount);
    this.newAdvanceAmountEligible.set(employee.advanceEligibleAmount);
    this.employeeNature.set(employee.employeeNature);
    this.employmentType.set(employee.employmentType);
    this.workGradeLevel.set(employee.workGradeLevel);
    this.jobTitle.set(employee.jobTitle);
    this.employeeCategory.set(employee.employeeCategory);
    this.reportingManager.set(employee.reportingManager);
    this.refreshExistingDetailsForEmployee();
  }

  private refreshExistingDetailsForEmployee(): void {
    if (this.editingId) {
      return;
    }

    const code = this.headerEmployeeID();
    const name = this.headerEmployeeName();
    if (!code.trim() && !name.trim()) {
      return;
    }

    if (this.isLoanRequest()) {
      this.clearAdvanceDetailState();
      this.populateExistingLoanDetails(code, name);
      return;
    }

    if (this.isAdvanceRequest()) {
      this.clearLoanDetailState();
      this.populateExistingAdvanceDetails(code, name);
    }
  }

  private clearLoanDetailState(): void {
    this.hasExistingLoanDetails.set(false);
    this.resetExistingLoanFields();
    this.resetNewLoanRequestFields();
    this.existingLoan.set('');
  }

  private clearAdvanceDetailState(): void {
    this.hasExistingAdvanceDetails.set(false);
    this.resetExistingAdvanceFields();
    this.resetNewAdvanceRequestFields();
    this.existingAdvance.set('');
  }

  private resetNewLoanRequestFields(): void {
    this.newLoanPurpose.set('');
    this.loanAmountRequested.set('');
    this.loanStartMonth.set('');
    this.loanEndMonth.set('');
    this.remarks.set('');
  }

  private resetNewAdvanceRequestFields(): void {
    this.newAdvancePurpose.set('');
    this.newAdvanceAmountEligible.set('');
    this.newAdvanceAmountRequested.set('');
  }

  private populateFromRecord(record: LoanAdvanceRecord): void {
    this.documentNo.set(this.pickRecordValue(record.HeaderInfo.documentNo, record.DocumentNo));
    this.requestType.set(this.pickRecordValue(record.HeaderInfo.requestType, record.RequestType));
    this.headerEmployeeID.set(this.pickRecordValue(record.HeaderInfo.employeeID, record.EmployeeID));
    this.headerEmployeeName.set(this.pickRecordValue(record.HeaderInfo.employeeName, record.EmployeeName));
    this.department.set(this.pickRecordValue(record.HeaderInfo.department, record.Department));
    this.designation.set(this.pickRecordValue(record.HeaderInfo.designation, record.Designation));
    this.branch.set(this.pickRecordValue(record.HeaderInfo.location, record.Location));
    this.joiningDate.set(formatDateForInput(this.pickRecordValue(record.HeaderInfo.joiningDate, record.JoiningDate)));
    this.requestDate.set(this.normalizeDisplayDate(this.pickRecordValue(record.HeaderInfo.requestDate, record.RequestDate)));
    this.payrollMonth.set(this.pickRecordValue(record.HeaderInfo.payrollMonth, record.PayrollMonth));
    this.status.set(this.pickRecordValue(record.HeaderInfo.status, record.Status, 'Payable'));
    this.employeeNature.set(this.pickRecordValue(record.HeaderInfo.employeeNature, record.EmployeeNature));
    this.employmentType.set(this.pickRecordValue(record.HeaderInfo.employmentType, record.EmploymentType));
    this.workGradeLevel.set(this.pickRecordValue(record.HeaderInfo.workGradeLevel, record.WorkGradeLevel));
    this.jobTitle.set(this.pickRecordValue(record.HeaderInfo.jobTitle, record.JobTitle));
    this.employeeCategory.set(this.pickRecordValue(record.HeaderInfo.employeeCategory, record.EmployeeCategory));
    this.reportingManager.set(this.pickRecordValue(record.HeaderInfo.reportingManager, record.ReportingManager));

    this.hasExistingLoanDetails.set((record.LoanDetail.existingLoan || '').trim().toLowerCase() === 'yes');
    this.hasExistingAdvanceDetails.set((record.AdvanceDetail.existingAdvance || '').trim().toLowerCase() === 'yes');
    this.existingLoan.set((record.LoanDetail.existingLoan as 'Yes' | 'No' | '') || '');
    this.loanAcquiredDate.set(this.normalizeMonthInput(record.LoanDetail.loanAcquiredDate));
    this.installmentNumber.set(record.LoanDetail.installmentNumber?.trim() ?? '');
    this.loanEndingDate.set(this.normalizeMonthInput(record.LoanDetail.loanEndingDate));
    this.previousInstallmentAmount.set(record.LoanDetail.previousInstallmentAmount?.trim() ?? '');
    this.previousLoanPurpose.set(record.LoanDetail.previousLoanPurpose?.trim() ?? '');
    this.loanAmount.set(record.LoanDetail.loanAmount?.trim() ?? '');
    this.loanAmountDeductedTillNow.set(record.LoanDetail.loanAmountDeductedTillNow?.trim() ?? '');

    this.newLoanPurpose.set(
      this.pickRecordValue(record.LoanDetail.newLoanRequest.purpose, record.LoanPurpose),
    );
    this.loanAmountRequested.set(
      this.pickRecordValue(record.LoanDetail.newLoanRequest.loanAmountRequested, record.LoanAmountRequested),
    );
    this.loanEndMonth.set(
      this.normalizeMonthInput(
        this.pickRecordValue(record.LoanDetail.newLoanRequest.loanEndMonth, ''),
      ),
    );
    this.loanStartMonth.set(
      this.normalizeMonthInput(
        this.pickRecordValue(record.LoanDetail.newLoanRequest.loanStartMonth, ''),
      ),
    );
    this.eligibleAmount.set(
      this.pickRecordValue(record.LoanDetail.newLoanRequest.eligibleAmount, record.LoanEligibleAmount),
    );
    this.remarks.set(record.LoanDetail.remarks?.trim() ?? '');

    this.existingAdvance.set((record.AdvanceDetail.existingAdvance as 'Yes' | 'No' | '') || '');
    this.advanceAcquiredDate.set(formatDateForInput(record.AdvanceDetail.advanceAcquiredDate ?? ''));
    this.advanceEligibleAmount.set(record.AdvanceDetail.advanceEligibleAmount?.trim() ?? '');
    this.previousAdvancePurpose.set(record.AdvanceDetail.previousAdvancePurpose?.trim() ?? '');
    this.advanceRemarks.set(record.AdvanceDetail.advanceRemarks?.trim() ?? '');
    this.advanceAmount.set(record.AdvanceDetail.advanceAmount?.trim() ?? '');
    this.advanceAmountToBeDeductedThisMonth.set(
      record.AdvanceDetail.advanceAmountToBeDeductedThisMonth?.trim() ?? '',
    );
    this.advanceBalance.set(record.AdvanceDetail.advanceBalance?.trim() ?? '');
    this.newAdvancePurpose.set(
      this.pickRecordValue(record.AdvanceDetail.newAdvanceRequest.purpose, record.AdvancePurpose),
    );
    this.newAdvanceAmountEligible.set(
      this.pickRecordValue(
        record.AdvanceDetail.newAdvanceRequest.advanceAmountEligible,
        record.AdvanceEligibleAmount,
      ),
    );
    this.newAdvanceAmountRequested.set(
      this.pickRecordValue(
        record.AdvanceDetail.newAdvanceRequest.advanceAmountRequested,
        record.AdvanceAmountRequested,
      ),
    );

    this.repaymentStartDate.set(
      formatDateForInput(
        this.pickRecordValue(record.RepaymentSchedule.repaymentStartDate, record.RepaymentStartDate),
      ),
    );
    this.repaymentFrequency.set(
      this.pickRecordValue(record.RepaymentSchedule.repaymentFrequency, record.RepaymentFrequency),
    );
    this.deductionAmount.set(
      this.pickRecordValue(
        record.RepaymentSchedule.installmentAmount,
        record.RepaymentSchedule.deductionAmount,
        record.DeductionAmount,
      ),
    );
    this.repaymentRemarks.set(record.RepaymentSchedule.remarks?.trim() ?? '');
    this.populateLoanEligibleFromProfile();
  }

  private pickRecordValue(...values: Array<string | undefined>): string {
    for (const value of values) {
      const text = (value ?? '').trim();
      if (text && text !== '—' && text.toLowerCase() !== 'null' && text.toLowerCase() !== 'undefined') {
        return text;
      }
    }
    return '';
  }

  private generateDocumentNo(): string {
    return `LA-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }

  private getTodayDateDisplay(): string {
    return formatApiToDateSlash(new Date().toISOString().split('T')[0]);
  }

  private getCurrentPayrollMonth(): string {
    const today = new Date();
    return today.toISOString().slice(0, 7);
  }

  private calculateYearsOfService(joiningDateValue: string): string {
    const joining = joiningDateValue.trim();
    if (!joining) {
      return '';
    }

    const joiningDate = new Date(joining);
    if (Number.isNaN(joiningDate.getTime())) {
      return '';
    }

    const now = new Date();
    if (now.getTime() < joiningDate.getTime()) {
      return '';
    }

    let completedMonths =
      (now.getFullYear() - joiningDate.getFullYear()) * 12 +
      (now.getMonth() - joiningDate.getMonth());
    if (now.getDate() < joiningDate.getDate()) {
      completedMonths--;
    }

    if (completedMonths < 0) {
      return '';
    }

    if (completedMonths < 12) {
      const serviceMonths = completedMonths > 0 ? completedMonths : 1;
      return (serviceMonths / 10).toFixed(1);
    }

    return `${Math.floor(completedMonths / 12)}`;
  }

  private calculateBalance(amountValue: string, deductedValue: string): string {
    const amount = this.parseDecimal(amountValue);
    const deducted = this.parseDecimal(deductedValue);

    if (amount === null && deducted === null) {
      return '';
    }

    const balance = (amount ?? 0) - (deducted ?? 0);
    return Number.isInteger(balance) ? `${balance}` : `${balance.toFixed(2)}`;
  }

  private parseDecimal(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const normalized = trimmed.replace(/,/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private calculateInstallmentAmount(requestedValue: string, installmentCountValue: string): string {
    const requested = this.parseDecimal(requestedValue);
    const installmentCount = this.parseDecimal(installmentCountValue);

    if (requested === null || installmentCount === null || installmentCount <= 0) {
      return '';
    }

    const amount = requested / installmentCount;
    return this.formatDecimal(amount);
  }

  private calculateLoanTenure(startMonth: string, endMonth: string): string {
    const start = this.parseMonthValue(startMonth);
    const end = this.parseMonthValue(endMonth);

    if (!start || !end) {
      return '';
    }

    const totalMonths =
      (end.year - start.year) * 12 +
      (end.month - start.month) +
      1;

    return totalMonths > 0 ? `${totalMonths}` : '';
  }

  private parseMonthValue(value: string): { year: number; month: number } | null {
    const trimmed = value.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return null;
    }

    return { year, month };
  }

  private formatMonthLabel(year: number, month: number): string {
    return new Date(year, month - 1, 1).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }

  private formatDecimal(value: number): string {
    return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  }

  private normalizeDisplayDate(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return this.getTodayDateDisplay();
    }

    if (trimmed.includes('/')) {
      return trimmed;
    }

    const inputDate = formatDateForInput(trimmed);
    if (inputDate) {
      return formatApiToDateSlash(inputDate);
    }

    return trimmed;
  }

  private populateExistingLoanDetails(employeeCode: string, employeeName: string): void {
    const existingLoanRecord = this.findExistingLoanRecord(employeeCode, employeeName);
    if (!existingLoanRecord) {
      this.hasExistingLoanDetails.set(false);
      this.resetExistingLoanFields();
      this.resetNewLoanRequestFields();
      this.existingLoan.set('No');
      return;
    }

    this.hasExistingLoanDetails.set(true);
    this.existingLoan.set('Yes');
    this.loanAcquiredDate.set(this.normalizeMonthInput(existingLoanRecord.LoanDetail.loanAcquiredDate));
    this.installmentNumber.set(existingLoanRecord.LoanDetail.installmentNumber?.trim() ?? '');
    this.loanEndingDate.set(this.normalizeMonthInput(existingLoanRecord.LoanDetail.loanEndingDate));
    this.previousInstallmentAmount.set(existingLoanRecord.LoanDetail.previousInstallmentAmount?.trim() ?? '');
    this.previousLoanPurpose.set(existingLoanRecord.LoanDetail.previousLoanPurpose?.trim() ?? '');
    this.loanAmount.set(existingLoanRecord.LoanDetail.loanAmount?.trim() ?? '');
    this.loanAmountDeductedTillNow.set(
      existingLoanRecord.LoanDetail.loanAmountDeductedTillNow?.trim() ?? '',
    );
    this.resetNewLoanRequestFields();
  }

  private populateExistingAdvanceDetails(employeeCode: string, employeeName: string): void {
    const existingAdvanceRecord = this.findExistingAdvanceRecord(employeeCode, employeeName);
    if (!existingAdvanceRecord) {
      this.hasExistingAdvanceDetails.set(false);
      this.resetExistingAdvanceFields();
      this.existingAdvance.set('No');
      this.populateAdvanceEligibleFromProfile();
      return;
    }

    const advanceDetail = existingAdvanceRecord.AdvanceDetail;
    const newAdvanceRequest = advanceDetail.newAdvanceRequest;

    this.hasExistingAdvanceDetails.set(true);
    this.existingAdvance.set('Yes');
    this.advanceAcquiredDate.set(
      formatDateForInput(
        this.pickRecordValue(
          advanceDetail.advanceAcquiredDate,
          existingAdvanceRecord.RequestDate,
          existingAdvanceRecord.HeaderInfo.requestDate,
        ),
      ),
    );
    this.advanceEligibleAmount.set(
      this.pickRecordValue(advanceDetail.advanceEligibleAmount, newAdvanceRequest.advanceAmountEligible),
    );
    this.previousAdvancePurpose.set(
      this.pickRecordValue(advanceDetail.previousAdvancePurpose, newAdvanceRequest.purpose),
    );
    this.advanceRemarks.set(advanceDetail.advanceRemarks?.trim() ?? '');
    this.advanceAmount.set(
      this.pickRecordValue(advanceDetail.advanceAmount, newAdvanceRequest.advanceAmountRequested),
    );
    this.advanceAmountToBeDeductedThisMonth.set(
      advanceDetail.advanceAmountToBeDeductedThisMonth?.trim() ?? '',
    );
    this.advanceBalance.set(advanceDetail.advanceBalance?.trim() ?? '');
    this.resetNewAdvanceRequestFields();
  }

  private populateAdvanceEligibleFromProfile(): void {
    if (this.editingId || this.hasExistingAdvanceDetails()) {
      return;
    }

    const code = this.headerEmployeeID().trim().toLowerCase();
    const name = this.headerEmployeeName().trim().toLowerCase();
    if (!code && !name) {
      return;
    }

    const employee = this.employeeOptions().find((option) => {
      const optionCode = option.code.trim().toLowerCase();
      const optionName = option.name.trim().toLowerCase();
      return (code && optionCode === code) || (!code && name && optionName === name);
    });

    if (employee) {
      this.newAdvanceAmountEligible.set(employee.advanceEligibleAmount);
    }
  }

  private populateLoanEligibleFromProfile(): void {
    const code = this.headerEmployeeID().trim().toLowerCase();
    const name = this.headerEmployeeName().trim().toLowerCase();
    if (!code && !name) {
      return;
    }

    const employee = this.employeeOptions().find((option) => {
      const optionCode = option.code.trim().toLowerCase();
      const optionName = option.name.trim().toLowerCase();
      return (code && optionCode === code) || (!code && name && optionName === name);
    });

    if (employee) {
      this.eligibleAmount.set(employee.eligibleAmount);
    }
  }

  private findExistingLoanRecord(
    employeeCode: string,
    employeeName: string,
  ): LoanAdvanceRecord | undefined {
    const normalizedCode = employeeCode.trim().toLowerCase();
    const normalizedName = employeeName.trim().toLowerCase();

    return [...this.loanAdvanceService.loans()]
      .sort((left, right) => right.Id - left.Id)
      .find((record) => {
        if (record.RequestType !== 'Loan') {
          return false;
        }

        const matchesEmployee =
          (normalizedCode && record.EmployeeID.trim().toLowerCase() === normalizedCode) ||
          (!normalizedCode &&
            normalizedName &&
            record.EmployeeName.trim().toLowerCase() === normalizedName);

        if (!matchesEmployee) {
          return false;
        }

        const loanDetail = record.LoanDetail;
        return Boolean(
          (loanDetail.existingLoan || '').trim().toLowerCase() === 'yes' ||
            (loanDetail.loanAmount || '').trim() ||
            (loanDetail.loanAmountDeductedTillNow || '').trim() ||
            (loanDetail.loanBalance || '').trim() ||
            (loanDetail.loanEndingDate || '').trim() ||
            (loanDetail.loanAcquiredDate || '').trim(),
        );
      });
  }

  private findExistingAdvanceRecord(
    employeeCode: string,
    employeeName: string,
  ): LoanAdvanceRecord | undefined {
    const normalizedCode = employeeCode.trim().toLowerCase();
    const normalizedName = employeeName.trim().toLowerCase();

    return [...this.loanAdvanceService.loans()]
      .sort((left, right) => right.Id - left.Id)
      .find((record) => {
        if (!this.isSalaryAdvanceRequest(record)) {
          return false;
        }

        const matchesEmployee =
          (normalizedCode && record.EmployeeID.trim().toLowerCase() === normalizedCode) ||
          (!normalizedCode &&
            normalizedName &&
            record.EmployeeName.trim().toLowerCase() === normalizedName);

        if (!matchesEmployee) {
          return false;
        }

        const advanceDetail = record.AdvanceDetail;
        const newAdvanceRequest = advanceDetail.newAdvanceRequest;
        return Boolean(
          (advanceDetail.existingAdvance || '').trim().toLowerCase() === 'yes' ||
            (advanceDetail.advanceAmount || '').trim() ||
            (advanceDetail.advanceAmountToBeDeductedThisMonth || '').trim() ||
            (advanceDetail.advanceBalance || '').trim() ||
            (advanceDetail.advanceAcquiredDate || '').trim() ||
            (advanceDetail.previousAdvancePurpose || '').trim() ||
            (advanceDetail.advanceEligibleAmount || '').trim() ||
            (newAdvanceRequest.advanceAmountRequested || '').trim() ||
            (newAdvanceRequest.purpose || '').trim() ||
            (newAdvanceRequest.advanceAmountEligible || '').trim(),
        );
      });
  }

  private isSalaryAdvanceRequest(record: LoanAdvanceRecord): boolean {
    const requestType = this.pickRecordValue(record.HeaderInfo.requestType, record.RequestType).toLowerCase();
    return requestType === 'salary advance' || requestType === 'salary_advance' || requestType === 'advance';
  }

  private resetExistingLoanFields(): void {
    this.loanAcquiredDate.set('');
    this.installmentNumber.set('');
    this.loanEndingDate.set('');
    this.previousInstallmentAmount.set('');
    this.previousLoanPurpose.set('');
    this.loanAmount.set('');
    this.loanAmountDeductedTillNow.set('');
  }

  private resetExistingAdvanceFields(): void {
    this.advanceAcquiredDate.set('');
    this.advanceEligibleAmount.set('');
    this.previousAdvancePurpose.set('');
    this.advanceRemarks.set('');
    this.advanceAmount.set('');
    this.advanceAmountToBeDeductedThisMonth.set('');
    this.advanceBalance.set('');
  }

  private normalizeMonthInput(value: string | undefined): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
      return '';
    }

    const directMonthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
    if (directMonthMatch) {
      return trimmed;
    }

    const formattedDate = formatDateForInput(trimmed);
    if (formattedDate) {
      return formattedDate.slice(0, 7);
    }

    return '';
  }

  protected scrollToSection(sectionId: string): void {
    this.activeSection.set(sectionId);
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }

    const payload: LoanAdvancePayload = {
      headerInfo: {
        documentNo: this.documentNo(),
        requestType: this.requestType(),
        employeeID: this.headerEmployeeID(),
        employeeName: this.headerEmployeeName(),
        department: this.department(),
        designation: this.designation(),
        location: this.branch(),
        joiningDate: this.joiningDate(),
        yearsOfService: this.yearsOfService(),
        requestDate: formatDateSlashToApi(this.requestDate()),
        payrollMonth: this.payrollMonth(),
        status: this.status(),
        employeeNature: this.employeeNature(),
        employmentType: this.employmentType(),
        workGradeLevel: this.workGradeLevel(),
        jobTitle: this.jobTitle(),
        employeeCategory: this.employeeCategory(),
        reportingManager: this.reportingManager(),
      },
      loanDetail: {
        existingLoan: this.existingLoan(),
        loanAcquiredDate: this.loanAcquiredDate(),
        installmentNumber: this.installmentNumber(),
        loanEndingDate: this.loanEndingDate(),
        previousInstallmentAmount: this.previousInstallmentAmount(),
        previousLoanPurpose: this.previousLoanPurpose(),
        loanAmount: this.loanAmount(),
        loanAmountDeductedTillNow: this.loanAmountDeductedTillNow(),
        loanBalance: this.loanBalance(),
        newLoanRequest: {
          purpose: this.newLoanPurpose(),
          loanAmountRequested: this.loanAmountRequested(),
          installmentAmount: this.installmentAmount(),
          noOfInstallments: this.noOfInstallments(),
          loanEndMonth: this.loanEndMonth(),
          loanStartMonth: this.loanStartMonth(),
          loanTenure: this.loanTenure(),
          eligibleAmount: this.eligibleAmount()
        },
        remarks: this.remarks()
      },
      advanceDetail: {
        existingAdvance: this.existingAdvance(),
        advanceAcquiredDate: this.advanceAcquiredDate(),
        advanceEligibleAmount: this.advanceEligibleAmount(),
        previousAdvancePurpose: this.previousAdvancePurpose(),
        advanceRemarks: this.advanceRemarks(),
        advanceAmount: this.advanceAmount(),
        advanceAmountToBeDeductedThisMonth: this.advanceAmountToBeDeductedThisMonth(),
        advanceBalance: this.advanceBalance(),
        newAdvanceRequest: {
          purpose: this.newAdvancePurpose(),
          advanceAmountEligible: this.newAdvanceAmountEligible(),
          advanceAmountRequested: this.newAdvanceAmountRequested()
        }
      },
      repaymentSchedule: {
        loanAmount: this.loanAmountRequested() || this.loanAmount(),
        tenure: this.loanTenure() || this.noOfInstallments(),
        installmentAmount: this.installmentAmount() || this.deductionAmount(),
        schedule: this.repaymentScheduleRows().map((row) => ({
          sr: row.sr,
          month: row.monthLabel,
          installment: row.installment,
          balance: row.balance,
          status: row.status,
        })),
        remarks: this.repaymentRemarks(),
        repaymentStartDate: this.repaymentStartDate() || (this.loanStartMonth() ? `${this.loanStartMonth()}-01` : ''),
        repaymentFrequency: this.repaymentFrequency(),
        deductionAmount: this.deductionAmount() || this.installmentAmount(),
      }
    };

    this.saving.set(true);
    this.cdr.markForCheck();

    const request$ = this.editingId
      ? this.loanAdvanceService.updateLoanAdvance(this.editingId, payload)
      : this.loanAdvanceService.submitLoanAdvance(payload);

    request$
      .pipe(
        finalize(() => {
          this.saving.set(false);
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: async (response) => {
          if (response.status) {
            await this.alertService.successAndWait(
              this.editingId ? 'Updated' : 'Saved',
              response.message ||
                (this.editingId
                  ? 'Loan/Advance updated successfully.'
                  : 'Loan/Advance submitted successfully.'),
            );
            this.loanAdvanceService.fetchLoanAdvances().subscribe();
            void this.router.navigateByUrl('/employee-action/loan-advance-form');
          } else {
            void this.alertService.error(
              'Error',
              response.message ||
                (this.editingId
                  ? 'Failed to update loan/advance request.'
                  : 'Failed to submit loan/advance request.'),
            );
          }
        },
        error: (error: unknown) => {
          void this.alertService.error(
            'Error',
            formatApiErrorMessage(
              error,
              this.editingId
                ? 'Failed to update loan/advance request.'
                : 'Failed to submit loan/advance request.',
            ),
          );
        },
      });
  }
}
