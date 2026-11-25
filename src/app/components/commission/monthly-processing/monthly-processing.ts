import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type BatchStatus = 'Draft' | 'Submitted' | 'Calculated' | 'Approved' | 'Transferred' | 'Rejected';

interface CommissionBatch {
  id: string;
  category: string;
  branch: string;
  documents: number;
  amount: number;
  status: BatchStatus;
  duplicateCheck: 'Passed' | 'Review Required';
}

const INITIAL_BATCHES: CommissionBatch[] = [
  {
    id: 'COM-2611-KHI-02',
    category: 'Employee Sales',
    branch: 'Karachi South',
    documents: 24,
    amount: 235000,
    status: 'Submitted',
    duplicateCheck: 'Passed',
  },
  {
    id: 'COM-2611-FSD-04',
    category: 'Production',
    branch: 'Faisalabad Plant',
    documents: 12,
    amount: 107000,
    status: 'Submitted',
    duplicateCheck: 'Passed',
  },
  {
    id: 'COM-2611-LHR-06',
    category: 'Assembly Teams',
    branch: 'Lahore Main',
    documents: 19,
    amount: 175000,
    status: 'Calculated',
    duplicateCheck: 'Passed',
  },
  {
    id: 'COM-2611-LHR-01',
    category: 'Employee Sales',
    branch: 'Lahore Main',
    documents: 31,
    amount: 385000,
    status: 'Transferred',
    duplicateCheck: 'Passed',
  },
  {
    id: 'COM-2611-ISB-07',
    category: 'Employee Sales',
    branch: 'Islamabad North',
    documents: 9,
    amount: 92000,
    status: 'Rejected',
    duplicateCheck: 'Review Required',
  },
];

@Component({
  selector: 'app-monthly-processing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './monthly-processing.html',
  styleUrl: './monthly-processing.css',
})
export class MonthlyProcessingComponent {
  readonly batches = signal<CommissionBatch[]>(INITIAL_BATCHES);
  readonly selectedBranch = signal('All Branches');
  readonly selectedBatchId = signal('COM-2611-KHI-02');
  readonly selectedBatchIds = signal<string[]>(['COM-2611-KHI-02']);
  readonly approverComments = signal('');
  readonly notice = signal('');
  readonly periodClosed = signal(false);

  readonly branches = [
    'All Branches',
    'Karachi South',
    'Islamabad North',
    'Lahore Main',
    'Faisalabad Plant',
  ];

  readonly visibleBatches = computed(() => {
    const branch = this.selectedBranch();
    return this.batches().filter((batch) => branch === 'All Branches' || batch.branch === branch);
  });
  readonly selectedBatch = computed<CommissionBatch | null>(
    () =>
      this.visibleBatches().find((batch) => batch.id === this.selectedBatchId()) ??
      this.visibleBatches()[0] ??
      null,
  );
  readonly isAllVisibleSelected = computed(
    () =>
      this.visibleBatches().length > 0 &&
      this.visibleBatches().every((batch) => this.selectedBatchIds().includes(batch.id)),
  );
  readonly selectedVisibleBatches = computed(() => {
    const selectedIds = new Set(this.selectedBatchIds());
    return this.visibleBatches().filter((batch) => selectedIds.has(batch.id));
  });
  readonly selectedAmount = computed(() =>
    this.selectedVisibleBatches().reduce((total, batch) => total + batch.amount, 0),
  );
  readonly selectedVisibleDocumentCount = computed(() =>
    this.selectedVisibleBatches().reduce((total, batch) => total + batch.documents, 0),
  );

  selectBatch(batchId: string): void {
    this.selectedBatchId.set(batchId);
    this.notice.set('');
  }

  toggleBatchSelection(batchId: string, checked: boolean): void {
    this.selectedBatchIds.update((ids) =>
      checked ? (ids.includes(batchId) ? ids : [...ids, batchId]) : ids.filter((id) => id !== batchId),
    );
    if (checked) {
      this.selectedBatchId.set(batchId);
    }
  }

  toggleAllVisible(event: Event): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const checked = target.checked;
    const visibleIds = this.visibleBatches().map((batch) => batch.id);
    this.selectedBatchIds.update((ids) =>
      checked
        ? [...new Set([...ids, ...visibleIds])]
        : ids.filter((id) => !visibleIds.includes(id)),
    );
  }

  onBatchCheckboxChange(batchId: string, event: Event): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    this.toggleBatchSelection(batchId, target.checked);
  }

  validateMappings(): void {
    const count = this.selectedVisibleBatches().length;
    this.notice.set(
      count
        ? `Mappings validated for ${count} selected batch${count === 1 ? '' : 'es'}.`
        : 'Select one or more batches to validate mappings.',
    );
  }

  calculateCommission(): void {
    if (this.periodClosed()) {
      this.notice.set('The Nov 2026 commission period is closed.');
      return;
    }
    const drafts = this.selectedVisibleBatches().filter((batch) => batch.status === 'Draft');
    if (!drafts.length) {
      this.notice.set('Only draft batches may be recalculated.');
      return;
    }
    const ids = new Set(drafts.map((batch) => batch.id));
    this.updateStatuses(ids, 'Calculated');
    this.notice.set(`Commission calculated for ${drafts.length} draft batch${drafts.length === 1 ? '' : 'es'}.`);
  }

  closePeriod(): void {
    this.periodClosed.set(true);
    this.notice.set('Nov 2026 commission period closed in this demo session.');
  }

  transferToPayroll(): void {
    if (this.periodClosed()) {
      this.notice.set('The Nov 2026 commission period is closed.');
      return;
    }
    const eligible = this.selectedVisibleBatches().filter(
      (batch) => batch.status === 'Approved' || batch.status === 'Calculated',
    );
    if (!eligible.length) {
      this.notice.set('Only approved or calculated batches can be transferred to payroll.');
      return;
    }
    this.updateStatuses(new Set(eligible.map((batch) => batch.id)), 'Transferred');
    this.notice.set(`${eligible.length} batch${eligible.length === 1 ? '' : 'es'} transferred to payroll.`);
  }

  approveSelectedBatch(): void {
    const batch = this.selectedBatch();
    if (!batch || batch.status !== 'Submitted' || this.periodClosed()) {
      this.notice.set('Select a submitted batch in an open period to approve it.');
      return;
    }
    this.updateStatuses(new Set([batch.id]), 'Approved');
    this.notice.set(`${batch.id} approved. ${this.approverComments().trim() ? 'Approver comments saved.' : ''}`.trim());
  }

  rejectSelectedBatch(): void {
    const batch = this.selectedBatch();
    if (!batch || batch.status !== 'Submitted' || this.periodClosed()) {
      this.notice.set('Select a submitted batch in an open period to reject it.');
      return;
    }
    this.updateStatuses(new Set([batch.id]), 'Rejected');
    this.notice.set(`${batch.id} rejected.`);
  }

  formatPkr(amount: number): string {
    return amount.toLocaleString('en-US');
  }

  exportSummary(): void {
    const rows = this.visibleBatches().map((batch) => [
      batch.id,
      batch.category,
      batch.branch,
      batch.documents,
      batch.amount,
      batch.status,
    ]);
    const csv = [
      ['Batch ID', 'Category', 'Branch', 'Docs', 'PKR', 'Status'],
      ...rows,
    ]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'commission-monthly-processing.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  fetchSapData(): void {
    this.notice.set('SAP data fetch is a demo placeholder; no SAP connection is configured.');
  }

  private updateStatuses(batchIds: Set<string>, status: BatchStatus): void {
    this.batches.update((batches) =>
      batches.map((batch) => (batchIds.has(batch.id) ? { ...batch, status } : batch)),
    );
  }
}
