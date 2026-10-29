import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import {
  ApplicationFormRecord,
  ApplicationFormService,
} from '../../../../../services/application-form.service';
import { AttendanceManagementService } from '../../../../../services/attendance-management.service';
import { AlertService } from '../../../../../services/alert.service';
import { AuthService } from '../../../../../services/auth.service';
import {
  LoanAdvanceRecord,
  LoanAdvanceService,
} from '../../../../../services/loan-advance.service';
import { LeaveApplicationService } from '../../../../../services/leave-application.service';
import { OvertimeListRecord, OvertimeListService } from '../../../../../services/overtime-list.service';
import {
  PayrollProcessingService,
  PayrollProcessingSubmitPayload,
} from '../../../../../services/payroll-processing.service';
import { canonicalAttendanceKey } from '../../../../../services/attendance-management.service';
import { sumSubmittedOvertimeHours } from '../payroll-overtime.util';
import { countPayrollLeaveDays, PayrollLeaveDayCounts } from '../payroll-leave.util';
import {
  PayrollSetupService,
  computeBasicSalary,
  computeEobiEmployeeContribution,
  computeEobiEmployerContribution,
  computeFuelAllowance,
  computeGratuity,
  computeGrossSalary,
  computeGrossSalaryBreakdown,
  computeGrossSalaryPayable,
  computeMedicalAllowance,
  computeOvertimeAmount,
  computeOvertimeRate,
  computeProvidentFund,
  computeYearsOfService,
} from '../../payroll-setup/payroll-setup.service';
import {
  computeMonthlyWithholdingTax,
  WithholdingTaxRecord,
  WithholdingTaxService,
} from '../../../../../services/withholding-tax.service';
import {
  GL_ACCOUNT_BRANCH_OPTIONS,
  resolveBranchCode,
} from '../../../../setup/gl-account-determination/gl-account-branch.options';
import { formatApiErrorMessage } from '../../../../../utils/api-error.util';
import {
  buildPaginationFooterItems,
  paginationItemTrack,
  PaginationFooterItem,
} from '../../../../../utils/pagination.util';
import { ApplicationDetailDialogComponent } from '../../../Application-Form/application-detail-dialog/application-detail-dialog';
import {
  computeSocialSecurityKpk,
  computeSocialSecurityPunjab,
} from '../payroll-social-security.util';

export interface PayrollProcessRow {
  apiId: string;
  employeeCode: string;
  personName: string;
  username: string;
  designation: string;
  department: string;
  employeeCategory: string;
  employmentNature: string;
  employmentType: string;
  jobTitle: string;
  location: string;
  workGradeLevel: string;
  dateOfJoining: string;
  yearsOfService: number;
  overtimeApplicable: boolean;
  allowancesApplicable: boolean;
  eobiApplicable: boolean;
  providentApplicable: boolean;
  basicSalary: number;
  grossSalary: number;
  grossSalaryInCash: number;
  grossSalaryInBank: number;
  paymentMode: string;
  medicalAllowance: number;
  allowedLiters: number;
  monthlyFuelRate: number;
  fuelAllowance: number;
  mobileAllowance: number;
  carAllowance: number;
  otherAllowances: number;
  bonus: number;
  lastMonthGrossSalary: number;
  overtimeHours: number;
  overtime: number;
  providentFund: number;
  providentFundEmployer: number;
  socialSecurityPunjab: number;
  socialSecurityKpk: number;
  gratuity: number;
  eobiEmployee: number;
  eobiEmployer: number;
  arrears: number;
  loanAdjustment: number;
  loanAdvForm: number;
  lateAttendDeduction: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  costToCompany: number;
  taxDeduction: number;
  approved: boolean;
}

export type PayrollColumnTone =
  | 'salary'
  | 'allowances'
  | 'bonuses'
  | 'providentFund'
  | 'socialSecurity'
  | 'eobi'
  | 'other'
  | 'loan'
  | 'final'
  | 'approval';

export type PayrollColumnType = 'currency' | 'readonly' | 'readonly-pill' | 'approval' | 'print';

export interface PayrollColumnGroup {
  id: string;
  label: string;
  tone: PayrollColumnTone;
}

export interface PayrollColumnDef {
  key: string;
  label: string;
  groupId: string;
  type: PayrollColumnType;
  minWidth: number;
}

interface PayrollMonthOption {
  value: number;
  label: string;
}

@Component({
  selector: 'app-add-payroll-process',
  standalone: true,
  imports: [CommonModule, FormsModule, ApplicationDetailDialogComponent],
  templateUrl: './add-payroll-process.html',
  styleUrl: './add-payroll-process.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddPayrollProcessComponent implements OnInit {
  private readonly applicationFormService = inject(ApplicationFormService);
  private readonly alertService = inject(AlertService);
  private readonly authService = inject(AuthService);
  private readonly loanAdvanceService = inject(LoanAdvanceService);
  private readonly leaveApplicationService = inject(LeaveApplicationService);
  private readonly attendanceManagementService = inject(AttendanceManagementService);
  private readonly overtimeListService = inject(OvertimeListService);
  private readonly payrollSetupService = inject(PayrollSetupService);
  private readonly payrollProcessingService = inject(PayrollProcessingService);
  private readonly withholdingTaxService = inject(WithholdingTaxService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly employeeSummaries = signal<ApplicationFormRecord[]>([]);
  readonly overtimeRecords = signal<OvertimeListRecord[]>([]);
  readonly rowCache = signal<Map<string, PayrollProcessRow>>(new Map());
  readonly loading = signal(true);
  readonly loadingPageDetails = signal(false);
  readonly loadingLeaveDays = signal(false);
  readonly leaveDaysLoadFailed = signal(false);
  readonly saving = signal(false);
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly pageSizeOptions = [10, 25, 50, 100];
  readonly remarks = signal('');
  readonly fuelPriceAdjust = signal(0);
  readonly minimumWageAdjust = signal(0);
  readonly searchText = signal('');
  readonly selectedBranch = signal('');
  readonly branchOptions = GL_ACCOUNT_BRANCH_OPTIONS;
  readonly allApprovalsSelected = signal(false);
  readonly selectedMonth = signal(new Date().getMonth() + 1);
  readonly selectedYear = signal(new Date().getFullYear());
  readonly monthOptions: PayrollMonthOption[] = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];
  readonly yearOptions = this.buildYearOptions();
  readonly loggedInUserName = signal('—');
  readonly loggedInUserId = signal('—');
  readonly detailOpen = signal(false);
  readonly detailLoading = signal(false);
  readonly detailRecord = signal<ApplicationFormRecord | null>(null);
  readonly withholdingTaxBrackets = signal<WithholdingTaxRecord[]>([]);

  private readonly fixedPane = viewChild<ElementRef<HTMLElement>>('fixedPane');
  private readonly scrollPane = viewChild<ElementRef<HTMLElement>>('scrollPane');
  private syncingScroll = false;
  private pageDetailsSub?: Subscription;
  private leaveDaysSub?: Subscription;
  private pageDetailsGeneration = 0;
  private leaveDaysByEmployee = new Map<string, PayrollLeaveDayCounts>();
  private readonly lastMonthGrossSalaryCache = new Map<string, number>();
  private readonly approvalOverrides = signal<Map<string, boolean>>(new Map());

  readonly minimumWage = this.payrollSetupService.minimumWage;
  readonly currencyCode = 'PKR';

  readonly columnGroups: PayrollColumnGroup[] = [
    { id: 'salary', label: 'Salary', tone: 'salary' },
    { id: 'allowances', label: 'Allowances', tone: 'allowances' },
    { id: 'bonuses', label: 'Bonuses', tone: 'bonuses' },
    { id: 'providentFund', label: 'Provident Fund', tone: 'providentFund' },
    { id: 'socialSecurity', label: 'Social Security', tone: 'socialSecurity' },
    { id: 'eobi', label: 'EOBI', tone: 'eobi' },
    { id: 'other', label: 'End Of Service Benefits', tone: 'other' },
    { id: 'loan', label: 'Adjustments', tone: 'loan' },
    { id: 'final', label: 'Final Totals', tone: 'final' },
    { id: 'approval', label: 'Approval', tone: 'approval' },
  ];

  readonly payrollColumns: PayrollColumnDef[] = [
    { key: 'basicSalary', label: 'Basic Salary', groupId: 'salary', type: 'readonly', minWidth: 152 },
    { key: 'grossSalary', label: 'Gross Salary', groupId: 'salary', type: 'readonly', minWidth: 152 },
    { key: 'grossSalaryInCash', label: 'Gross Salary in Cash', groupId: 'salary', type: 'readonly', minWidth: 176 },
    { key: 'grossSalaryInBank', label: 'Gross Salary in Bank', groupId: 'salary', type: 'readonly', minWidth: 176 },
    { key: 'medicalAllowance', label: 'Medical', groupId: 'allowances', type: 'readonly', minWidth: 145 },
    { key: 'allowedLiters', label: 'Petrol Liters', groupId: 'allowances', type: 'readonly', minWidth: 120 },
    { key: 'fuelAllowance', label: 'Fuel', groupId: 'allowances', type: 'readonly', minWidth: 145 },
    { key: 'mobileAllowance', label: 'Mobile', groupId: 'allowances', type: 'currency', minWidth: 145 },
    { key: 'carAllowance', label: 'Car', groupId: 'allowances', type: 'currency', minWidth: 145 },
    { key: 'otherAllowances', label: 'Other', groupId: 'allowances', type: 'currency', minWidth: 145 },
    { key: 'bonus', label: 'Bonus', groupId: 'bonuses', type: 'currency', minWidth: 145 },
    { key: 'overtimeHours', label: 'Overtime Hours (Month Total)', groupId: 'bonuses', type: 'currency', minWidth: 190 },
    { key: 'overtime', label: 'Overtime', groupId: 'bonuses', type: 'readonly', minWidth: 145 },
    { key: 'providentFundEmployer', label: 'P.Fund (Employer)', groupId: 'providentFund', type: 'readonly', minWidth: 152 },
    { key: 'providentFund', label: 'P.Fund (Employee)', groupId: 'providentFund', type: 'readonly', minWidth: 152 },
    { key: 'socialSecurityPunjab', label: 'Punjab', groupId: 'socialSecurity', type: 'readonly', minWidth: 145 },
    { key: 'socialSecurityKpk', label: 'KPK', groupId: 'socialSecurity', type: 'readonly', minWidth: 145 },
    { key: 'eobiEmployer', label: 'EOBI (Employer)', groupId: 'eobi', type: 'readonly', minWidth: 152 },
    { key: 'eobiEmployee', label: 'EOBI (Employee)', groupId: 'eobi', type: 'readonly', minWidth: 152 },
    { key: 'arrears', label: 'Arrears', groupId: 'other', type: 'currency', minWidth: 145 },
    { key: 'gratuity', label: 'Gratuity', groupId: 'other', type: 'currency', minWidth: 145 },
    { key: 'paidLeaveDays', label: 'Paid', groupId: 'loan', type: 'readonly', minWidth: 110 },
    { key: 'unpaidLeaveDays', label: 'Unpaid', groupId: 'loan', type: 'readonly', minWidth: 110 },
    { key: 'loanAdjustment', label: 'Loan Deduction', groupId: 'loan', type: 'currency', minWidth: 158 },
    { key: 'loanAdvForm', label: 'Advance Deduction', groupId: 'loan', type: 'currency', minWidth: 152 },
    { key: 'lateAttendDeduction', label: 'Leaves Deduction', groupId: 'loan', type: 'currency', minWidth: 182 },
    // { key: 'costToCompany', label: 'Cost to Company', groupId: 'final', type: 'currency', minWidth: 168 },
    { key: 'netPayable', label: 'Gross Payable', groupId: 'final', type: 'readonly', minWidth: 160 },
    { key: 'taxDeduction', label: 'Tax Deduction', groupId: 'final', type: 'readonly', minWidth: 160 },
    { key: 'netPayableAfterTax', label: 'Net Payable (TAX)', groupId: 'final', type: 'readonly', minWidth: 160 },
    { key: 'netPayableManagement', label: 'Net Payable (Management)', groupId: 'final', type: 'readonly', minWidth: 240 },
    // { key: 'totalEarnings', label: 'Total Earnings', groupId: 'final', type: 'readonly-pill', minWidth: 168 },
    // { key: 'finalGrossSalary', label: 'Gross Salary', groupId: 'final', type: 'readonly', minWidth: 152 },
    { key: 'approved', label: 'Approval', groupId: 'approval', type: 'approval', minWidth: 96 },
    { key: 'paySlip', label: 'Pay Slip', groupId: 'approval', type: 'print', minWidth: 120 },
  ];

  readonly scrollMinWidth = computed(() =>
    this.payrollColumns.reduce((sum, col) => sum + col.minWidth, 0),
  );

  readonly filteredEmployeeSummaries = computed(() => {
    const list = this.employeeSummaries();
    const branch = this.selectedBranch();
    const search = this.searchText().trim().toLowerCase();
    const branchFiltered = branch
      ? list.filter(
          (record) =>
            resolveBranchCode(record.detail?.personalInfo.branchLocation ?? '') === branch,
        )
      : list;
    if (!search) {
      return branchFiltered;
    }

    return branchFiltered.filter((record) => {
      const haystack = [
        record.EmployeeName,
        record.EmployeeCode,
        record.apiId,
        record.Department,
        record.Designation,
      ]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ');
      return haystack.includes(search);
    });
  });

  readonly paginatedRows = computed(() => {
    const cache = this.rowCache();
    return this.currentPageSummaries().map((summary) => {
      const id = this.resolveEmployeeKey(summary);
      return cache.get(id) ?? this.buildPlaceholderRowFromSummary(summary);
    });
  });

  readonly currentPageSummaries = computed(() => {
    const list = this.filteredEmployeeSummaries();
    const start = (this.currentPage() - 1) * this.pageSize();
    return list.slice(start, start + this.pageSize());
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredEmployeeSummaries().length / this.pageSize())),
  );

  readonly paginationFooterItems = computed((): PaginationFooterItem[] =>
    buildPaginationFooterItems(this.totalPages(), this.currentPage()),
  );

  readonly paginationItemTrack = paginationItemTrack;
  Math = Math;

  readonly skeletonRows = computed(() =>
    Array.from({ length: this.pageSize() }, (_, index) => index),
  );

  readonly groupTotals = computed(() => {
    const totals = {
      basicSalary: 0,
      grossSalary: 0,
      grossSalaryInCash: 0,
      grossSalaryInBank: 0,
      medicalAllowance: 0,
      allowedLiters: 0,
      fuelAllowance: 0,
      mobileAllowance: 0,
      carAllowance: 0,
      otherAllowances: 0,
      bonus: 0,
      overtimeHours: 0,
      overtime: 0,
      providentFund: 0,
      providentFundEmployer: 0,
      socialSecurityPunjab: 0,
      socialSecurityKpk: 0,
      gratuity: 0,
      eobiEmployee: 0,
      eobiEmployer: 0,
      arrears: 0,
      loanAdjustment: 0,
      loanAdvForm: 0,
      lateAttendDeduction: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      costToCompany: 0,
      taxDeduction: 0,
      netPayable: 0,
      netPayableAfterTax: 0,
      netPayableManagement: 0,
      totalEarnings: 0,
      finalGrossSalary: 0,
    };

    for (const row of this.paginatedRows()) {
      if (!this.isRowLoaded(row.apiId)) {
        continue;
      }
      totals.basicSalary += row.basicSalary;
      totals.grossSalary += row.grossSalary;
      totals.grossSalaryInCash += row.grossSalaryInCash;
      totals.grossSalaryInBank += row.grossSalaryInBank;
      totals.medicalAllowance += row.medicalAllowance;
      totals.allowedLiters += row.allowedLiters;
      totals.fuelAllowance += row.fuelAllowance;
      totals.mobileAllowance += row.mobileAllowance;
      totals.carAllowance += row.carAllowance;
      totals.otherAllowances += row.otherAllowances;
      totals.bonus += row.bonus;
      totals.overtimeHours += row.overtimeHours;
      totals.overtime += row.overtime;
      totals.providentFund += row.providentFund;
      totals.providentFundEmployer += row.providentFundEmployer;
      totals.socialSecurityPunjab += row.socialSecurityPunjab;
      totals.socialSecurityKpk += row.socialSecurityKpk;
      totals.gratuity += row.gratuity;
      totals.eobiEmployee += row.eobiEmployee;
      totals.eobiEmployer += row.eobiEmployer;
      totals.arrears += row.arrears;
      totals.loanAdjustment += row.loanAdjustment;
      totals.loanAdvForm += row.loanAdvForm;
      totals.lateAttendDeduction += row.lateAttendDeduction;
      totals.paidLeaveDays += row.paidLeaveDays;
      totals.unpaidLeaveDays += row.unpaidLeaveDays;
      totals.costToCompany += row.costToCompany;
      totals.taxDeduction += row.taxDeduction;
      totals.netPayable += this.grossPayableForRow(row);
      totals.netPayableAfterTax += this.netPayableAfterTaxForRow(row);
      totals.netPayableManagement += this.netPayableManagementForRow(row);
      totals.totalEarnings += this.totalEarningsForRow(row);
      totals.finalGrossSalary += row.grossSalary;
    }

    return totals;
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.pageDetailsSub?.unsubscribe());
    this.destroyRef.onDestroy(() => this.leaveDaysSub?.unsubscribe());
    this.loadWithholdingTaxes();
    this.loadLoanAdvances();
    this.loadOvertimeRecords();
    this.loadEmployees();
  }

  isRowLoaded(apiId: string): boolean {
    return this.rowCache().has(apiId);
  }

  setPage(page: number): void {
    const total = this.totalPages();
    if (page < 1 || page > total) {
      return;
    }
    this.currentPage.set(page);
    this.scrollTablesToTop();
    this.loadCurrentPageDetails();
  }

  onPageSizeChange(): void {
    this.currentPage.set(1);
    this.scrollTablesToTop();
    this.loadCurrentPageDetails();
  }

  onSelectedMonthChange(value: string | number): void {
    this.selectedMonth.set(Number(value));
    this.refreshPayrollRows();
    this.loadPayrollMonthLeaveDays();
  }

  onSelectedYearChange(value: string | number): void {
    this.selectedYear.set(Number(value));
    this.refreshPayrollRows();
    this.loadPayrollMonthLeaveDays();
  }

  onBranchChange(value: string): void {
    this.selectedBranch.set(value);
    this.currentPage.set(1);
    this.scrollTablesToTop();
    this.loadCurrentPageDetails();
  }

  onSearchChange(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(1);
    this.scrollTablesToTop();
    this.loadCurrentPageDetails();
  }

  onFuelPriceAdjustChange(value: string | number): void {
    this.fuelPriceAdjust.set(this.parseAmount(value));
    this.rowCache.update((cache) => {
      const next = new Map(cache);
      for (const [id, row] of next) {
        next.set(id, this.recalculateRow(row));
      }
      return next;
    });
  }

  onMinimumWageAdjustChange(value: string | number): void {
    this.minimumWageAdjust.set(this.parseAmount(value));
    this.rowCache.update((cache) => {
      const next = new Map(cache);
      for (const [id, row] of next) {
        next.set(id, this.recalculateRow(row));
      }
      return next;
    });
  }

  isLastPageActive(): boolean {
    return this.currentPage() === this.totalPages();
  }

  private scrollTablesToTop(): void {
    const fixed = this.fixedPane()?.nativeElement;
    const scroll = this.scrollPane()?.nativeElement;
    if (fixed) {
      fixed.scrollTop = 0;
    }
    if (scroll) {
      scroll.scrollTop = 0;
    }
  }

  groupColspan(groupId: string): number {
    return this.payrollColumns.filter((col) => col.groupId === groupId).length;
  }

  groupHeaderClass(group: PayrollColumnGroup): string {
    const visibleGroups = this.columnGroups.filter((item) => this.groupColspan(item.id) > 0);
    const isLastGroup = visibleGroups[visibleGroups.length - 1]?.id === group.id;
    return [`tone-${group.tone}`, isLastGroup ? '' : 'comp-section-end'].filter(Boolean).join(' ');
  }

  columnSectionClass(col: PayrollColumnDef): string {
    const columnIndex = this.payrollColumns.findIndex((item) => item.key === col.key);
    if (columnIndex === -1) {
      return '';
    }

    const isLastInGroup =
      columnIndex === this.payrollColumns.length - 1 ||
      this.payrollColumns[columnIndex + 1].groupId !== col.groupId;

    if (!isLastInGroup || columnIndex === this.payrollColumns.length - 1) {
      return '';
    }

    return `comp-section-end comp-section-end--${col.groupId}`;
  }

  onScrollPaneScroll(event: Event): void {
    if (this.syncingScroll) {
      return;
    }
    const fixed = this.fixedPane()?.nativeElement;
    const scroll = event.target as HTMLElement;
    if (!fixed) {
      return;
    }
    this.syncingScroll = true;
    fixed.scrollTop = scroll.scrollTop;
    this.syncingScroll = false;
  }

  onFixedPaneScroll(event: Event): void {
    if (this.syncingScroll) {
      return;
    }
    const scroll = this.scrollPane()?.nativeElement;
    const fixed = event.target as HTMLElement;
    if (!scroll) {
      return;
    }
    this.syncingScroll = true;
    scroll.scrollTop = fixed.scrollTop;
    this.syncingScroll = false;
  }

  onTableWheel(event: WheelEvent): void {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    const scroll = this.scrollPane()?.nativeElement;
    const fixed = this.fixedPane()?.nativeElement;
    if (!scroll) {
      return;
    }

    const maxScrollTop = scroll.scrollHeight - scroll.clientHeight;
    if (maxScrollTop <= 0) {
      return;
    }

    const nextScrollTop = scroll.scrollTop + event.deltaY;
    const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, nextScrollTop));

    if (clampedScrollTop === scroll.scrollTop) {
      return;
    }

    event.preventDefault();
    scroll.scrollTop = clampedScrollTop;
    if (fixed) {
      fixed.scrollTop = clampedScrollTop;
    }
  }

  avatarInitials(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      return '?';
    }
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
  }

  formatMoney(value: number): string {
    return `${this.currencyCode} ${value.toLocaleString('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  back(): void {
    void this.router.navigateByUrl('/payroll-master');
  }

  parseAmount(value: string | number): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  totalEarningsForRow(row: PayrollProcessRow): number {
    return (
      row.grossSalary +
      row.fuelAllowance +
      row.mobileAllowance +
      row.carAllowance +
      row.otherAllowances +
      row.bonus +
      row.overtime
    );
  }

  grossPayableForRow(row: PayrollProcessRow): number {
    return computeGrossSalaryPayable({
      grossSalaryInBank: row.grossSalaryInBank,
      fuelAllowance: row.fuelAllowance,
      mobileAllowance: row.mobileAllowance,
      carAllowance: row.carAllowance,
      otherAllowances: row.otherAllowances,
      bonus: row.bonus,
      overtime: row.overtime,
      arrears: row.arrears,
      providentFund: row.providentFund,
      eobiEmployee: row.eobiEmployee,
      loanDeduction: row.loanAdjustment,
      advanceDeduction: row.loanAdvForm,
      lateAttendanceDeduction: row.lateAttendDeduction,
    });
  }

  netPayableAfterTaxForRow(row: PayrollProcessRow): number {
    return Math.max(0, this.grossPayableForRow(row) - row.taxDeduction);
  }

  netPayableManagementForRow(row: PayrollProcessRow): number {
    return this.netPayableAfterTaxForRow(row) + row.grossSalaryInCash;
  }

  earningsRatioForRow(row: PayrollProcessRow): number {
    if (row.basicSalary <= 0) {
      return 0;
    }
    return Math.round((this.totalEarningsForRow(row) / row.basicSalary) * 100);
  }

  getColumnValue(row: PayrollProcessRow, column: PayrollColumnDef): number | string {
    if (column.key === 'netPayable') {
      return this.grossPayableForRow(row);
    }
    if (column.key === 'netPayableAfterTax') {
      return this.netPayableAfterTaxForRow(row);
    }
    if (column.key === 'netPayableManagement') {
      return this.netPayableManagementForRow(row);
    }
    if (column.key === 'totalEarnings') {
      return this.totalEarningsForRow(row);
    }
    if (column.key === 'grossSalary' || column.key === 'finalGrossSalary') {
      return row.grossSalary;
    }
    if (column.key === 'grossSalaryInCash') {
      return row.grossSalaryInCash;
    }
    if (column.key === 'grossSalaryInBank') {
      return row.grossSalaryInBank;
    }
    if (column.key === 'overtimeHours') {
      return row.overtimeHours;
    }
    const value = row[column.key as keyof PayrollProcessRow];
    return typeof value === 'number' ? value : String(value ?? '');
  }

  isColumnReadonlyForRow(row: PayrollProcessRow, column: PayrollColumnDef): boolean {
    if (column.type !== 'currency') {
      return true;
    }

    if (!row.allowancesApplicable && this.isAllowanceColumn(column.key)) {
      return true;
    }

    if (!row.overtimeApplicable && column.key === 'overtimeHours') {
      return true;
    }

    return false;
  }

  formatColumnDisplay(row: PayrollProcessRow, column: PayrollColumnDef): string {
    const value = this.getColumnValue(row, column);
    if (this.isLeaveDaysColumn(column.key)) {
      return `${typeof value === 'number' ? value : this.parseAmount(value)} days`;
    }
    if (column.key === 'overtimeHours' || column.key === 'allowedLiters') {
      return typeof value === 'number'
        ? value.toLocaleString('en-PK', { maximumFractionDigits: 2 })
        : String(value);
    }
    return this.formatMoney(typeof value === 'number' ? value : this.parseAmount(value));
  }

  private isAllowanceColumn(key: string): boolean {
    return (
      key === 'fuelAllowance' ||
      key === 'mobileAllowance' ||
      key === 'carAllowance' ||
      key === 'otherAllowances'
    );
  }

  isLeaveDaysColumn(key: string): boolean {
    return key === 'paidLeaveDays' || key === 'unpaidLeaveDays';
  }

  readonlyReason(row: PayrollProcessRow, column: PayrollColumnDef): string {
    if (!row.allowancesApplicable && this.isAllowanceColumn(column.key)) {
      return 'Allowances not applicable for this employee';
    }
    if (!row.overtimeApplicable && (column.key === 'overtimeHours' || column.key === 'overtime')) {
      return 'Overtime not applicable for this employee';
    }
    if (!row.eobiApplicable && (column.key === 'eobiEmployee' || column.key === 'eobiEmployer')) {
      return 'EOBI not applicable for this employee';
    }
    return '';
  }

  getGroupTotal(column: PayrollColumnDef): number | null {
    if (column.key === 'approved' || column.key === 'paySlip') {
      return null;
    }
    if (column.key === 'netPayable') {
      return this.groupTotals().netPayable;
    }
    if (column.key === 'netPayableAfterTax') {
      return this.groupTotals().netPayableAfterTax;
    }
    if (column.key === 'netPayableManagement') {
      return this.groupTotals().netPayableManagement;
    }
    if (column.key === 'totalEarnings') {
      return this.groupTotals().totalEarnings;
    }
    if (column.key === 'finalGrossSalary') {
      return this.groupTotals().finalGrossSalary;
    }
    if (column.key === 'providentFundEmployer') {
      return this.groupTotals().providentFundEmployer;
    }
    const totals = this.groupTotals();
    return totals[column.key as keyof typeof totals] ?? 0;
  }

  formatGroupTotal(column: PayrollColumnDef): string {
    const total = this.getGroupTotal(column);
    if (total === null) {
      return '';
    }
    if (this.isLeaveDaysColumn(column.key)) {
      return `${total} days`;
    }
    if (column.key === 'allowedLiters' || column.key === 'overtimeHours') {
      return total.toLocaleString('en-PK', { maximumFractionDigits: 2 });
    }
    return this.formatMoney(total);
  }

  onMinimumWageChange(value: string | number): void {
    this.payrollSetupService.setMinimumWage(this.parseAmount(value));
    this.rowCache.update((cache) => {
      const next = new Map(cache);
      for (const [id, row] of next) {
        next.set(id, this.recalculateRow(row));
      }
      return next;
    });
  }

  setApproval(apiId: string, approved: boolean): void {
    this.approvalOverrides.update((overrides) => {
      const next = new Map(overrides);
      next.set(apiId, approved);
      return next;
    });
    this.rowCache.update((cache) => {
      const row = cache.get(apiId);
      if (!row) {
        return cache;
      }
      const next = new Map(cache);
      next.set(apiId, { ...row, approved });
      return next;
    });
  }

  toggleAllApprovals(): void {
    const approved = !this.allApprovalsSelected();
    this.allApprovalsSelected.set(approved);
    this.approvalOverrides.set(new Map());
    this.rowCache.update((cache) => {
      const next = new Map(cache);
      for (const [apiId, row] of next) {
        if (row) {
          next.set(apiId, { ...row, approved });
        }
      }
      return next;
    });
  }

  printPaySlip(row: PayrollProcessRow): void {
    if (!row?.apiId) {
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      void this.alertService.warning('Print', 'Your browser blocked the pay slip window. Please allow pop-ups and try again.');
      return;
    }

    const content = this.buildPaySlipDocument(row);
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  }

  private buildPaySlipDocument(row: PayrollProcessRow): string {
    const totalEarnings = this.totalEarningsForRow(row);
    const grossPayable = this.grossPayableForRow(row);
    const netPayable = this.netPayableAfterTaxForRow(row);
    const paidLeaveDays = this.leaveDaysLoadFailed()
      ? 'Unavailable'
      : this.loadingLeaveDays()
        ? 'Loading...'
        : `${row.paidLeaveDays} days`;
    const unpaidLeaveDays = this.leaveDaysLoadFailed()
      ? 'Unavailable'
      : this.loadingLeaveDays()
        ? 'Loading...'
        : `${row.unpaidLeaveDays} days`;
    const monthLabel =
      this.monthOptions.find((option) => option.value === this.selectedMonth())?.label ??
      String(this.selectedMonth());

    const escapeHtml = (value: string | number | null | undefined): string =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const fields = [
      ['Employee Code', row.employeeCode],
      ['Employee Name', row.personName],
      ['Designation', row.designation || '—'],
      ['Department', row.department || '—'],
      ['Month', monthLabel],
      ['Year', this.selectedYear()],
      ['Basic Salary', this.formatMoney(row.basicSalary)],
      ['Gross Salary', this.formatMoney(row.grossSalary)],
      ['Gross Salary in Cash', this.formatMoney(row.grossSalaryInCash)],
      ['Gross Salary in Bank', this.formatMoney(row.grossSalaryInBank)],
      ['Fuel Allowance', this.formatMoney(row.fuelAllowance)],
      ['Mobile Allowance', this.formatMoney(row.mobileAllowance)],
      ['Car Allowance', this.formatMoney(row.carAllowance)],
      ['Other Allowances', this.formatMoney(row.otherAllowances)],
      ['Bonus', this.formatMoney(row.bonus)],
      ['Overtime', this.formatMoney(row.overtime)],
      ['Provident Fund', this.formatMoney(row.providentFund)],
      ['Gratuity', this.formatMoney(row.gratuity)],
      ['EOBI Employee', this.formatMoney(row.eobiEmployee)],
      ['EOBI Employer', this.formatMoney(row.eobiEmployer)],
      ['Arrears', this.formatMoney(row.arrears)],
      ['Paid Leave Days', paidLeaveDays],
      ['Unpaid Leave Days', unpaidLeaveDays],
      ['Loan Deduction', this.formatMoney(row.loanAdjustment)],
      ['Advance Deduction', this.formatMoney(row.loanAdvForm)],
      ['Leaves Deduction', this.formatMoney(row.lateAttendDeduction)],
      ['Tax Deduction', this.formatMoney(row.taxDeduction)],
      ['Total Earnings', this.formatMoney(totalEarnings)],
      ['Gross Payable', this.formatMoney(grossPayable)],
      ['Net Payable', this.formatMoney(netPayable)],
      ['Approved', row.approved ? 'Yes' : 'No'],
    ];

    return `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Payroll Pay Slip</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; }
            .sheet { max-width: 900px; margin: 0 auto; border: 1px solid #dfe7f1; border-radius: 12px; overflow: hidden; }
            .header { background: linear-gradient(135deg, #0a6ed1, #054a97); color: white; padding: 22px 28px; }
            .header h1 { margin: 0; font-size: 26px; }
            .header p { margin: 8px 0 0; opacity: 0.92; }
            .body { padding: 24px 28px 28px; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px 16px; }
            .field { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
            .field strong { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; margin-bottom: 5px; }
            .field span { font-size: 14px; font-weight: 600; color: #0f172a; }
            .totals { margin-top: 22px; border-top: 2px solid #dfe7f1; padding-top: 18px; }
            .total-line { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
            .total-line strong { font-weight: 700; }
            @media print { body { margin: 0; } .sheet { box-shadow: none; border-color: #d1d9e3; } }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="header">
              <h1>Payroll Pay Slip</h1>
              <p>${escapeHtml(monthLabel)} ${escapeHtml(this.selectedYear())}</p>
            </div>
            <div class="body">
              <div class="grid">
                ${fields
                  .map(
                    ([label, value]) => `
                      <div class="field">
                        <strong>${escapeHtml(label)}</strong>
                        <span>${escapeHtml(value)}</span>
                      </div>`,
                  )
                  .join('')}
              </div>
              <div class="totals">
                <div class="total-line"><span>Total Earnings</span><strong>${escapeHtml(this.formatMoney(totalEarnings))}</strong></div>
                <div class="total-line"><span>Gross Payable</span><strong>${escapeHtml(this.formatMoney(grossPayable))}</strong></div>
                <div class="total-line"><span>Net Payable</span><strong>${escapeHtml(this.formatMoney(netPayable))}</strong></div>
              </div>
            </div>
          </div>
        </body>
      </html>`;
  }

  private approvalForEmployee(apiId: string): boolean {
    return this.approvalOverrides().get(apiId) ?? this.allApprovalsSelected();
  }

  updateRowField(
    apiId: string,
    field: keyof PayrollProcessRow,
    value: string | number,
  ): void {
    const row = this.rowCache().get(apiId);
    if (!row) {
      return;
    }

    if (!row.allowancesApplicable && this.isAllowanceColumn(String(field))) {
      return;
    }
    if (!row.overtimeApplicable && field === 'overtimeHours') {
      return;
    }

    const numericFields: Array<keyof PayrollProcessRow> = [
      'mobileAllowance',
      'carAllowance',
      'otherAllowances',
      'bonus',
      'overtimeHours',
      'arrears',
      'loanAdjustment',
      'loanAdvForm',
      'lateAttendDeduction',
      'costToCompany',
    ];
    const parsed = numericFields.includes(field)
      ? this.parseAmount(value)
      : String(value);

    this.rowCache.update((cache) => {
      const current = cache.get(apiId);
      if (!current) {
        return cache;
      }
      const next = new Map(cache);
      next.set(apiId, this.recalculateRow({ ...current, [field]: parsed }));
      return next;
    });
  }

  openEmployeeProfile(apiId: string): void {
    if (!apiId) {
      return;
    }

    this.detailOpen.set(true);
    this.detailLoading.set(true);
    this.detailRecord.set(null);
    this.cdr.markForCheck();

    this.applicationFormService.fetchEmployeeProfileDetail(apiId).subscribe({
      next: (record) => {
        this.detailRecord.set(record);
        this.detailLoading.set(false);
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        this.detailOpen.set(false);
        this.detailLoading.set(false);
        this.detailRecord.set(null);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load employee details.'),
        );
        this.cdr.markForCheck();
      },
    });
  }

  closeEmployeeDetail(): void {
    this.detailOpen.set(false);
    this.detailLoading.set(false);
    this.detailRecord.set(null);
  }

  save(): void {
    if (this.saving()) {
      return;
    }

    const visibleEmployeeKeys = new Set(
      this.filteredEmployeeSummaries().map((summary) => this.resolveEmployeeKey(summary)),
    );
    const rows = Array.from(this.rowCache().values()).filter((row) =>
      visibleEmployeeKeys.has(row.apiId),
    );
    if (visibleEmployeeKeys.size === 0) {
      void this.alertService.validation('No employees available to save.');
      return;
    }

    const approvedRows = rows.filter((row) => row.approved);
    if (approvedRows.length === 0) {
      void this.alertService.validation('Select at least one approved employee before saving.');
      return;
    }

    this.saving.set(true);
    const payload = this.buildPayload(approvedRows);

    this.payrollProcessingService
      .addPayrollProcessing(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          void this.alertService.success(
            'Success',
            `Payroll process saved for ${approvedRows.length} approved employee(s).`,
          );
          this.back();
        },
        error: (error: unknown) => {
          void this.alertService.error(
            'Save Failed',
            formatApiErrorMessage(error, 'Failed to save payroll process.'),
          );
          this.cdr.markForCheck();
        },
      });
  }

  private buildPayload(rows: PayrollProcessRow[]): PayrollProcessingSubmitPayload {
    const monthLabel =
      this.monthOptions.find((option) => option.value === this.selectedMonth())?.label ??
      String(this.selectedMonth());
    const remarks = this.remarks().trim() || `${monthLabel} Payroll`;

    return {
      header: {
        month: this.selectedMonth(),
        year: this.selectedYear(),
        remarks,
        currency: this.currencyCode,
        status: 'Draft',
        processedBy: this.authService.getSessionUser()?.id ?? 1,
        processedDate: this.formatProcessedDate(new Date()),
        fuelPriceAdjust: this.fuelPriceAdjust(),
      },
      details: rows.map((row) => ({
        employeeId: row.apiId,
        employeeCode: row.employeeCode,
        personName: row.personName,
        basicSalary: row.basicSalary,
        grossSalary: row.grossSalary,
        grossSalaryInCash: row.grossSalaryInCash,
        grossSalaryInBank: row.grossSalaryInBank,
        medicalAllowance: row.medicalAllowance,
        allowedLiters: row.allowedLiters,
        monthlyFuelRate: row.monthlyFuelRate,
        fuelAllowance: row.fuelAllowance,
        mobileAllowance: row.mobileAllowance,
        carAllowance: row.carAllowance,
        otherAllowances: row.otherAllowances,
        bonus: row.bonus,
        lastMonthGrossSalary: row.lastMonthGrossSalary,
        overtimeHours: row.overtimeHours,
        overtime: row.overtime,
        providentFund: row.providentFund,
        providentFundEmployer: row.providentFundEmployer,
        socialSecurityPunjab: row.socialSecurityPunjab,
        socialSecurityKpk: row.socialSecurityKpk,
        gratuity: row.gratuity,
        eobiEmployee: row.eobiEmployee,
        eobiEmployer: row.eobiEmployer,
        arrears: row.arrears,
        loanAdjustment: row.loanAdjustment,
        loanAdvForm: row.loanAdvForm,
        lateAttendDeduction: row.lateAttendDeduction,
        costToCompany: row.costToCompany,
        taxDeduction: row.taxDeduction,
        totalEarnings: this.totalEarningsForRow(row),
        netPayable: this.grossPayableForRow(row),
        netPayableAfterTax: this.netPayableAfterTaxForRow(row),
        finalGrossSalary: row.grossSalary,
        approved: row.approved,
      })),
    };
  }

  private formatProcessedDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private loadEmployees(): void {
    this.loading.set(true);
    this.rowCache.set(new Map());
    this.applicationFormService.fetchEmployeeProfiles().subscribe({
      next: (records) => {
        this.loadLoggedInUserProfile();

        const withApiId = records
          .filter((record) => !!record.apiId)
          .sort((left, right) =>
            (left.EmployeeName || '').localeCompare(right.EmployeeName || '', undefined, {
              sensitivity: 'base',
            }),
          );

        this.employeeSummaries.set(withApiId);
        this.currentPage.set(1);
        this.loading.set(false);
        this.loadPayrollMonthLeaveDays();

        if (withApiId.length === 0) {
          this.cdr.markForCheck();
          return;
        }

        this.loadCurrentPageDetails();
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load employees.'),
        );
        this.cdr.markForCheck();
      },
    });
  }

  private loadLoanAdvances(): void {
    this.loanAdvanceService.fetchLoanAdvances().subscribe({
      next: () => {
        this.refreshPayrollRows();
        this.cdr.markForCheck();
      },
      error: () => {
        // Keep payroll usable even if loan/advance records fail to load.
      },
    });
  }

  private loadOvertimeRecords(): void {
    this.overtimeListService.fetchOvertimeList().subscribe({
      next: (records) => {
        this.overtimeRecords.set(records);
        this.rowCache.update((cache) => {
          const next = new Map(cache);
          for (const [apiId, row] of next) {
            next.set(apiId, this.recalculateRow({
              ...row,
              overtimeHours: sumSubmittedOvertimeHours(
                records,
                [row.employeeCode, row.apiId],
                this.getSelectedPayrollMonth(),
              ),
            }));
          }
          return next;
        });
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        void this.alertService.error(
          'Overtime Data Unavailable',
          formatApiErrorMessage(error, 'Submitted overtime hours could not be loaded.'),
        );
      },
    });
  }

  private loadPayrollMonthLeaveDays(): void {
    this.leaveDaysSub?.unsubscribe();
    this.leaveDaysByEmployee = new Map();
    this.loadingLeaveDays.set(true);
    this.leaveDaysLoadFailed.set(false);

    const employees = this.employeeSummaries();
    if (employees.length === 0) {
      this.loadingLeaveDays.set(false);
      return;
    }

    const [year, month] = this.getSelectedPayrollMonth().split('-').map(Number);
    const fromDate = `${this.getSelectedPayrollMonth()}-01`;
    const toDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

    this.leaveDaysSub = forkJoin({
      leaveRecords: this.leaveApplicationService.fetchLeaveApplicationsForDateRange(fromDate, toDate),
      attendanceSlots: this.attendanceManagementService.fetchDateRangeSlots(employees, fromDate, toDate),
    })
      .subscribe({
        next: ({ leaveRecords, attendanceSlots }) => {
          const absentDatesByEmployee = new Map<string, string[]>();
          for (const slot of attendanceSlots) {
            if (slot.status !== 'Absent') {
              continue;
            }
            const dates = absentDatesByEmployee.get(slot.employeeKey) ?? [];
            dates.push(slot.date);
            absentDatesByEmployee.set(slot.employeeKey, dates);
          }
          this.leaveDaysByEmployee = countPayrollLeaveDays(
            leaveRecords,
            this.getSelectedPayrollMonth(),
            absentDatesByEmployee,
          );
          this.rowCache.update((cache) => {
            const next = new Map(cache);
            for (const [apiId, row] of next) {
              const leaveDays = this.getLeaveDays(row.employeeCode);
              next.set(apiId, {
                ...row,
                paidLeaveDays: leaveDays.paid,
                unpaidLeaveDays: leaveDays.unpaid,
              });
            }
            return next;
          });
          this.loadingLeaveDays.set(false);
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          this.leaveDaysLoadFailed.set(true);
          this.loadingLeaveDays.set(false);
          void this.alertService.error(
            'Leave Days Unavailable',
            formatApiErrorMessage(error, 'Paid and unpaid leave days could not be loaded for this payroll month.'),
          );
          this.cdr.markForCheck();
        },
      });
  }

  private refreshPayrollRows(): void {
    this.rowCache.set(new Map());
    if (this.employeeSummaries().length > 0) {
      this.loadCurrentPageDetails();
    }
  }

  private loadCurrentPageDetails(): void {
    this.pageDetailsSub?.unsubscribe();
    const generation = ++this.pageDetailsGeneration;

    const missing = this.currentPageSummaries().filter(
      (summary) => !this.rowCache().has(this.resolveEmployeeKey(summary)),
    );

    if (missing.length === 0) {
      this.loadingPageDetails.set(false);
      return;
    }

    this.loadingPageDetails.set(true);

    this.pageDetailsSub = this.applicationFormService
      .fetchEmployeeProfileDetailsInBatches(missing, missing.length)
      .pipe(
        finalize(() => {
          if (generation !== this.pageDetailsGeneration) {
            return;
          }
          this.loadingPageDetails.set(false);
        }),
      )
      .subscribe({
        next: (records) => {
          if (generation !== this.pageDetailsGeneration) {
            return;
          }

          const rows = records.map((record) =>
            record.detail
              ? this.mapRecordToRow(record)
              : this.buildPlaceholderRowFromSummary(record),
          );

          this.rowCache.update((cache) => {
            const next = new Map(cache);
            for (const row of rows) {
              next.set(row.apiId, row);
            }
            return next;
          });
        },
        error: (error: unknown) => {
          if (generation !== this.pageDetailsGeneration) {
            return;
          }
          void this.alertService.error(
            'Load Failed',
            formatApiErrorMessage(error, 'Failed to load employee payroll details for this page.'),
          );
        },
      });
  }

  private resolveEmployeeKey(record: ApplicationFormRecord): string {
    return record.apiId ?? record.EmployeeCode;
  }

  private buildPlaceholderRowFromSummary(record: ApplicationFormRecord): PayrollProcessRow {
    return this.recalculateRow({
      apiId: this.resolveEmployeeKey(record),
      employeeCode: record.EmployeeCode,
      personName: record.EmployeeName,
      username: record.EmployeeCode,
      designation: record.Designation,
      department: record.Department,
      employeeCategory: record.EmploymentCategory,
      employmentNature: record.EmployeeNature,
      employmentType: record.EmploymentType,
      jobTitle: record.Designation,
      location: '',
      workGradeLevel: '',
      dateOfJoining: '',
      yearsOfService: 0,
      overtimeApplicable: false,
      allowancesApplicable: false,
      eobiApplicable: false,
      providentApplicable: false,
      basicSalary: 0,
      grossSalary: 0,
      grossSalaryInCash: 0,
      grossSalaryInBank: 0,
      paymentMode: '',
      medicalAllowance: 0,
      allowedLiters: 0,
      monthlyFuelRate: 0,
      fuelAllowance: 0,
      mobileAllowance: 0,
      carAllowance: 0,
      otherAllowances: 0,
      bonus: 0,
      lastMonthGrossSalary: 0,
      overtimeHours: 0,
      overtime: 0,
      providentFund: 0,
      providentFundEmployer: 0,
      socialSecurityPunjab: 0,
      socialSecurityKpk: 0,
      gratuity: 0,
      eobiEmployee: 0,
      eobiEmployer: 0,
      arrears: 0,
      loanAdjustment: 0,
      loanAdvForm: 0,
      lateAttendDeduction: 0,
      paidLeaveDays: this.getLeaveDays(record.EmployeeCode).paid,
      unpaidLeaveDays: this.getLeaveDays(record.EmployeeCode).unpaid,
      costToCompany: 0,
      taxDeduction: 0,
      approved: this.approvalForEmployee(this.resolveEmployeeKey(record)),
    });
  }

  private mapRecordToRow(record: ApplicationFormRecord): PayrollProcessRow {
    const detail = record.detail;
    const remuneration = detail?.remuneration;
    const employeeCode = record.EmployeeCode || detail?.loginDetails.employeeCode || '';
    const employeeName = detail?.personalInfo.personName || record.EmployeeName;
    // Application Form "Gross Salary" is stored in remuneration.basicSalary.
    const grossSalary = this.parseAmount(remuneration?.basicSalary ?? 0);
    const paymentMode = String(remuneration?.paymentMode ?? '');
    const cashPercentage = this.parseAmount(remuneration?.cashSalaryPercentage ?? 0);
    const bankPercentage = this.parseAmount(remuneration?.taxPercentage ?? 0);
    const grossSalaryBreakdown = computeGrossSalaryBreakdown(
      grossSalary,
      paymentMode,
      cashPercentage,
      bankPercentage,
    );
    const medicalAllowance = computeMedicalAllowance(grossSalaryBreakdown.grossSalaryInBank);
    const basicSalary = computeBasicSalary(grossSalaryBreakdown.grossSalaryInBank);
    const allowedLiters = this.parseFuelLiters(remuneration?.fuelLimit);
    const profileFuelAmount = this.parseAmount(remuneration?.fuelAllowances ?? 0);
    // Prefer a derived per-liter rate from profile fuel amount; otherwise Fuel Price Adjust is the rate.
    const monthlyFuelRate =
      allowedLiters > 0 && profileFuelAmount > 0
        ? profileFuelAmount / allowedLiters
        : 0;
    const lastMonthGrossSalary = this.resolveLastMonthGrossSalary(
      record.EmployeeCode,
      grossSalary,
    );

    return this.recalculateRow({
      apiId: record.apiId ?? record.EmployeeCode,
      employeeCode,
      personName: employeeName,
      username: detail?.loginDetails.userId || employeeCode,
      designation: record.Designation || detail?.personalInfo.designation || '',
      department: record.Department,
      employeeCategory: record.EmploymentCategory,
      employmentNature: record.EmployeeNature,
      employmentType: record.EmploymentType,
      jobTitle: detail?.personalInfo.designation ?? record.Designation,
      location: resolveBranchCode(detail?.personalInfo.branchLocation ?? ''),
      workGradeLevel: detail?.personalInfo.workGradeLevel ?? '',
      dateOfJoining: remuneration?.dateOfJoining ?? '',
      yearsOfService: 0,
      overtimeApplicable: this.isYesFlag(remuneration?.overTimeApplicable),
      allowancesApplicable: this.isYesFlag(remuneration?.allowancesApplicable),
      eobiApplicable: this.isYesFlag(remuneration?.eobiApplicable),
      providentApplicable: this.isYesFlag(remuneration?.providentApplicable),
      basicSalary,
      grossSalary,
      grossSalaryInCash: grossSalaryBreakdown.grossSalaryInCash,
      grossSalaryInBank: grossSalaryBreakdown.grossSalaryInBank,
      paymentMode,
      medicalAllowance,
      allowedLiters,
      monthlyFuelRate,
      fuelAllowance: 0,
      mobileAllowance: this.parseAmount(remuneration?.mobileAllowances ?? 0),
      carAllowance: this.parseAmount(remuneration?.carAllowances ?? 0),
      otherAllowances: this.parseAmount(remuneration?.otherAllowances ?? 0),
      bonus: 0,
      lastMonthGrossSalary,
      overtimeHours: sumSubmittedOvertimeHours(
        this.overtimeRecords(),
        [employeeCode, record.apiId ?? ''],
        this.getSelectedPayrollMonth(),
      ),
      overtime: 0,
      providentFund: 0,
      providentFundEmployer: 0,
      socialSecurityPunjab: 0,
      socialSecurityKpk: 0,
      gratuity: 0,
      eobiEmployee: 0,
      eobiEmployer: 0,
      arrears: 0,
      loanAdjustment: this.resolvePayrollLoanAdjustment(employeeCode, employeeName),
      loanAdvForm: this.resolvePayrollAdvanceDeduction(employeeCode, employeeName),
      lateAttendDeduction: 0,
      paidLeaveDays: this.getLeaveDays(employeeCode).paid,
      unpaidLeaveDays: this.getLeaveDays(employeeCode).unpaid,
      costToCompany: 0,
      taxDeduction: 0,
      approved: this.approvalForEmployee(record.apiId ?? record.EmployeeCode),
    });
  }

  private recalculateRow(row: PayrollProcessRow): PayrollProcessRow {
    // Gross comes from Application Form; medical and basic are derived from it.
    const grossSalary = row.grossSalary > 0 ? row.grossSalary : row.basicSalary;
    const grossSalaryBreakdown = {
      grossSalaryInCash: row.grossSalaryInCash || 0,
      grossSalaryInBank: row.grossSalaryInBank || 0,
    };

    const medicalAllowance = computeMedicalAllowance(grossSalaryBreakdown.grossSalaryInBank);
    const basicSalary = computeBasicSalary(grossSalaryBreakdown.grossSalaryInBank);
    const providentFund = row.providentApplicable ? computeProvidentFund(basicSalary) : 0;

    const effectiveFuelRate = row.monthlyFuelRate + this.fuelPriceAdjust();
    const fuelAllowance = row.allowancesApplicable
      ? computeFuelAllowance(row.allowedLiters, effectiveFuelRate)
      : 0;
    const mobileAllowance = row.allowancesApplicable ? row.mobileAllowance : 0;
    const carAllowance = row.allowancesApplicable ? row.carAllowance : 0;
    const otherAllowances = row.allowancesApplicable ? row.otherAllowances : 0;

    const overtimeHours = row.overtimeApplicable ? row.overtimeHours : 0;
    const overtime = row.overtimeApplicable
      ? computeOvertimeAmount(computeOvertimeRate(row.lastMonthGrossSalary), overtimeHours)
      : 0;

    const gratuity = computeGratuity(
      grossSalaryBreakdown.grossSalaryInBank,
      row.dateOfJoining,
      this.getPayrollAsOfDate(),
    );
    const minimumWage = this.minimumWageAdjust();
    // Compute EOBI based on configured minimum wage so values are visible when set.
    // Applicability is still retained for display/validation, but EOBI amounts
    // are derived from the minimum wage regardless of the flag to avoid empty columns.
    const eobiEmployee = computeEobiEmployeeContribution(minimumWage);
    const eobiEmployer = computeEobiEmployerContribution(minimumWage);

    // Social Security calculation based on branch
    const socialSecurityPunjab = this.calculateSocialSecurityPunjab(
      minimumWage,
      grossSalaryBreakdown.grossSalaryInBank,
      row.location,
    );
    const socialSecurityKpk = this.calculateSocialSecurityKpk(
      minimumWage,
      grossSalaryBreakdown.grossSalaryInBank,
      row.location,
    );
    const leaveDeduction = Math.trunc(((grossSalary * 12) / 365) * row.unpaidLeaveDays);
    const costToCompany =
      grossSalary +
      fuelAllowance +
      mobileAllowance +
      carAllowance +
      otherAllowances +
      row.bonus +
      overtime +
      eobiEmployer +
      row.arrears +
      gratuity +
      providentFund -
      (socialSecurityPunjab + socialSecurityKpk + eobiEmployee + providentFund + row.loanAdjustment + row.loanAdvForm + leaveDeduction);
    const taxDeduction = computeMonthlyWithholdingTax(
      grossSalaryBreakdown.grossSalaryInBank,
      this.withholdingTaxBrackets(),
    );

    return {
      ...row,
      basicSalary,
      medicalAllowance,
      grossSalary,
      grossSalaryInCash: grossSalaryBreakdown.grossSalaryInCash,
      grossSalaryInBank: grossSalaryBreakdown.grossSalaryInBank,
      fuelAllowance,
      mobileAllowance,
      carAllowance,
      otherAllowances,
      overtimeHours,
      overtime,
      providentFund,
      providentFundEmployer: providentFund,
      socialSecurityPunjab,
      socialSecurityKpk,
      gratuity,
      eobiEmployee,
      eobiEmployer,
      lateAttendDeduction: leaveDeduction,
      costToCompany,
      taxDeduction,
    };
  }

  private loadWithholdingTaxes(): void {
    this.withholdingTaxService.fetchWithholdingTaxes().subscribe({
      next: (brackets) => {
        this.withholdingTaxBrackets.set(brackets);
        this.rowCache.update((cache) => {
          const next = new Map(cache);
          for (const [id, row] of next) {
            next.set(id, this.recalculateRow(row));
          }
          return next;
        });
        this.cdr.markForCheck();
      },
      error: () => {
        // Payroll remains usable when withholding tax setup is unavailable.
      },
    });
  }

  private getPayrollAsOfDate(): Date {
    const year = this.selectedYear();
    const month = this.selectedMonth();
    return new Date(year, month - 1, 1);
  }

  private calculateSocialSecurityPunjab(
    minimumWage: number,
    grossSalaryInBank: number,
    location: string,
  ): number {
    return this.parseAmount(
      computeSocialSecurityPunjab(minimumWage, grossSalaryInBank, location || ''),
    );
  }

  private calculateSocialSecurityKpk(
    minimumWage: number,
    grossSalaryInBank: number,
    location: string,
  ): number {
    return this.parseAmount(
      computeSocialSecurityKpk(minimumWage, grossSalaryInBank, location || ''),
    );
  }

  /** Reads application-form Fuel Limit (liters), tolerating formatted API values. */
  private parseFuelLiters(value: string | number | null | undefined): number {
    const formatted = this.applicationFormService.formatFuelLimitForForm(value);
    if (!formatted) {
      return 0;
    }
    return this.parseAmount(formatted.replace(/,/g, ''));
  }

  private isYesFlag(value: string | undefined): boolean {
    const normalized = (value ?? '').trim().toLowerCase();
    return normalized === 'yes' || normalized === 'y' || normalized === '1' || normalized === 'true';
  }

  private resolvePayrollLoanAdjustment(employeeCode: string, employeeName: string): number {
    const loanRecord = this.findLoanAdvanceRecord(employeeCode, employeeName, false);
    if (!loanRecord) {
      return 0;
    }

    return this.parseAmount(
      loanRecord.RepaymentSchedule.installmentAmount ||
        loanRecord.RepaymentSchedule.deductionAmount ||
        loanRecord.LoanDetail.newLoanRequest.installmentAmount ||
        '0',
    );
  }

  private resolvePayrollAdvanceDeduction(employeeCode: string, employeeName: string): number {
    const advanceRecord = this.findLoanAdvanceRecord(employeeCode, employeeName, true);
    if (!advanceRecord) {
      return 0;
    }

    return this.parseAmount(
      advanceRecord.AdvanceDetail.advanceAmountToBeDeductedThisMonth ||
        advanceRecord.RepaymentSchedule.deductionAmount ||
        advanceRecord.AdvanceDetail.newAdvanceRequest.advanceAmountRequested ||
        '0',
    );
  }

  private findLoanAdvanceRecord(
    employeeCode: string,
    employeeName: string,
    salaryAdvance: boolean,
  ): LoanAdvanceRecord | undefined {
    const normalizedCode = employeeCode.trim().toLowerCase();
    const normalizedName = employeeName.trim().toLowerCase();
    const selectedPayrollMonth = this.getSelectedPayrollMonth();

    return [...this.loanAdvanceService.loans()]
      .sort((left, right) => right.Id - left.Id)
      .find((record) => {
        const requestType = this.resolveLoanRequestType(record);
        const matchesRequestType = salaryAdvance
          ? requestType === 'salary advance' || requestType === 'salary_advance' || requestType === 'advance'
          : requestType === 'loan';

        if (!matchesRequestType) {
          return false;
        }

        const recordEmployeeCode = (record.EmployeeID || record.HeaderInfo.employeeID || '').trim().toLowerCase();
        const recordEmployeeName = (record.EmployeeName || record.HeaderInfo.employeeName || '').trim().toLowerCase();
        const matchesEmployee =
          (normalizedCode && recordEmployeeCode === normalizedCode) ||
          (!normalizedCode && normalizedName && recordEmployeeName === normalizedName) ||
          (normalizedCode && recordEmployeeName === normalizedName);

        if (!matchesEmployee) {
          return false;
        }

        const recordPayrollMonth = this.normalizePayrollMonth(
          record.PayrollMonth || record.HeaderInfo.payrollMonth || '',
        );

        return !recordPayrollMonth || recordPayrollMonth === selectedPayrollMonth;
      });
  }

  private resolveLoanRequestType(record: LoanAdvanceRecord): string {
    return (record.RequestType || record.HeaderInfo.requestType || '').trim().toLowerCase();
  }

  private getSelectedPayrollMonth(): string {
    return `${this.selectedYear()}-${String(this.selectedMonth()).padStart(2, '0')}`;
  }

  private getLeaveDays(employeeCode: string): PayrollLeaveDayCounts {
    return this.leaveDaysByEmployee.get(canonicalAttendanceKey(employeeCode)) ?? { paid: 0, unpaid: 0 };
  }

  private normalizePayrollMonth(value: string): string {
    const trimmed = value.trim();
    const directMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
    if (directMatch) {
      return `${directMatch[1]}-${directMatch[2]}`;
    }

    const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-\d{2}$/);
    if (dateMatch) {
      return `${dateMatch[1]}-${dateMatch[2]}`;
    }

    return '';
  }

  private resolveLastMonthGrossSalary(employeeCode: string, grossSalary: number): number {
    const cached = this.lastMonthGrossSalaryCache.get(employeeCode);
    if (cached !== undefined) {
      return cached;
    }

    const priorRecords = this.payrollSetupService
      .records()
      .filter((record) => record.employeeId === employeeCode)
      .sort((a, b) => b.id - a.id);

    const result =
      priorRecords.length > 0
        ? computeGrossSalary(priorRecords[0].basicSalary, priorRecords[0].medicalAllowance)
        : grossSalary;

    this.lastMonthGrossSalaryCache.set(employeeCode, result);
    return result;
  }

  private buildYearOptions(): number[] {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let year = currentYear - 5; year <= currentYear + 5; year += 1) {
      years.push(year);
    }
    return years;
  }

  private loadLoggedInUserProfile(): void {
    const sessionUserId = this.authService.getSessionUserId();
    const employeeRecord = this.applicationFormService.getSignedInUserRecord(sessionUserId);

    if (!employeeRecord) {
      this.refreshLoggedInUserFields();
      return;
    }

    const existingUserId = employeeRecord.detail?.loginDetails.userId?.trim();
    if (existingUserId) {
      this.loggedInUserId.set(existingUserId);
      this.loggedInUserName.set(this.resolveLoggedInUserName(employeeRecord));
      this.cdr.markForCheck();
      return;
    }

    const apiId = employeeRecord.apiId;
    if (!apiId) {
      this.refreshLoggedInUserFields();
      return;
    }

    this.applicationFormService.fetchEmployeeProfileDetail(apiId).subscribe({
      next: (record) => {
        const userId = record.detail?.loginDetails.userId?.trim();
        if (userId) {
          this.loggedInUserId.set(userId);
        } else {
          this.loggedInUserId.set(this.resolveLoggedInUserId(record));
        }

        const name =
          record.EmployeeName?.trim() ||
          record.detail?.loginDetails.employeeName?.trim() ||
          record.detail?.personalInfo.personName?.trim();
        if (name) {
          this.loggedInUserName.set(name);
        } else {
          this.loggedInUserName.set(this.resolveLoggedInUserName(record));
        }

        this.cdr.markForCheck();
      },
      error: () => {
        this.refreshLoggedInUserFields();
      },
    });
  }

  private refreshLoggedInUserFields(): void {
    this.loggedInUserId.set(this.resolveLoggedInUserId());
    this.loggedInUserName.set(this.resolveLoggedInUserName());
    this.cdr.markForCheck();
  }

  private resolveLoggedInUserId(record?: ApplicationFormRecord): string {
    const employeeRecord =
      record ??
      this.applicationFormService.getSignedInUserRecord(this.authService.getSessionUserId());
    const loginUserId = employeeRecord?.detail?.loginDetails.userId?.trim();
    if (loginUserId) {
      return loginUserId;
    }

    const sessionUser = this.authService.getSessionUser();
    if (sessionUser?.id) {
      return String(sessionUser.id);
    }

    return this.authService.getSessionUserId()?.trim() || '—';
  }

  private resolveLoggedInUserName(record?: ApplicationFormRecord): string {
    const employeeRecord =
      record ??
      this.applicationFormService.getSignedInUserRecord(this.authService.getSessionUserId());
    if (employeeRecord?.EmployeeName?.trim()) {
      return employeeRecord.EmployeeName.trim();
    }

    const sessionUser = this.authService.getSessionUser();
    if (sessionUser?.name?.trim()) {
      return sessionUser.name.trim();
    }

    return this.authService.getSessionUserId()?.trim() || '—';
  }
}
