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
  PayrollProcessingSubmitPayload,
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
  { key: 'extraWorkingDay', label: 'Extra working day', kind: 'number' },
  { key: 'rateExtraDay', label: 'Rate (extra day)', kind: 'amount' },
  { key: 'paymentForEwd', label: 'Payment for EWD', kind: 'amount' },
  { key: 'loanAdjustment', label: 'Loan Deduction', kind: 'amount' },
  { key: 'loanAdvForm', label: 'Advance Deduction', kind: 'amount' },
  { key: 'deductions', label: 'Deductions', kind: 'amount' },
  { key: 'lateAttendDeduction', label: 'Leave Deduction', kind: 'amount' },
  { key: 'costToCompany', label: 'Cost to Company', kind: 'amount' },
  { key: 'taxDeduction', label: 'Tax Deduction', kind: 'amount' },
  { key: 'totalEarnings', label: 'Total Earnings', kind: 'amount' },
  { key: 'netPayable', label: 'Gross Payable', kind: 'amount' },
  { key: 'netPayableAfterTax', label: 'Balance', kind: 'amount' },
  { key: 'netPayableManagement', label: 'Net Payable (Management)', kind: 'amount' },
  { key: 'finalGrossSalary', label: 'Final Gross Salary', kind: 'amount' },
  { key: 'approved', label: 'Approved', kind: 'boolean' },
];

interface PayrollExcelColumn extends Omit<PayrollDetailColumn, 'key'> {
  key: keyof PayrollProcessingDetailPayload;
}

const PAYROLL_SAVED_LINE_COLUMNS: PayrollDetailColumn[] = [
  { key: 'costCenter', label: 'Cost Center', kind: 'text' },
  { key: 'salary', label: 'Saved Salary', kind: 'amount' },
  { key: 'ratePerDay', label: 'Rate per Day', kind: 'amount' },
  { key: 'absentDays', label: 'Absent Days', kind: 'number' },
  { key: 'absentAmount', label: 'Absent Amount', kind: 'amount' },
  { key: 'payableAmount', label: 'Payable Amount', kind: 'amount' },
  { key: 'extraWorkingDays', label: 'Extra Working Days', kind: 'number' },
  { key: 'advance', label: 'Advance', kind: 'amount' },
  { key: 'balance', label: 'Balance', kind: 'amount' },
  { key: 'netPaid', label: 'Net Paid', kind: 'amount' },
  { key: 'counting', label: 'Counting', kind: 'amount' },
];

type PayrollSubmitLine = PayrollProcessingSubmitPayload['details'][number];

interface PayrollPrintColumn {
  key: keyof PayrollSubmitLine | 'signature';
  label: string;
  kind: PayrollDetailColumnKind;
  value: (detail: PayrollProcessingDetailPayload) => unknown;
}

const PAYROLL_PRINT_COLUMNS: PayrollPrintColumn[] = [
  { key: 'employeeCode', label: 'Employee Code', kind: 'text', value: (detail) => detail.employeeCode },
  { key: 'employeeName', label: 'Employee Name', kind: 'text', value: (detail) => detail.personName },
  { key: 'designation', label: 'Designation', kind: 'text', value: (detail) => detail.designation },
  { key: 'salary', label: 'Salary', kind: 'amount', value: (detail) => detail.salary },
  { key: 'grossSalary', label: 'Gross Salary', kind: 'amount', value: (detail) => detail.grossSalary },
  { key: 'ratePerDay', label: 'Rate per Day', kind: 'amount', value: (detail) => detail.ratePerDay },
  { key: 'absentDays', label: 'Absent Days', kind: 'number', value: (detail) => detail.absentDays },
  { key: 'absentAmount', label: 'Absent Amount', kind: 'amount', value: (detail) => detail.absentAmount },
  { key: 'payableAmount', label: 'Payable Amount', kind: 'amount', value: (detail) => detail.payableAmount },
  {
    key: 'extraWorkingDays',
    label: 'Extra Working Days',
    kind: 'number',
    value: (detail) => detail.extraWorkingDays,
  },
  { key: 'rateExtraDay', label: 'Rate Extra Day', kind: 'amount', value: (detail) => detail.rateExtraDay },
  { key: 'paymentForEwd', label: 'Payment for EWD', kind: 'amount', value: (detail) => detail.paymentForEwd },
  { key: 'advance', label: 'Advance', kind: 'amount', value: (detail) => detail.advance },
  { key: 'deductions', label: 'Deductions', kind: 'amount', value: (detail) => detail.deductions },
  { key: 'balance', label: 'Balance', kind: 'amount', value: (detail) => detail.balance },
  { key: 'childBenefits', label: 'Child Benefits', kind: 'amount', value: (detail) => detail.childBenefits },
  { key: 'netPaid', label: 'Net Paid', kind: 'amount', value: (detail) => detail.netPaid },
  { key: 'signature', label: 'Signature', kind: 'text', value: () => '' },
  { key: 'counting', label: 'Counting', kind: 'amount', value: (detail) => detail.counting },
];

const PAYROLL_EXCEL_COLUMNS: PayrollExcelColumn[] = [
  ...PAYROLL_DETAIL_COLUMNS,
  ...PAYROLL_SAVED_LINE_COLUMNS,
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
    { key: 'Branch', label: 'Employee Scope', visible: true },
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
      row.Branch.toLowerCase().includes(search) ||
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

  printRecord(record: PayrollProcessingListRecord): void {
    this.openPayrollPrintView(record, 'Print');
  }

  saveAsPdf(record: PayrollProcessingListRecord): void {
    this.openPayrollPrintView(record, 'Save as PDF');
  }

  private openPayrollPrintView(record: PayrollProcessingListRecord, action: string): void {
    if (!this.permissionService.assertCan(PAYROLL_PROCESSING_MODULE, 'view')) {
      return;
    }

    if (!record.Id) {
      void this.alertService.warning(action, 'Unable to open this row: missing payroll process id.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1100,height=850');
    if (!printWindow) {
      void this.alertService.warning(action, 'Allow pop-ups to open the payroll print view.');
      return;
    }

    printWindow.document.write(
      `<!doctype html><html><head><title>Payroll ${action} View</title></head><body>Loading saved payroll details…</body></html>`,
    );
    printWindow.document.close();

    this.payrollProcessingService.fetchPayrollProcessingDetail(record.Id).subscribe({
      next: (detail) => {
        if (printWindow.closed) {
          return;
        }

        try {
          printWindow.onload = () => {
            window.setTimeout(() => {
              if (printWindow.closed) {
                return;
              }

              try {
                printWindow.focus();
                printWindow.print();
              } catch {
                printWindow.close();
                void this.alertService.error(`${action} Failed`, 'Failed to prepare the payroll print view.');
              }
            }, 250);
          };
          printWindow.document.open();
          printWindow.document.write(this.buildPayrollPrintDocument(detail));
          printWindow.document.close();
        } catch {
          printWindow.close();
          void this.alertService.error(`${action} Failed`, 'Failed to prepare the payroll print view.');
        }
      },
      error: (error: unknown) => {
        if (!printWindow.closed) {
          printWindow.close();
        }
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load saved payroll details for printing or PDF export.'),
        );
      },
    });
  }

  private buildPayrollPrintDocument(record: PayrollProcessingRecord): string {
    const escapeHtml = (value: unknown): string =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const header = record.Header;
    const monthLabel = this.formatMonth(header.month) || String(header.month || '');
    const headerFields: Array<[string, string]> = [
      ['Document Name', header.documentName || 'Payroll Processing'],
      ['Payroll Month', header.payrollMonth || `${monthLabel} ${header.year || ''}`.trim()],
      ['Status', header.status],
      ['Branch', header.branch || '—'],
      ['Remarks', header.remarks || '—'],
      ['Processed By', String(header.processedBy)],
      ['Processed Date', this.formatProcessedDate(header.processedDate) || '—'],
    ];

    const renderFields = (fields: Array<[string, string]>): string =>
      fields.map(([label, value]) => `
        <div class="field">
          <span class="label">${escapeHtml(label)}</span>
          <span class="value">${escapeHtml(value || '—')}</span>
        </div>`).join('');

    const formatPrintValue = (column: PayrollPrintColumn, detail: PayrollProcessingDetailPayload): string => {
      const value = column.value(detail);
      if (column.kind === 'boolean') {
        return value ? '1' : '0';
      }
      if (column.kind === 'amount' || column.kind === 'number') {
        const amount = Number(value);
        return Number.isFinite(amount) ? amount.toLocaleString('en-PK', { maximumFractionDigits: 2 }) : '0';
      }
      return String(value ?? '—');
    };

    const employeeRows = record.Details.map((detail) => `
      <tr>${PAYROLL_PRINT_COLUMNS.map((column) =>
        `<td>${escapeHtml(formatPrintValue(column, detail))}</td>`,
      ).join('')}</tr>`).join('');
    const totalValues = PAYROLL_PRINT_COLUMNS.map((column) => {
      if (column.key === 'signature' || column.key === 'ratePerDay' || column.key === 'rateExtraDay') {
        return '';
      }

      if (column.kind !== 'amount' && column.kind !== 'number') {
        return '';
      }

      const total = record.Details.reduce((sum, detail) => {
        const value = Number(column.value(detail));
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);
      return total.toLocaleString('en-PK', { maximumFractionDigits: 2 });
    });
    const totalRow = record.Details.length
      ? `<tr class="total-row"><th colspan="3">Grand Total</th>${totalValues.slice(3).map((value) =>
          `<td>${escapeHtml(value)}</td>`,
        ).join('')}</tr>`
      : '';
    const lineRows = record.Details.length
      ? `${employeeRows}${totalRow}`
      : `<tr><td class="empty" colspan="${PAYROLL_PRINT_COLUMNS.length}">No saved payroll lines are available.</td></tr>`;
    const lineHeaders = PAYROLL_PRINT_COLUMNS.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');

    return `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Payroll ${escapeHtml(record.Id)} — ${escapeHtml(monthLabel)} ${escapeHtml(header.year)}</title>
          <style>
            :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; color: #172b4d; }
            * { box-sizing: border-box; }
            body { margin: 0; background: #eef2f7; }
            .toolbar { position: sticky; top: 0; z-index: 1; display: flex; justify-content: flex-end; gap: 10px; padding: 14px max(24px, calc((100% - 1100px) / 2)); background: #fff; border-bottom: 1px solid #dce3ec; }
            button { border: 0; border-radius: 6px; padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer; }
            .print-button { background: #0a6ed1; color: #fff; }
            .close-button { background: #edf2f7; color: #243b53; }
            main { max-width: 1100px; margin: 28px auto; padding: 0 24px; }
            .report-header { padding: 28px 32px; border-radius: 12px 12px 0 0; color: #fff; background: linear-gradient(120deg, #123b68, #0a6ed1); }
            .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; opacity: .8; }
            h1 { margin: 8px 0 4px; font-size: 28px; }
            .subtitle { margin: 0; opacity: .88; }
            .report-content { padding: 24px 32px; background: #fff; border: 1px solid #dce3ec; border-top: 0; }
            .section-title { margin: 0 0 14px; font-size: 16px; }
            .field-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
            .field { min-width: 0; padding: 10px 11px; border: 1px solid #e4eaf1; border-radius: 6px; background: #f8fafc; overflow-wrap: anywhere; }
            .label { display: block; margin-bottom: 5px; color: #62748a; font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
            .value { display: block; color: #172b4d; font-size: 11px; font-weight: 600; white-space: pre-wrap; }
            .line-items { width: 100%; max-width: 100%; margin-top: 22px; border-collapse: collapse; table-layout: fixed; font-size: 8px; }
            .line-items th, .line-items td { min-width: 0; padding: 6px 5px; border: 1px solid #dce3ec; text-align: left; overflow-wrap: anywhere; word-break: break-word; }
            .line-items th { color: #26496b; background: #edf3fa; }
            .line-items .total-row th, .line-items .total-row td { font-weight: 700; background: #edf3fa; }
            .empty { padding: 18px 0; color: #62748a; text-align: center !important; }
            @media (max-width: 750px) { .field-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } main { margin: 14px auto; padding: 0 12px; } .report-content { padding: 18px; } }
            @page { size: A4 landscape; margin: 12mm; }
            @media print {
              body { background: #fff; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
              .toolbar { display: none; }
              main { max-width: none; margin: 0; padding: 0; }
              .report-header { border-radius: 0; }
              .report-content { padding: 18px 0; border: 0; }
              .field { padding: 7px; }
              .line-items { width: 100%; font-size: 7px; }
              .line-items th, .line-items td { padding: 3px 2px; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <button class="print-button" onclick="window.print()">Print payroll</button>
            <button class="close-button" onclick="window.close()">Close</button>
          </div>
          <main>
            <header class="report-header">
              <span class="eyebrow">Payroll Processing</span>
              <h1>Payroll Register</h1>
            </header>
            <div class="report-content">
              <section>
                <h2 class="section-title">Header Payload</h2>
                <div class="field-grid">${renderFields(headerFields)}</div>
              </section>
              <table class="line-items">
                <thead><tr>${lineHeaders}</tr></thead>
                <tbody>${lineRows}</tbody>
              </table>
            </div>
          </main>
        </body>
      </html>`;
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
              const value =
                column.key === 'ratePerDay'
                  ? Number(r.ratePerDay) || (Number(r.grossSalary) || 0) / 30
                  : r[column.key];
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
