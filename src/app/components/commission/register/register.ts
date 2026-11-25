import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type CommissionStatus = 'Posted' | 'Approved' | 'Pending';

interface CommissionEmployeeRecord {
  id: string;
  employee: string;
  branch: string;
  sales: number;
  executive: number;
  production: number;
  assembly: number;
  status: CommissionStatus;
}

interface CommissionDetail {
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

const INITIAL_EMPLOYEES: CommissionEmployeeRecord[] = [
  {
    id: 'ali-raza',
    employee: 'Ali Raza',
    branch: 'Lahore Main',
    sales: 10000,
    executive: 15000,
    production: 5000,
    assembly: 2000,
    status: 'Posted',
  },
  {
    id: 'ahmed-khan',
    employee: 'Ahmed Khan',
    branch: 'Lahore Main',
    sales: 6000,
    executive: 10000,
    production: 4000,
    assembly: 1500,
    status: 'Approved',
  },
  {
    id: 'usman-tariq',
    employee: 'Usman Tariq',
    branch: 'Islamabad North',
    sales: 4000,
    executive: 0,
    production: 3000,
    assembly: 2000,
    status: 'Pending',
  },
];

const COMMISSION_DETAILS: Record<string, CommissionDetail[]> = {
  'ali-raza': [
    {
      document: 'OINV #4821 · L0',
      category: 'Employee Sales',
      scheme: 'SCH-SLS-01',
      base: 'PKR 500,000',
      rate: '2.0%',
      amount: 10000,
    },
    {
      document: 'OBPL · LHR Pool',
      category: 'Executive',
      scheme: 'SCH-EXC-01',
      base: 'PKR 25,000',
      rate: '60%',
      amount: 15000,
    },
    {
      document: 'OIGN #1192 · L0',
      category: 'Production',
      scheme: 'SCH-PRD-01',
      base: '1,000 Units',
      rate: 'PKR 5',
      amount: 5000,
    },
    {
      document: 'ODLN #7041 · L0',
      category: 'Assembly',
      scheme: 'SCH-ASM-01',
      base: 'PKR 200,000',
      rate: '1.0%',
      amount: 2000,
    },
  ],
  'ahmed-khan': [
    {
      document: 'OINV #4870 · L1',
      category: 'Employee Sales',
      scheme: 'SCH-SLS-01',
      base: 'PKR 300,000',
      rate: '2.0%',
      amount: 6000,
    },
    {
      document: 'OBPL · LHR Pool',
      category: 'Executive',
      scheme: 'SCH-EXC-01',
      base: 'PKR 16,667',
      rate: '60%',
      amount: 10000,
    },
    {
      document: 'OIGN #1218 · L1',
      category: 'Production',
      scheme: 'SCH-PRD-01',
      base: '800 Units',
      rate: 'PKR 5',
      amount: 4000,
    },
    {
      document: 'ODLN #7102 · L1',
      category: 'Assembly',
      scheme: 'SCH-ASM-01',
      base: 'PKR 150,000',
      rate: '1.0%',
      amount: 1500,
    },
  ],
  'usman-tariq': [
    {
      document: 'OINV #4914 · L0',
      category: 'Employee Sales',
      scheme: 'SCH-SLS-01',
      base: 'PKR 200,000',
      rate: '2.0%',
      amount: 4000,
    },
    {
      document: 'OIGN #1245 · L0',
      category: 'Production',
      scheme: 'SCH-PRD-01',
      base: '600 Units',
      rate: 'PKR 5',
      amount: 3000,
    },
    {
      document: 'ODLN #7168 · L0',
      category: 'Assembly',
      scheme: 'SCH-ASM-01',
      base: 'PKR 200,000',
      rate: '1.0%',
      amount: 2000,
    },
  ],
};

@Component({
  selector: 'app-commission-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class CommissionRegisterComponent {
  readonly employees = signal<CommissionEmployeeRecord[]>(INITIAL_EMPLOYEES);
  readonly searchText = signal('');
  readonly statusFilter = signal('All Statuses');
  readonly selectedBranch = signal('All Branches');
  readonly selectedEmployeeId = signal('ali-raza');
  readonly notice = signal('');

  readonly branches = ['All Branches', 'Karachi South', 'Islamabad North', 'Lahore Main', 'Faisalabad Plant'];
  readonly statuses = ['All Statuses', 'Posted', 'Approved', 'Pending'];

  readonly filteredEmployees = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const status = this.statusFilter();
    const branch = this.selectedBranch();
    return this.employees().filter(
      (record) =>
        (!query || record.employee.toLowerCase().includes(query)) &&
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

  readonly registerTotal = computed(() =>
    this.employees().reduce((total, record) => total + this.employeeTotal(record), 0),
  );
  readonly postedTotal = computed(() => this.totalForStatus('Posted'));
  readonly approvedTotal = computed(() => this.totalForStatus('Approved'));
  readonly pendingTotal = computed(() => this.totalForStatus('Pending'));
  readonly selectedEmployee = computed<CommissionEmployeeRecord | null>(
    () =>
      this.filteredEmployees().find((record) => record.id === this.selectedEmployeeId()) ??
      this.filteredEmployees()[0] ??
      null,
  );
  readonly selectedDetails = computed(() => {
    const employee = this.selectedEmployee();
    return employee ? COMMISSION_DETAILS[employee.id] ?? [] : [];
  });

  selectEmployee(record: CommissionEmployeeRecord): void {
    this.selectedEmployeeId.set(record.id);
  }

  employeeTotal(record: CommissionEmployeeRecord): number {
    return record.sales + record.executive + record.production + record.assembly;
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
    window.print();
  }

  fetchSapData(): void {
    this.notice.set('SAP data fetch is a demo placeholder; no SAP connection is configured.');
  }

  private totalForStatus(status: CommissionStatus): number {
    return this.employees()
      .filter((record) => record.status === status)
      .reduce((total, record) => total + this.employeeTotal(record), 0);
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
}
