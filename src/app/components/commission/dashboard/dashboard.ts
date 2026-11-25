import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

type DashboardBatchStatus = 'Submitted' | 'Calculated' | 'Transferred';
type DashboardTab = 'All' | 'Pending Approval' | 'Transferred';

interface DashboardBatch {
  id: string;
  category: string;
  branch: string;
  amount: number;
  status: DashboardBatchStatus;
}

interface CommissionCategory {
  title: string;
  amount: number;
  source: string;
  icon: string;
  route: string;
}

const INITIAL_BATCHES: DashboardBatch[] = [
  {
    id: 'COM-2611-LHR-01',
    category: 'Employee Sales',
    branch: 'Lahore Main',
    amount: 385000,
    status: 'Transferred',
  },
  {
    id: 'COM-2611-KHI-02',
    category: 'Employee Sales',
    branch: 'Karachi South',
    amount: 235000,
    status: 'Submitted',
  },
  {
    id: 'COM-2611-ALL-03',
    category: 'Executive Branch',
    branch: 'All Branches',
    amount: 365000,
    status: 'Transferred',
  },
  {
    id: 'COM-2611-FSD-04',
    category: 'Production',
    branch: 'Faisalabad Plant',
    amount: 107000,
    status: 'Submitted',
  },
  {
    id: 'COM-2611-FSD-05',
    category: 'Production',
    branch: 'Faisalabad Plant',
    amount: 215500,
    status: 'Transferred',
  },
  {
    id: 'COM-2611-LHR-06',
    category: 'Assembly Teams',
    branch: 'Lahore Main',
    amount: 175000,
    status: 'Calculated',
  },
];

@Component({
  selector: 'app-commission-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class CommissionDashboardComponent {
  private readonly router = inject(Router);

  readonly batches = signal<DashboardBatch[]>(INITIAL_BATCHES);
  readonly selectedTab = signal<DashboardTab>('All');
  readonly selectedBranch = signal('All Branches');
  readonly searchText = signal('');
  readonly notice = signal('');

  readonly branches = [
    'All Branches',
    'Karachi South',
    'Islamabad North',
    'Lahore Main',
    'Faisalabad Plant',
  ];
  readonly tabs: DashboardTab[] = ['All', 'Pending Approval', 'Transferred'];
  readonly categories: CommissionCategory[] = [
    {
      title: 'Employee Sales',
      amount: 620000,
      source: 'OINV · 18 earners',
      icon: 'employee',
      route: '/commission/register',
    },
    {
      title: 'Executive Branch',
      amount: 365000,
      source: 'OBPL · 4 branches',
      icon: 'opportunities',
      route: '/commission/mapping-teams',
    },
    {
      title: 'Production',
      amount: 312500,
      source: 'OIGN · FG receipts',
      icon: 'factory',
      route: '/commission/register',
    },
    {
      title: 'Assembly Teams',
      amount: 185000,
      source: 'ODLN · Teams A, B, C',
      icon: 'group',
      route: '/commission/mapping-teams',
    },
  ];
  readonly alerts = [
    {
      source: 'OSLP · SlpCode 14',
      status: 'Unmapped',
      detail: '3 A/R invoices in Karachi South lack a payroll employee link.',
    },
    {
      source: 'ORIN · DocEntry 912',
      status: 'Credit Memo',
      detail: 'Prior-period return of PKR 45,000 flagged for adjustment.',
    },
  ];
  readonly topEarners = [
    { employee: 'Ali Raza', summary: 'Sales + Exec + Prod + Asm', amount: 32000 },
    { employee: 'Ahmed Khan', summary: 'Sales + Exec + Prod + Asm', amount: 21500 },
    { employee: 'Usman Tariq', summary: 'Sales + Prod + Asm', amount: 9000 },
  ];

  readonly branchBatches = computed(() => {
    const branch = this.selectedBranch();
    return this.batches().filter(
      (batch) => branch === 'All Branches' || batch.branch === branch || batch.branch === 'All Branches',
    );
  });
  readonly visibleBatches = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const tab = this.selectedTab();
    return this.branchBatches().filter((batch) => {
      const matchesTab =
        tab === 'All' ||
        (tab === 'Pending Approval' && batch.status === 'Submitted') ||
        (tab === 'Transferred' && batch.status === 'Transferred');
      const matchesQuery =
        !query ||
        [batch.id, batch.category, batch.branch].some((value) => value.toLowerCase().includes(query));
      return matchesTab && matchesQuery;
    });
  });

  readonly totalPayable = computed(() =>
    this.branchBatches().reduce((total, batch) => total + batch.amount, 0),
  );
  readonly pendingApprovalTotal = computed(() =>
    this.branchBatches()
      .filter((batch) => batch.status === 'Submitted')
      .reduce((total, batch) => total + batch.amount, 0),
  );
  readonly transferredTotal = computed(() =>
    this.branchBatches()
      .filter((batch) => batch.status === 'Transferred')
      .reduce((total, batch) => total + batch.amount, 0),
  );

  countForTab(tab: DashboardTab): number {
    if (tab === 'All') {
      return this.branchBatches().length;
    }
    return this.branchBatches().filter((batch) =>
      tab === 'Pending Approval' ? batch.status === 'Submitted' : batch.status === 'Transferred',
    ).length;
  }

  formatPkr(amount: number): string {
    return amount.toLocaleString('en-US');
  }

  selectTab(tab: DashboardTab): void {
    this.selectedTab.set(tab);
  }

  openCategory(category: CommissionCategory): void {
    void this.router.navigateByUrl(category.route);
  }

  openMonthlyProcessing(): void {
    void this.router.navigateByUrl('/commission/monthly-processing');
  }

  openRegister(): void {
    void this.router.navigateByUrl('/commission/register');
  }

  resolveMappings(): void {
    void this.router.navigateByUrl('/commission/mapping-teams');
  }

  exportSummary(): void {
    const rows = this.visibleBatches().map((batch) => [
      batch.id,
      batch.category,
      batch.branch,
      batch.amount,
      batch.status,
    ]);
    const csv = [['Batch ID', 'Category', 'Branch', 'PKR', 'Status'], ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'commission-dashboard-summary.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  fetchSapData(): void {
    this.notice.set('SAP data fetch is a demo placeholder; no SAP connection is configured.');
  }
}
