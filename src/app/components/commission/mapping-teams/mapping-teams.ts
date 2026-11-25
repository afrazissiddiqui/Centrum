import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type MappingTabKey = 'sap' | 'executive' | 'production' | 'assembly';

interface MappingTab {
  id: MappingTabKey;
  title: string;
  description: string;
  columns: [string, string, string, string, string, string];
}

interface MappingRow {
  id: string;
  code: string;
  source: string;
  assignment: string;
  assignmentOptions: string[];
  branch: string;
  context: string;
  effectiveFrom: string;
  status: string;
}

const PAYROLL_EMPLOYEES = [
  'EMP-1004 · Ali Raza',
  'EMP-1011 · Ahmed Khan',
  'EMP-1017 · Sana Iqbal',
  'EMP-1022 · Hamza Javed',
  'EMP-1029 · Nadia Hassan',
];

const EXECUTIVES = ['Nadia Hassan', 'Usman Tariq', 'Sana Iqbal', 'Hamza Javed'];
const TEAM_LEADS = ['Bilal Siddiqui', 'Ali Raza', 'Ahmed Khan', 'Zainab Malik'];

@Component({
  selector: 'app-mapping-teams',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './mapping-teams.html',
  styleUrl: './mapping-teams.css',
})
export class MappingTeamsComponent {
  readonly tabs: MappingTab[] = [
    {
      id: 'sap',
      title: 'SAP Employee Mapping',
      description: 'Explicitly link SAP Business One Sales Employees (OSLP) to Payroll Employee IDs before calculation.',
      columns: ['SAP SlpCode', 'SAP Sales Employee', 'Payroll Employee', 'Branch', 'Effective From', 'Status'],
    },
    {
      id: 'executive',
      title: 'Branch-Executive',
      description: 'Assign an executive pool to each branch and keep branch commission splits aligned.',
      columns: ['Branch', 'Executive Pool', 'Assigned Executive', 'Pool Split', 'Effective From', 'Status'],
    },
    {
      id: 'production',
      title: 'Production Allocation',
      description: 'Reconcile finished-goods production quantities to their commission allocation teams.',
      columns: ['Production Order', 'Finished Good', 'Production Line', 'FG Units', 'Effective From', 'Status'],
    },
    {
      id: 'assembly',
      title: 'Assembly Teams',
      description: 'Assign leads to assembly teams and verify team membership and allocation splits.',
      columns: ['Team', 'Assembly Group', 'Team Lead', 'Members / Split', 'Effective From', 'Status'],
    },
  ];

  readonly selectedTab = signal<MappingTabKey>('sap');
  readonly selectedBranch = signal('All Branches');
  readonly notice = signal('');
  readonly rowsByTab = signal<Record<MappingTabKey, MappingRow[]>>({
    sap: [
      {
        id: 'slp-14',
        code: 'SLP-14',
        source: 'Bilal Siddiqui (SAP)',
        assignment: '',
        assignmentOptions: PAYROLL_EMPLOYEES,
        branch: 'Karachi South',
        context: 'Karachi South',
        effectiveFrom: '01 Nov 2026',
        status: 'Unmapped',
      },
      {
        id: 'slp-19',
        code: 'SLP-19',
        source: 'Zainab Malik (SAP)',
        assignment: '',
        assignmentOptions: PAYROLL_EMPLOYEES,
        branch: 'Islamabad North',
        context: 'Islamabad North',
        effectiveFrom: '01 Nov 2026',
        status: 'Unmapped',
      },
      {
        id: 'slp-03',
        code: 'SLP-03',
        source: 'Ali Raza',
        assignment: 'EMP-1004 · Ali Raza',
        assignmentOptions: PAYROLL_EMPLOYEES,
        branch: 'Lahore Main',
        context: 'Lahore Main',
        effectiveFrom: '01 Jan 2026',
        status: 'Mapped',
      },
      {
        id: 'slp-07',
        code: 'SLP-07',
        source: 'Ahmed Khan',
        assignment: 'EMP-1011 · Ahmed Khan',
        assignmentOptions: PAYROLL_EMPLOYEES,
        branch: 'Lahore Main',
        context: 'Lahore Main',
        effectiveFrom: '01 Jan 2026',
        status: 'Mapped',
      },
    ],
    executive: [
      {
        id: 'branch-karachi',
        code: 'Karachi South',
        source: 'South Executive Pool',
        assignment: 'Nadia Hassan',
        assignmentOptions: EXECUTIVES,
        branch: 'Karachi South',
        context: '100% pool split',
        effectiveFrom: '01 Jan 2026',
        status: 'Active',
      },
      {
        id: 'branch-islamabad',
        code: 'Islamabad North',
        source: 'North Executive Pool',
        assignment: 'Usman Tariq',
        assignmentOptions: EXECUTIVES,
        branch: 'Islamabad North',
        context: '100% pool split',
        effectiveFrom: '01 Jan 2026',
        status: 'Active',
      },
      {
        id: 'branch-lahore',
        code: 'Lahore Main',
        source: 'Central Executive Pool',
        assignment: 'Sana Iqbal',
        assignmentOptions: EXECUTIVES,
        branch: 'Lahore Main',
        context: '100% pool split',
        effectiveFrom: '01 Jan 2026',
        status: 'Active',
      },
      {
        id: 'branch-faisalabad',
        code: 'Faisalabad Plant',
        source: 'Production Executive Pool',
        assignment: 'Hamza Javed',
        assignmentOptions: EXECUTIVES,
        branch: 'Faisalabad Plant',
        context: '100% pool split',
        effectiveFrom: '01 Jan 2026',
        status: 'Active',
      },
    ],
    production: [
      {
        id: 'po-7402',
        code: 'PO-7402',
        source: 'Steel Cabinet FG',
        assignment: 'Production Line A',
        assignmentOptions: ['Production Line A', 'Production Line B', 'Production Line C'],
        branch: 'Faisalabad Plant',
        context: '1,200 / 1,200 units',
        effectiveFrom: '01 Nov 2026',
        status: 'Reconciled',
      },
      {
        id: 'po-7403',
        code: 'PO-7403',
        source: 'Storage Rack FG',
        assignment: 'Production Line B',
        assignmentOptions: ['Production Line A', 'Production Line B', 'Production Line C'],
        branch: 'Faisalabad Plant',
        context: '800 / 800 units',
        effectiveFrom: '01 Nov 2026',
        status: 'Reconciled',
      },
      {
        id: 'po-7404',
        code: 'PO-7404',
        source: 'Worktable FG',
        assignment: 'Production Line C',
        assignmentOptions: ['Production Line A', 'Production Line B', 'Production Line C'],
        branch: 'Lahore Main',
        context: '400 / 400 units',
        effectiveFrom: '01 Nov 2026',
        status: 'Reconciled',
      },
    ],
    assembly: [
      {
        id: 'assembly-a',
        code: 'Team A',
        source: 'Assembly North',
        assignment: 'Bilal Siddiqui',
        assignmentOptions: TEAM_LEADS,
        branch: 'Lahore Main',
        context: '8 members · 100% split',
        effectiveFrom: '01 Jan 2026',
        status: 'Active',
      },
      {
        id: 'assembly-b',
        code: 'Team B',
        source: 'Assembly Central',
        assignment: 'Ali Raza',
        assignmentOptions: TEAM_LEADS,
        branch: 'Lahore Main',
        context: '6 members · 100% split',
        effectiveFrom: '01 Jan 2026',
        status: 'Active',
      },
      {
        id: 'assembly-c',
        code: 'Team C',
        source: 'Assembly South',
        assignment: 'Ahmed Khan',
        assignmentOptions: TEAM_LEADS,
        branch: 'Karachi South',
        context: '7 members · 100% split',
        effectiveFrom: '01 Jan 2026',
        status: 'Active',
      },
    ],
  });

  readonly activeTab = computed(
    () => this.tabs.find((tab) => tab.id === this.selectedTab()) ?? this.tabs[0],
  );
  readonly visibleRows = computed(() => {
    const branch = this.selectedBranch();
    return this.rowsByTab()[this.selectedTab()].filter(
      (row) => branch === 'All Branches' || row.branch === branch,
    );
  });
  readonly mappedSalespeople = computed(() => {
    const mappedInSample = this.rowsByTab().sap.filter((row) => row.assignment).length;
    return 16 + mappedInSample;
  });

  selectTab(tab: MappingTabKey): void {
    this.selectedTab.set(tab);
    this.notice.set('');
  }

  updateAssignment(rowId: string, assignment: string): void {
    const tab = this.selectedTab();
    this.rowsByTab.update((rowsByTab) => ({
      ...rowsByTab,
      [tab]: rowsByTab[tab].map((row) =>
        row.id === rowId
          ? {
              ...row,
              assignment,
              status: tab === 'sap' ? (assignment ? 'Mapped' : 'Unmapped') : row.status,
            }
          : row,
      ),
    }));
  }

  saveMappings(): void {
    this.notice.set('Mapping changes saved for this demo session.');
  }

  fetchSapData(): void {
    this.notice.set('SAP data fetch is a demo placeholder; no SAP connection is configured.');
  }

  exportSummary(): void {
    const rows = this.visibleRows().map((row) => [
      row.code,
      row.source,
      row.assignment || 'Unmapped',
      row.context,
      row.effectiveFrom,
      row.status,
    ]);
    const csv = [[...this.activeTab().columns], ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'commission-mapping-summary.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
}
