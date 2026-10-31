import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PageToolbarComponent } from '../../../page-toolbar/page-toolbar';
import { AlertService } from '../../../../services/alert.service';
import {
  PayrollProcessingDetailPayload,
  PayrollProcessingListRecord,
  PayrollProcessingRecord,
  PayrollProcessingService,
} from '../../../../services/payroll-processing.service';
import { formatApiErrorMessage } from '../../../../utils/api-error.util';
import {
  buildPaginationFooterItems,
  paginationItemTrack,
  PaginationFooterItem,
} from '../../../../utils/pagination.util';
import { PayrollMasterLayoutService } from '../payroll-master-layout.service';
import { PermissionService } from '../../../../services/permission.service';

const PAYROLL_PROCESSING_MODULE = 'payroll_processing_form';

type PayrollProcessingColumnKey = Exclude<keyof PayrollProcessingListRecord, never>;
type PayrollDetailColumnKind = 'text' | 'amount' | 'number' | 'boolean';

interface PayrollDetailColumn {
  key: keyof PayrollProcessingDetailPayload;
  label: string;
  kind: PayrollDetailColumnKind;
}

const PAYROLL_DETAIL_COLUMNS: PayrollDetailColumn[] = [
  { key: 'employeeId', label: 'Employee ID', kind: 'text' },
  { key: 'employeeCode', label: 'Employee Code', kind: 'text' },
  { key: 'personName', label: 'Name', kind: 'text' },
  { key: 'username', label: 'Username', kind: 'text' },
  { key: 'designation', label: 'Designation', kind: 'text' },
  { key: 'department', label: 'Department', kind: 'text' },
  { key: 'employeeCategory', label: 'Employee Category', kind: 'text' },
  { key: 'employmentNature', label: 'Employment Nature', kind: 'text' },
  { key: 'employmentType', label: 'Employment Type', kind: 'text' },
  { key: 'jobTitle', label: 'Job Title', kind: 'text' },
  { key: 'branch', label: 'Branch', kind: 'text' },
  { key: 'location', label: 'Location', kind: 'text' },
  { key: 'workGradeLevel', label: 'Work Grade Level', kind: 'text' },
  { key: 'dateOfJoining', label: 'Date of Joining', kind: 'text' },
  { key: 'yearsOfService', label: 'Years of Service', kind: 'number' },
  { key: 'overtimeApplicable', label: 'Overtime Applicable', kind: 'boolean' },
  { key: 'allowancesApplicable', label: 'Allowances Applicable', kind: 'boolean' },
  { key: 'eobiApplicable', label: 'EOBI Applicable', kind: 'boolean' },
  { key: 'providentApplicable', label: 'Provident Fund Applicable', kind: 'boolean' },
  { key: 'basicSalary', label: 'Basic Salary', kind: 'amount' },
  { key: 'grossSalary', label: 'Gross Salary', kind: 'amount' },
  { key: 'grossSalaryInCash', label: 'Gross Salary in Cash', kind: 'amount' },
  { key: 'grossSalaryInBank', label: 'Gross Salary in Bank', kind: 'amount' },
  { key: 'childBenefits', label: 'Child Benefits', kind: 'amount' },
  { key: 'paymentMode', label: 'Payment Mode', kind: 'text' },
  { key: 'medicalAllowance', label: 'Medical Allowance', kind: 'amount' },
  { key: 'allowedLiters', label: 'Petrol Liters', kind: 'number' },
  { key: 'monthlyFuelRate', label: 'Monthly Fuel Rate', kind: 'amount' },
  { key: 'fuelAllowance', label: 'Fuel Allowance', kind: 'amount' },
  { key: 'mobileAllowance', label: 'Mobile Allowance', kind: 'amount' },
  { key: 'carAllowance', label: 'Car Allowance', kind: 'amount' },
  { key: 'otherAllowances', label: 'Other Allowances', kind: 'amount' },
  { key: 'bonus', label: 'Bonus', kind: 'amount' },
  { key: 'lastMonthGrossSalary', label: 'Last Month Gross Salary', kind: 'amount' },
  { key: 'overtimeHours', label: 'Overtime Hours', kind: 'number' },
  { key: 'overtime', label: 'Overtime', kind: 'amount' },
  { key: 'providentFundEmployer', label: 'Provident Fund (Employer)', kind: 'amount' },
  { key: 'providentFund', label: 'Provident Fund (Employee)', kind: 'amount' },
  { key: 'socialSecurityPunjab', label: 'Social Security Punjab', kind: 'amount' },
  { key: 'socialSecurityKpk', label: 'Social Security KPK', kind: 'amount' },
  { key: 'eobiEmployer', label: 'EOBI Employer', kind: 'amount' },
  { key: 'eobiEmployee', label: 'EOBI Employee', kind: 'amount' },
  { key: 'arrears', label: 'Arrears', kind: 'amount' },
  { key: 'gratuity', label: 'Gratuity', kind: 'amount' },
  { key: 'paidLeaveDays', label: 'Paid Leave Days', kind: 'number' },
  { key: 'unpaidLeaveDays', label: 'Unpaid Leave Days', kind: 'number' },
  { key: 'loanAdjustment', label: 'Loan Deduction', kind: 'amount' },
  { key: 'loanAdvForm', label: 'Advance Deduction', kind: 'amount' },
  { key: 'lateAttendDeduction', label: 'Leave Deduction', kind: 'amount' },
  { key: 'costToCompany', label: 'Cost to Company', kind: 'amount' },
  { key: 'taxDeduction', label: 'Tax Deduction', kind: 'amount' },
  { key: 'totalEarnings', label: 'Total Earnings', kind: 'amount' },
  { key: 'netPayable', label: 'Gross Payable', kind: 'amount' },
  { key: 'netPayableAfterTax', label: 'Net Payable (Tax)', kind: 'amount' },
  { key: 'netPayableManagement', label: 'Net Payable (Management)', kind: 'amount' },
  { key: 'finalGrossSalary', label: 'Final Gross Salary', kind: 'amount' },
  { key: 'approved', label: 'Approved', kind: 'boolean' },
];

const PAYROLL_EXCEL_COLUMNS: PayrollDetailColumn[] = [
  { key: 'employeeId', label: 'Employee ID', kind: 'text' },
  { key: 'personName', label: 'Employee Name', kind: 'text' },
  { key: 'basicSalary', label: 'Basic Salary', kind: 'amount' },
  { key: 'grossSalary', label: 'Gross Salary', kind: 'amount' },
  { key: 'grossSalaryInCash', label: 'Gross Salary in Cash', kind: 'amount' },
  { key: 'grossSalaryInBank', label: 'Gross Salary in Bank', kind: 'amount' },
  { key: 'childBenefits', label: 'Child Benefits', kind: 'amount' },
  { key: 'medicalAllowance', label: 'Medical', kind: 'amount' },
  { key: 'allowedLiters', label: 'Petrol Liters', kind: 'number' },
  { key: 'fuelAllowance', label: 'Fuel', kind: 'amount' },
  { key: 'mobileAllowance', label: 'Mobile', kind: 'amount' },
  { key: 'carAllowance', label: 'Car', kind: 'amount' },
  { key: 'otherAllowances', label: 'Other Allowances', kind: 'amount' },
  { key: 'bonus', label: 'Bonus', kind: 'amount' },
  { key: 'overtimeHours', label: 'Overtime Hours (Month Total)', kind: 'number' },
  { key: 'overtime', label: 'Overtime', kind: 'amount' },
  { key: 'providentFundEmployer', label: 'P.Fund (Employer)', kind: 'amount' },
  { key: 'providentFund', label: 'P.Fund (Employee)', kind: 'amount' },
  { key: 'socialSecurityPunjab', label: 'Punjab', kind: 'amount' },
  { key: 'socialSecurityKpk', label: 'KPK', kind: 'amount' },
  { key: 'eobiEmployer', label: 'EOBI (Employer)', kind: 'amount' },
  { key: 'eobiEmployee', label: 'EOBI (Employee)', kind: 'amount' },
  { key: 'arrears', label: 'Arrears', kind: 'amount' },
  { key: 'gratuity', label: 'Gratuity', kind: 'amount' },
  { key: 'paidLeaveDays', label: 'Paid', kind: 'number' },
  { key: 'unpaidLeaveDays', label: 'Unpaid', kind: 'number' },
  { key: 'loanAdjustment', label: 'Loan Deduction', kind: 'amount' },
  { key: 'loanAdvForm', label: 'Advance Deduction', kind: 'amount' },
  { key: 'lateAttendDeduction', label: 'Leaves Deduction', kind: 'amount' },
  { key: 'netPayable', label: 'Gross Payable', kind: 'amount' },
  { key: 'taxDeduction', label: 'Tax Deduction', kind: 'amount' },
  { key: 'netPayableAfterTax', label: 'Net Payable (TAX)', kind: 'amount' },
  { key: 'netPayableManagement', label: 'Net Payable (Management)', kind: 'amount' },
];

@Component({
  selector: 'app-payroll-processing',
  standalone: true,
  imports: [CommonModule, FormsModule, PageToolbarComponent],
  templateUrl: './payroll-processing.html',
  styleUrl: '../../Application-Form/Application-Form.css',
  styles: [`
    .payroll-list-row {
      cursor: pointer;
    }
    .payroll-list-row:hover td {
      background: #f8fafc;
    }
    .payroll-list-pagination {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }
    .payroll-list-pagination__bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
    }
    .payroll-list-pagination .pagination-controls {
      flex: 1;
      flex-wrap: nowrap;
      justify-content: center;
      min-width: 0;
    }
    .payroll-list-pagination__numbers {
      flex-wrap: nowrap;
      align-items: center;
      overflow-x: auto;
      scrollbar-width: thin;
    }
    .payroll-list-pagination__comma {
      color: #6a6d70;
      padding: 0 2px;
      user-select: none;
    }
    .payroll-list-pagination__ellipsis {
      color: #6a6d70;
      letter-spacing: 0.08em;
      padding: 0 8px;
      user-select: none;
      font-weight: 600;
      min-width: 32px;
      height: 32px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      cursor: pointer;
    }
    .payroll-list-pagination__ellipsis:hover {
      border-color: #d0d7de;
      background: #f5f6f7;
      color: #32363a;
    }
  `],
})
export class PayrollProcessingComponent implements OnInit {
  private readonly layout = inject(PayrollMasterLayoutService);
  private readonly router = inject(Router);
  private readonly payrollProcessingService = inject(PayrollProcessingService);
  private readonly alertService = inject(AlertService);
  private readonly permissionService = inject(PermissionService);

  readonly loading = signal(false);
  readonly showViewDialog = signal(false);
  readonly viewLoading = signal(false);
  readonly selectedRecord = signal<PayrollProcessingRecord | null>(null);
  readonly payrollDetailColumns = PAYROLL_DETAIL_COLUMNS;
  searchText = '';
  selectedStatus = '';
  showDialog = false;
  activeTab: 'filter' = 'filter';
  currentPage = 1;
  pageSize = 25;
  readonly pageSizeOptions = [10, 25, 50, 100];
  Math = Math;

  readonly columns: Array<{ key: PayrollProcessingColumnKey; label: string; visible: boolean }> = [
    { key: 'Id', label: 'ID', visible: true },
    { key: 'Month', label: 'Month', visible: true },
    { key: 'Year', label: 'Year', visible: true },
    { key: 'Remarks', label: 'Remarks', visible: true },
    { key: 'Currency', label: 'Currency', visible: true },
    { key: 'Status', label: 'Status', visible: true },
    { key: 'ProcessedBy', label: 'Processed By', visible: false },
    { key: 'ProcessedDate', label: 'Processed Date', visible: true },
    { key: 'EmployeeCount', label: 'Employees', visible: true },
  ];

  trackPaginationItem(index: number, item: PaginationFooterItem): string {
    return paginationItemTrack(index, item);
  }

  ngOnInit(): void {
    this.loadRecords();
  }

  get payrollProcessingList(): PayrollProcessingListRecord[] {
    return this.payrollProcessingService.records();
  }

  get statusOptions(): string[] {
    const seen = new Set<string>();
    for (const row of this.payrollProcessingList) {
      const status = row.Status?.trim();
      if (status) {
        seen.add(status);
      }
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  get filteredPayrollRows(): PayrollProcessingListRecord[] {
    let list = this.payrollProcessingList;

    if (this.selectedStatus) {
      list = list.filter((row) => row.Status === this.selectedStatus);
    }

    if (!this.searchText.trim()) {
      return list;
    }

    const search = this.searchText.toLowerCase();
    return list.filter((row) =>
      String(row.Id).includes(search) ||
      this.formatMonth(row.Month).toLowerCase().includes(search) ||
      String(row.Year).includes(search) ||
      row.Remarks.toLowerCase().includes(search) ||
      row.Currency.toLowerCase().includes(search) ||
      row.Status.toLowerCase().includes(search) ||
      row.ProcessedDate.toLowerCase().includes(search) ||
      String(row.EmployeeCount).includes(search),
    );
  }

  get paginatedPayrollRows(): PayrollProcessingListRecord[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredPayrollRows.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredPayrollRows.length / this.pageSize));
  }

  get paginationFooterItems(): PaginationFooterItem[] {
    return buildPaginationFooterItems(this.totalPages, this.currentPage);
  }

  get visibleColumns(): Array<{ key: PayrollProcessingColumnKey; label: string; visible: boolean }> {
    return this.columns.filter((column) => column.visible);
  }

  getCellValue(row: PayrollProcessingListRecord, key: PayrollProcessingColumnKey): string | number {
    if (key === 'Month') {
      return this.formatMonth(row.Month);
    }
    if (key === 'ProcessedDate') {
      return this.formatProcessedDate(row.ProcessedDate);
    }
    return row[key];
  }

  formatMonth(month: number): string {
    const labels = [
      '',
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return labels[month] ?? String(month);
  }

  formatProcessedDate(value: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      return '';
    }

    const directMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (directMatch) {
      return `${directMatch[3]}/${directMatch[2]}/${directMatch[1]}`;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return trimmed;
    }

    const day = String(parsed.getDate()).padStart(2, '0');
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const year = parsed.getFullYear();
    return `${day}/${month}/${year}`;
  }

  onSearchChange(): void {
    this.currentPage = 1;
  }

  onFilterChange(): void {
    this.currentPage = 1;
  }

  setPage(page: number): void {
    if (page < 1 || page > this.totalPages) {
      return;
    }
    this.currentPage = page;
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
  }

  isLastPageActive(): boolean {
    return this.currentPage === this.totalPages;
  }

  openDialog(): void {
    this.showDialog = true;
  }

  closeDialog(): void {
    this.showDialog = false;
  }

  createPayrollProcess(): void {
    if (!this.permissionService.assertCan(PAYROLL_PROCESSING_MODULE, 'add')) {
      return;
    }

    void this.router.navigateByUrl('/payroll-master/payroll-processing/create');
  }

  formatMoney(value: number, currency = 'PKR'): string {
    return `${currency} ${value.toLocaleString('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  formatDetailValue(
    detail: PayrollProcessingDetailPayload,
    column: PayrollDetailColumn,
    currency: string,
  ): string {
    const value = detail[column.key];
    if (column.kind === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (column.kind === 'amount') {
      return this.formatMoney(Number(value) || 0, currency);
    }
    return value === '' || value === null || value === undefined
      ? '—'
      : String(value);
  }

  viewRecord(record: PayrollProcessingListRecord): void {
    if (!this.permissionService.assertCan(PAYROLL_PROCESSING_MODULE, 'view')) {
      return;
    }

    if (!record.Id) {
      void this.alertService.warning('View', 'Unable to view this row: missing payroll process id.');
      return;
    }

    this.showViewDialog.set(true);
    this.selectedRecord.set(null);
    this.viewLoading.set(true);

    this.payrollProcessingService.fetchPayrollProcessingDetail(record.Id).subscribe({
      next: (detail) => {
        this.selectedRecord.set(detail);
        this.viewLoading.set(false);
      },
      error: (error: unknown) => {
        this.viewLoading.set(false);
        this.showViewDialog.set(false);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load payroll process details.'),
        );
      },
    });
  }

  exportToExcel(record: PayrollProcessingListRecord): void {
    if (!this.permissionService.assertCan(PAYROLL_PROCESSING_MODULE, 'view')) {
      return;
    }

    if (!record.Id) {
      void this.alertService.warning('Export', 'Unable to export this row: missing payroll process id.');
      return;
    }

    this.viewLoading.set(true);
    this.payrollProcessingService.fetchPayrollProcessingDetail(record.Id).subscribe({
      next: (detail) => {
        try {
          const rows = Array.isArray(detail.Details) ? detail.Details.slice() : [];
          rows.sort((a, b) => String(a.employeeCode).localeCompare(String(b.employeeCode), undefined, { sensitivity: 'base' }));

          const escape = (v: unknown) => {
            if (v === null || v === undefined) {
              return '';
            }
            const s = String(v);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
              return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
          };

          const formatNumber = (n: unknown) => {
            const num = Number(n);
            return Number.isFinite(num) ? num.toFixed(2) : '';
          };

          const headers = PAYROLL_EXCEL_COLUMNS.map((column) => column.label);
          const lines = [headers.join(',')];
          for (const r of rows) {
            const line = PAYROLL_EXCEL_COLUMNS.map((column) => {
              const value = r[column.key];
              if (column.kind === 'boolean') {
                return escape(value ? 'Yes' : 'No');
              }
              if (column.kind === 'amount' || column.kind === 'number') {
                return formatNumber(value);
              }
              return escape(value);
            }).join(',');
            lines.push(line);
          }

          const csv = lines.join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const monthLabel = this.formatMonth(detail.Header.month) || String(detail.Header.month || '');
          const yearLabel = String(detail.Header.year || '');
          const filename = `payroll_${record.Id}_${monthLabel}_${yearLabel}.csv`;
          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          link.setAttribute('href', url);
          link.setAttribute('download', filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } catch (err) {
          void this.alertService.error('Export Failed', 'Failed to generate CSV for export.');
        } finally {
          this.viewLoading.set(false);
        }
      },
      error: (error: unknown) => {
        this.viewLoading.set(false);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load payroll process details for export.'),
        );
      },
    });
  }

  closeViewDialog(): void {
    this.showViewDialog.set(false);
    this.selectedRecord.set(null);
    this.viewLoading.set(false);
  }

  toggleSidebar(): void {
    this.layout.toggleSidebar();
  }

  private loadRecords(): void {
    this.loading.set(true);
    this.payrollProcessingService.fetchPayrollProcessingList().subscribe({
      next: () => {
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load payroll processing list.'),
        );
      },
    });
  }
}
