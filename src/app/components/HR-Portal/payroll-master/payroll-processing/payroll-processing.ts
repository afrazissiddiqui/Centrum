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
  key: keyof PayrollProcessingDetailPayload | 'ratePerDay' | 'absent' | 'absentAmount';
}

const PAYROLL_EXCEL_COLUMNS: PayrollExcelColumn[] = [
  { key: 'personName', label: 'Employee Name', kind: 'text' },
  { key: 'designation', label: 'Designation', kind: 'text' },
  { key: 'grossSalary', label: 'Salary', kind: 'amount' },
  { key: 'grossSalary', label: 'Gross Salary', kind: 'amount' },
  { key: 'netPayable', label: 'Payable Amount', kind: 'amount' },
  { key: 'ratePerDay', label: 'Rate/Day', kind: 'amount' },
  { key: 'absent', label: 'Absent', kind: 'number' },
  { key: 'absentAmount', label: 'Absent Amount', kind: 'amount' },
  { key: 'extraWorkingDay', label: 'Extra working day', kind: 'number' },
  { key: 'rateExtraDay', label: 'Rate (extra day)', kind: 'amount' },
  { key: 'paymentForEwd', label: 'Payment for EWD', kind: 'amount' },
  { key: 'loanAdvForm', label: 'Advance', kind: 'amount' },
  { key: 'deductions', label: 'Deductions', kind: 'amount' },
  { key: 'netPayableAfterTax', label: 'Balance', kind: 'amount' },
  { key: 'childBenefits', label: 'Child Benefits', kind: 'amount' },
  { key: 'netPayableManagement', label: 'Net Paid', kind: 'amount' },
  { key: 'totalEarnings', label: 'Total', kind: 'amount' },
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

  isPostedPayroll(record: PayrollProcessingListRecord): boolean {
    return record.Status.trim().toLowerCase() === 'posted';
  }

  printRecord(record: PayrollProcessingListRecord): void {
    if (!this.permissionService.assertCan(PAYROLL_PROCESSING_MODULE, 'view')) {
      return;
    }

    if (!this.isPostedPayroll(record)) {
      void this.alertService.warning('Print', 'Only posted payroll processes can be printed.');
      return;
    }

    if (!record.Id) {
      void this.alertService.warning('Print', 'Unable to print this row: missing payroll process id.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1100,height=850');
    if (!printWindow) {
      void this.alertService.warning('Print', 'Allow pop-ups to open the payroll print view.');
      return;
    }

    printWindow.document.write(
      '<!doctype html><html><head><title>Payroll Print View</title></head><body>Loading posted payroll details…</body></html>',
    );
    printWindow.document.close();

    this.payrollProcessingService.fetchPayrollProcessingDetail(record.Id).subscribe({
      next: (detail) => {
        if (printWindow.closed) {
          return;
        }

        try {
          printWindow.document.open();
          printWindow.document.write(this.buildPayrollPrintDocument(detail));
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
        } catch {
          printWindow.close();
          void this.alertService.error('Print Failed', 'Failed to prepare the payroll print view.');
        }
      },
      error: (error: unknown) => {
        if (!printWindow.closed) {
          printWindow.close();
        }
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load posted payroll details for printing.'),
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
      ['Payroll ID', String(record.Id)],
      ['Period', `${monthLabel} ${header.year || ''}`.trim()],
      ['Status', header.status],
      ['Currency', header.currency],
      ['Processed By', String(header.processedBy || '—')],
      ['Processed Date', this.formatProcessedDate(header.processedDate) || '—'],
      ['Monthly Fuel Rate Adjustment', this.formatMoney(header.fuelPriceAdjust || 0, header.currency)],
      ['Minimum Wage Adjustment', this.formatMoney(header.minimumWageAdjust || 0, header.currency)],
    ];

    const detailGroups: Array<{ title: string; columns: PayrollDetailColumn[] }> = [
      { title: 'Employee Information', columns: PAYROLL_DETAIL_COLUMNS.slice(0, 19) },
      { title: 'Salary and Allowances', columns: PAYROLL_DETAIL_COLUMNS.slice(19, 35) },
      { title: 'Contributions and Deductions', columns: PAYROLL_DETAIL_COLUMNS.slice(35, 52) },
      { title: 'Payroll Summary', columns: PAYROLL_DETAIL_COLUMNS.slice(52) },
    ];

    const renderFields = (fields: Array<[string, string]>): string =>
      fields.map(([label, value]) => `
        <div class="field">
          <span class="label">${escapeHtml(label)}</span>
          <span class="value">${escapeHtml(value || '—')}</span>
        </div>`).join('');

    const renderEmployee = (employee: PayrollProcessingDetailPayload, index: number): string => {
      const groups = detailGroups.map(({ title, columns }) => `
        <section class="detail-group">
          <h3>${escapeHtml(title)}</h3>
          <div class="field-grid">
            ${renderFields(columns.map((column) => [
              column.label,
              this.formatDetailValue(employee, column, header.currency),
            ]))}
          </div>
        </section>`).join('');

      return `
        <article class="employee">
          <div class="employee-heading">
            <div>
              <span class="eyebrow">Employee ${index + 1}</span>
              <h2>${escapeHtml(employee.personName || employee.employeeCode || 'Payroll detail')}</h2>
            </div>
            <div class="employee-id">${escapeHtml(employee.employeeCode || employee.employeeId || '—')}</div>
          </div>
          ${groups}
        </article>`;
    };

    const remarks = header.remarks
      ? `<section class="remarks"><h2>Remarks</h2><p>${escapeHtml(header.remarks)}</p></section>`
      : '';
    const employees = record.Details.length
      ? record.Details.map((employee, index) => renderEmployee(employee, index)).join('')
      : '<p class="empty">No employee detail lines are available for this payroll.</p>';

    return `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Posted Payroll ${escapeHtml(record.Id)} — ${escapeHtml(monthLabel)} ${escapeHtml(header.year)}</title>
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
            .remarks { margin-top: 18px; padding: 14px; border-left: 3px solid #0a6ed1; background: #f5f8fc; }
            .remarks h2 { margin: 0 0 6px; font-size: 13px; }
            .remarks p { margin: 0; white-space: pre-wrap; }
            .employee { margin-top: 26px; padding: 22px; background: #fff; border: 1px solid #dce3ec; border-radius: 10px; }
            .employee-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 2px solid #dce8f5; }
            .employee-heading .eyebrow { color: #0a6ed1; opacity: 1; }
            .employee-heading h2 { margin: 5px 0 0; font-size: 18px; }
            .employee-id { color: #52657a; font-size: 12px; font-weight: 700; }
            .detail-group { margin-top: 16px; }
            .detail-group h3 { margin: 0 0 8px; padding-bottom: 6px; color: #26496b; border-bottom: 1px solid #e4eaf1; font-size: 12px; }
            .empty { padding: 18px 0; color: #62748a; }
            footer { padding: 16px 0 4px; color: #718096; font-size: 10px; text-align: right; }
            @media (max-width: 750px) { .field-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } main { margin: 14px auto; padding: 0 12px; } .report-content { padding: 18px; } }
            @page { size: A4 landscape; margin: 12mm; }
            @media print {
              body { background: #fff; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
              .toolbar { display: none; }
              main { max-width: none; margin: 0; padding: 0; }
              .report-header { border-radius: 0; }
              .report-content { padding: 18px 0; border: 0; }
              .employee { margin: 18px 0 0; padding: 14px 0; border: 0; border-top: 2px solid #dce3ec; border-radius: 0; break-inside: auto; }
              .detail-group { break-inside: avoid; }
              .field { padding: 7px; }
              footer { position: fixed; bottom: 0; right: 0; }
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
              <span class="eyebrow">Payroll Processing · ${escapeHtml(header.status || 'Posted')}</span>
              <h1>Payroll Register</h1>
              <p class="subtitle">${escapeHtml(monthLabel)} ${escapeHtml(header.year)} · Payroll #${escapeHtml(record.Id)}</p>
            </header>
            <div class="report-content">
              <section>
                <h2 class="section-title">Payroll Summary</h2>
                <div class="field-grid">${renderFields(headerFields)}</div>
                ${remarks}
              </section>
              ${employees}
              <footer>Generated ${escapeHtml(new Date().toLocaleString())}</footer>
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
                  ? (Number(r.grossSalary) || 0) / 30
                  : column.key === 'absent'
                    ? r.paidLeaveDays + r.unpaidLeaveDays
                    : column.key === 'absentAmount'
                      ? r.lateAttendDeduction
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
