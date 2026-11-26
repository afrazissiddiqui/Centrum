import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { publicApiUrl } from '../../../config/api.config';

interface CommissionEmployeeRecord {
  id: string;
  employeeCode: string;
  employee: string;
  branch: string;
  sales: number;
  executive: number;
  production: number;
  assembly: number;
  total: number;
  status: string;
}

interface CommissionDetail {
  id: string;
  document: string;
  category: string;
  scheme: string;
  base: string;
  rate: string;
  amount: number;
}

interface CommissionTotals {
  sales: number;
  executive: number;
  production: number;
  assembly: number;
  total: number;
}

interface CommissionRegisterSummary {
  postedTotal: number | null;
  postedCount: number | null;
  approvedTotal: number | null;
  approvedCount: number | null;
  pendingTotal: number | null;
  pendingCount: number | null;
  registerTotal: number | null;
}

interface PayrollPayableRecord {
  id: string;
  employeeCode: string;
  employee: string;
  branch: string;
  totalCommission: number;
  batchIds: string[];
}

const COMMISSION_REGISTER_PERIOD = '2026-11';

@Component({
  selector: 'app-commission-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class CommissionRegisterComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private detailsRequestVersion = 0;

  readonly period = COMMISSION_REGISTER_PERIOD;
  readonly employees = signal<CommissionEmployeeRecord[]>([]);
  readonly summary = signal<CommissionRegisterSummary | null>(null);
  readonly payableRecords = signal<PayrollPayableRecord[]>([]);
  readonly branches = signal<string[]>([]);
  readonly searchText = signal('');
  readonly statusFilter = signal('All Statuses');
  readonly selectedBranch = signal('All Branches');
  readonly selectedEmployeeId = signal<string | null>(null);
  readonly selectedDetails = signal<CommissionDetail[]>([]);
  readonly notice = signal('');
  readonly isLoading = signal(true);
  readonly loadError = signal('');
  readonly isLoadingDetails = signal(false);
  readonly detailError = signal('');
  readonly isLoadingPayables = signal(true);
  readonly payableError = signal('');

  readonly statuses = ['All Statuses', 'Posted', 'Approved', 'Pending'];

  readonly filteredEmployees = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const status = this.statusFilter();
    const branch = this.selectedBranch();
    return this.employees().filter(
      (record) =>
        (!query ||
          record.employee.toLowerCase().includes(query) ||
          record.employeeCode.toLowerCase().includes(query)) &&
        (status === 'All Statuses' || record.status === status) &&
        (branch === 'All Branches' || record.branch === branch),
    );
  });

  readonly totals = computed(() =>
    this.filteredEmployees().reduce<CommissionTotals>(
      (totals, record) => ({
        sales: totals.sales + record.sales,
        executive: totals.executive + record.executive,
        production: totals.production + record.production,
        assembly: totals.assembly + record.assembly,
        total: totals.total + this.employeeTotal(record),
      }),
      { sales: 0, executive: 0, production: 0, assembly: 0, total: 0 },
    ),
  );

  readonly registerTotal = computed(
    () =>
      this.summary()?.registerTotal ??
      this.employees().reduce((total, record) => total + this.employeeTotal(record), 0),
  );
  readonly postedTotal = computed(
    () => this.summary()?.postedTotal ?? this.totalForStatus('Posted'),
  );
  readonly approvedTotal = computed(
    () => this.summary()?.approvedTotal ?? this.totalForStatus('Approved'),
  );
  readonly pendingTotal = computed(
    () => this.summary()?.pendingTotal ?? this.totalForStatus('Pending'),
  );
  readonly postedCount = computed(
    () => this.summary()?.postedCount ?? this.countForStatus('Posted'),
  );
  readonly approvedCount = computed(
    () => this.summary()?.approvedCount ?? this.countForStatus('Approved'),
  );
  readonly pendingCount = computed(
    () => this.summary()?.pendingCount ?? this.countForStatus('Pending'),
  );
  readonly selectedEmployee = computed<CommissionEmployeeRecord | null>(
    () =>
      this.filteredEmployees().find((record) => record.id === this.selectedEmployeeId()) ??
      this.filteredEmployees()[0] ??
      null,
  );

  ngOnInit(): void {
    this.loadRegister();
    this.loadPayableCommissions();
  }

  setSearchText(value: string): void {
    this.searchText.set(value);
    this.refreshSelectedEmployee();
  }

  setStatusFilter(value: string): void {
    this.statusFilter.set(value);
    this.refreshSelectedEmployee();
  }

  setSelectedBranch(value: string): void {
    this.selectedBranch.set(value);
    this.refreshSelectedEmployee();
  }

  selectEmployee(record: CommissionEmployeeRecord): void {
    this.selectedEmployeeId.set(record.id);
    this.loadEmployeeDetails(record);
  }

  employeeTotal(record: CommissionEmployeeRecord): number {
    return record.total;
  }

  formatPkr(amount: number): string {
    return amount.toLocaleString('en-US');
  }

  exportSummary(): void {
    this.downloadCsv('commission-register-summary.csv');
  }

  exportExcel(): void {
    this.downloadCsv('commission-register.xlsx.csv');
  }

  exportPdf(): void {
    const cleanup = () => document.body.classList.remove('commission-register-print');
    document.body.classList.add('commission-register-print');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  }

  fetchSapData(): void {
    this.notice.set('SAP data fetch is a demo placeholder; no SAP connection is configured.');
  }

  private loadRegister(): void {
    const url = publicApiUrl(
      `commission-register-list?period=${encodeURIComponent(this.period)}`,
    );
    this.http.get<unknown>(url).subscribe({
      next: (response) => {
        const mapped = this.mapRegisterListResponse(response);
        if (mapped === null) {
          this.loadError.set('Commission register could not be loaded. The API response was invalid.');
        } else {
          this.employees.set(mapped.records);
          this.summary.set(mapped.summary);
          this.branches.set(mapped.branches);
          this.loadError.set('');
          this.refreshSelectedEmployee();
        }
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(
          this.apiErrorMessage(error, 'Unable to load the commission register. Please try again later.'),
        );
        this.isLoading.set(false);
      },
    });
  }

  private loadEmployeeDetails(record: CommissionEmployeeRecord): void {
    const requestVersion = ++this.detailsRequestVersion;
    this.selectedDetails.set([]);
    this.detailError.set('');
    this.isLoadingDetails.set(true);
    const url = publicApiUrl(
      `commission-register-detail/${encodeURIComponent(record.id)}?period=${encodeURIComponent(this.period)}`,
    );
    this.http.get<unknown>(url).subscribe({
      next: (response) => {
        if (requestVersion !== this.detailsRequestVersion) {
          return;
        }
        const details = this.mapRegisterDetailsResponse(response);
        if (details === null) {
          this.detailError.set('SAP document details could not be loaded. The API response was invalid.');
        } else {
          this.selectedDetails.set(details);
        }
        this.isLoadingDetails.set(false);
      },
      error: (error: unknown) => {
        if (requestVersion !== this.detailsRequestVersion) {
          return;
        }
        this.detailError.set(
          this.apiErrorMessage(error, 'Unable to load SAP document details. Please try again later.'),
        );
        this.isLoadingDetails.set(false);
      },
    });
  }

  private loadPayableCommissions(): void {
    const url = publicApiUrl(
      `commission-payable-for-payroll?period=${encodeURIComponent(this.period)}`,
    );
    this.http.get<unknown>(url).subscribe({
      next: (response) => {
        const records = this.mapPayableResponse(response);
        if (records === null) {
          this.payableError.set('Payable commissions could not be loaded. The API response was invalid.');
        } else {
          this.payableRecords.set(records);
        }
        this.isLoadingPayables.set(false);
      },
      error: (error: unknown) => {
        this.payableError.set(
          this.apiErrorMessage(error, 'Unable to load payable commissions. Please try again later.'),
        );
        this.isLoadingPayables.set(false);
      },
    });
  }

  private refreshSelectedEmployee(): void {
    const currentId = this.selectedEmployeeId();
    const nextEmployee =
      this.filteredEmployees().find((record) => record.id === currentId) ??
      this.filteredEmployees()[0] ??
      null;
    if (!nextEmployee) {
      this.selectedEmployeeId.set(null);
      this.detailsRequestVersion++;
      this.selectedDetails.set([]);
      this.isLoadingDetails.set(false);
      this.detailError.set('');
      return;
    }
    if (nextEmployee.id !== currentId) {
      this.selectEmployee(nextEmployee);
    }
  }

  private mapRegisterListResponse(response: unknown): {
    records: CommissionEmployeeRecord[];
    summary: CommissionRegisterSummary | null;
    branches: string[];
  } | null {
    if (
      !this.isRecord(response) ||
      response['status'] === false ||
      !Array.isArray(response['data']) ||
      !response['data'].every((item: unknown) => this.isRecord(item))
    ) {
      return null;
    }

    const records = response['data']
      .map((item: Record<string, unknown>) => this.mapRegisterRecord(item))
      .filter((record: CommissionEmployeeRecord | null): record is CommissionEmployeeRecord =>
        record !== null,
      );
    if (records.length !== response['data'].length) {
      return null;
    }

    const rawSummary = this.isRecord(response['summary']) ? response['summary'] : null;
    const summary = rawSummary
      ? {
          postedTotal: this.valueAsNumberOrNull(rawSummary['posted_total']),
          postedCount: this.valueAsNumberOrNull(rawSummary['posted_count']),
          approvedTotal: this.valueAsNumberOrNull(rawSummary['approved_total']),
          approvedCount: this.valueAsNumberOrNull(rawSummary['approved_count']),
          pendingTotal: this.valueAsNumberOrNull(rawSummary['pending_total']),
          pendingCount: this.valueAsNumberOrNull(rawSummary['pending_count']),
          registerTotal: this.valueAsNumberOrNull(rawSummary['register_total']),
        }
      : null;

    return {
      records,
      summary,
      branches: [...new Set(records.map((record) => record.branch).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    };
  }

  private mapRegisterRecord(item: Record<string, unknown>): CommissionEmployeeRecord | null {
    const sales = this.valueAsNumberOrNull(item['sales']);
    const executive = this.valueAsNumberOrNull(item['executive']);
    const production = this.valueAsNumberOrNull(item['production']);
    const assembly = this.valueAsNumberOrNull(item['assembly']);
    const total = this.valueAsNumberOrNull(item['total']);
    const id = this.valueAsString(item['employee_id']);
    const employee = this.valueAsString(item['employee_name']);
    const status = this.valueAsString(item['status']);
    if (
      !id ||
      !employee ||
      !status ||
      sales === null ||
      executive === null ||
      production === null ||
      assembly === null ||
      total === null
    ) {
      return null;
    }

    return {
      id,
      employeeCode: this.valueAsString(item['employee_code']),
      employee,
      branch: this.valueAsString(item['branch']),
      sales,
      executive,
      production,
      assembly,
      total,
      status,
    };
  }

  private mapRegisterDetailsResponse(response: unknown): CommissionDetail[] | null {
    if (
      !this.isRecord(response) ||
      response['status'] === false ||
      !Array.isArray(response['data']) ||
      !response['data'].every((item: unknown) => this.isRecord(item))
    ) {
      return null;
    }

    const details = response['data'].map((item: Record<string, unknown>) => {
      const amount = this.valueAsNumberOrNull(item['commission_amount']);
      const id = this.valueAsString(item['id']);
      if (amount === null || !id) {
        return null;
      }
      return {
        id,
        document:
          this.valueAsString(item['sap_doc_label']) ||
          this.valueAsString(item['sap_doc_num']),
        category: this.valueAsString(item['category']),
        scheme: this.valueAsString(item['scheme_code']),
        base: this.valueAsString(item['base_label']),
        rate: this.valueAsString(item['rate_label']),
        amount,
      };
    });
    return details.some((detail) => detail === null)
      ? null
      : (details as CommissionDetail[]);
  }

  private mapPayableResponse(response: unknown): PayrollPayableRecord[] | null {
    if (
      !this.isRecord(response) ||
      response['status'] === false ||
      !Array.isArray(response['data']) ||
      !response['data'].every((item: unknown) => this.isRecord(item))
    ) {
      return null;
    }

    const records = response['data'].map((item: Record<string, unknown>) => {
      const id = this.valueAsString(item['employee_id']);
      const employee = this.valueAsString(item['employee_name']);
      const totalCommission = this.valueAsNumberOrNull(item['total_commission']);
      if (!id || !employee || totalCommission === null) {
        return null;
      }
      return {
        id,
        employeeCode: this.valueAsString(item['employee_code']),
        employee,
        branch: this.valueAsString(item['branch']),
        totalCommission,
        batchIds: this.valueAsStringArray(item['batch_ids']),
      };
    });
    return records.some((record) => record === null)
      ? null
      : (records as PayrollPayableRecord[]);
  }

  private totalForStatus(status: string): number {
    return this.employees()
      .filter((record) => record.status === status)
      .reduce((total, record) => total + this.employeeTotal(record), 0);
  }

  private countForStatus(status: string): number {
    return this.employees().filter((record) => record.status === status).length;
  }

  private downloadCsv(fileName: string): void {
    const headers = ['Employee', 'Sales', 'Executive', 'Production', 'Assembly', 'Total (PKR)', 'Status'];
    const rows = this.filteredEmployees().map((record) => [
      record.employee,
      record.sales,
      record.executive,
      record.production,
      record.assembly,
      this.employeeTotal(record),
      record.status,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private valueAsString(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  private valueAsStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => this.valueAsString(item)).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }

  private valueAsNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private apiErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && this.isRecord(error.error)) {
      const message = this.apiMessage(error.error);
      if (message) {
        return message;
      }
    }
    return fallback;
  }

  private apiMessage(response: Record<string, unknown>): string {
    return typeof response['message'] === 'string' ? response['message'] : '';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
