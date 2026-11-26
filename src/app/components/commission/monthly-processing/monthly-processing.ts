import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { publicApiUrl } from '../../../config/api.config';

type BatchStatus = 'Draft' | 'Submitted' | 'Calculated' | 'Approved' | 'Transferred' | 'Rejected';
type DuplicateCheck = 'Passed' | 'Review Required';

interface CommissionBatch {
  id: string;
  code: string;
  category: string;
  branch: string;
  documents: number;
  amount: number;
  status: BatchStatus;
  duplicateCheck: DuplicateCheck;
}

const COMMISSION_BATCH_PERIOD = '2026-11';
const COMMISSION_BATCH_LIST_URL = publicApiUrl(
  `commission-batch-list?period=${encodeURIComponent(COMMISSION_BATCH_PERIOD)}`,
);
const COMMISSION_BATCH_VALIDATE_URL = publicApiUrl('commission-batch-validate');
const COMMISSION_BATCH_CALCULATE_URL = publicApiUrl('commission-batch-calculate');
const COMMISSION_BATCH_SUBMIT_URL = publicApiUrl('commission-batch-submit');
const COMMISSION_PERIOD_CLOSE_URL = publicApiUrl('commission-period-close');
const COMMISSION_TRANSFER_TO_PAYROLL_URL = publicApiUrl('commission-transfer-to-payroll');

@Component({
  selector: 'app-monthly-processing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './monthly-processing.html',
  styleUrl: './monthly-processing.css',
})
export class MonthlyProcessingComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly period = COMMISSION_BATCH_PERIOD;
  readonly periodLabel = 'Nov 2026';
  readonly batches = signal<CommissionBatch[]>([]);
  readonly selectedBranch = signal('All Branches');
  readonly selectedBatchId = signal('');
  readonly selectedBatchIds = signal<string[]>([]);
  readonly approverComments = signal('');
  readonly notice = signal('');
  readonly noticeIsError = signal(false);
  readonly periodClosed = signal(false);
  readonly branches = signal<string[]>([]);
  readonly isLoading = signal(true);
  readonly isValidating = signal(false);
  readonly isCalculating = signal(false);
  readonly isSubmitting = signal(false);
  readonly isApproving = signal(false);
  readonly isRejecting = signal(false);
  readonly isClosingPeriod = signal(false);
  readonly isTransferring = signal(false);
  readonly loadError = signal('');

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

  ngOnInit(): void {
    this.loadBatches();
  }

  private loadBatches(preserveSelection = false): void {
    const previousSelectedBatchId = this.selectedBatchId();
    const previousSelectedBatchIds = this.selectedBatchIds();
    this.isLoading.set(true);
    this.loadError.set('');
    this.http.get<unknown>(COMMISSION_BATCH_LIST_URL).subscribe({
      next: (response) => {
        const mapped = this.mapBatchListResponse(response);
        if (mapped === null) {
          this.loadError.set('Commission batches could not be loaded. The API response was invalid.');
        } else {
          this.batches.set(mapped.batches);
          this.branches.set(mapped.branches);
          this.periodClosed.set(mapped.periodClosed);
          const batchIds = new Set(mapped.batches.map((batch) => batch.id));
          const retainedSelectedBatchIds = preserveSelection
            ? previousSelectedBatchIds.filter((id) => batchIds.has(id))
            : [];
          const selectedBatchIds = retainedSelectedBatchIds.length
            ? retainedSelectedBatchIds
            : mapped.batches[0]
              ? [mapped.batches[0].id]
              : [];
          this.selectedBatchIds.set(selectedBatchIds);
          this.selectedBatchId.set(
            preserveSelection && batchIds.has(previousSelectedBatchId)
              ? previousSelectedBatchId
              : selectedBatchIds[0] ?? '',
          );
          this.loadError.set('');
        }
        this.isLoading.set(false);
      },
      error: (error: unknown) => {
        this.loadError.set(
          this.apiErrorMessage(error, 'Unable to load commission batches. Please try again later.'),
        );
        this.isLoading.set(false);
      },
    });
  }

  selectBatch(batchId: string): void {
    this.selectedBatchId.set(batchId);
    this.setNotice('');
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

  validateBatches(): void {
    if (
      this.isValidating() ||
      this.isCalculating() ||
      this.isSubmitting() ||
      this.isApproving() ||
      this.isRejecting() ||
      this.isClosingPeriod() ||
      this.isTransferring()
    ) {
      return;
    }

    const batches = this.selectedVisibleBatches();
    if (!batches.length) {
      this.setNotice('Select one or more batches to validate.');
      return;
    }

    const batchIds = batches.map((batch) => Number(batch.id));
    if (!batchIds.every((id) => Number.isSafeInteger(id) && id > 0)) {
      this.setNotice('Batch validation could not run because a selected batch has an invalid ID.', true);
      return;
    }

    this.setNotice('');
    this.isValidating.set(true);
    this.http.post<unknown>(COMMISSION_BATCH_VALIDATE_URL, {
      period: this.period,
      batch_ids: batchIds,
    }).subscribe({
      next: (response) => {
        this.isValidating.set(false);
        if (!this.isRecord(response)) {
          this.setNotice('Pre-calculation batch validation returned an invalid response.', true);
          return;
        }

        const successful = response['status'] === true || response['valid'] === true;
        const failed = response['status'] === false || response['valid'] === false;
        if (failed || !successful) {
          this.setNotice(
            this.valueAsString(response['message']) || 'Pre-calculation batch validation failed.',
            true,
          );
          return;
        }

        this.setNotice(
          this.valueAsString(response['message']) || 'Pre-calculation batch validation completed.',
        );
      },
      error: (error: unknown) => {
        this.isValidating.set(false);
        this.setNotice(
          this.apiErrorMessage(error, 'Unable to validate batches. Please try again later.'),
          true,
        );
      },
    });
  }

  calculateCommission(): void {
    if (this.periodClosed()) {
      this.setNotice('The Nov 2026 commission period is closed.');
      return;
    }
    if (
      this.isCalculating() ||
      this.isValidating() ||
      this.isSubmitting() ||
      this.isApproving() ||
      this.isRejecting() ||
      this.isClosingPeriod() ||
      this.isTransferring()
    ) {
      return;
    }

    const selectedBatches = this.selectedVisibleBatches();
    if (!selectedBatches.length) {
      this.setNotice('Select one or more batches to calculate.');
      return;
    }

    const eligibleStatuses: BatchStatus[] = ['Draft', 'Calculated', 'Rejected'];
    if (selectedBatches.some((batch) => !eligibleStatuses.includes(batch.status))) {
      this.setNotice('Only draft, calculated, or rejected batches can be recalculated.');
      return;
    }

    const batchIds = selectedBatches.map((batch) => Number(batch.id));
    if (!batchIds.every((id) => Number.isSafeInteger(id) && id > 0)) {
      this.setNotice('Commission calculation could not run because a selected batch has an invalid ID.', true);
      return;
    }

    this.setNotice('');
    this.isCalculating.set(true);
    this.http.post<unknown>(COMMISSION_BATCH_CALCULATE_URL, {
      period: this.period,
      batch_ids: batchIds,
    }).subscribe({
      next: (response) => {
        this.isCalculating.set(false);
        if (
          this.isRecord(response) &&
          (response['status'] === false || response['success'] === false)
        ) {
          this.setNotice(
            this.valueAsString(response['message']) || 'Commission batch calculation failed.',
            true,
          );
          return;
        }

        this.setNotice(
          this.isRecord(response) && this.valueAsString(response['message'])
            ? this.valueAsString(response['message'])
            : `Commission calculated for ${batchIds.length} batch${batchIds.length === 1 ? '' : 'es'}.`,
        );
        this.loadBatches(true);
      },
      error: (error: unknown) => {
        this.isCalculating.set(false);
        this.setNotice(
          this.apiErrorMessage(error, 'Unable to calculate commission batches. Please try again later.'),
          true,
        );
      },
    });
  }

  submitBatchesForApproval(): void {
    if (this.periodClosed()) {
      this.setNotice('The Nov 2026 commission period is closed.');
      return;
    }
    if (
      this.isSubmitting() ||
      this.isCalculating() ||
      this.isValidating() ||
      this.isApproving() ||
      this.isRejecting() ||
      this.isClosingPeriod() ||
      this.isTransferring()
    ) {
      return;
    }

    const selectedBatches = this.selectedVisibleBatches();
    if (!selectedBatches.length) {
      this.setNotice('Select one or more calculated batches to submit.');
      return;
    }
    if (selectedBatches.some((batch) => batch.status !== 'Calculated')) {
      this.setNotice('Only calculated batches can be submitted for approval.');
      return;
    }

    const batchIds = selectedBatches.map((batch) => Number(batch.id));
    if (!batchIds.every((id) => Number.isSafeInteger(id) && id > 0)) {
      this.setNotice('Batch submission could not run because a selected batch has an invalid ID.', true);
      return;
    }

    this.setNotice('');
    this.isSubmitting.set(true);
    this.http.post<unknown>(COMMISSION_BATCH_SUBMIT_URL, { batch_ids: batchIds }).subscribe({
      next: (response) => {
        this.isSubmitting.set(false);
        if (
          this.isRecord(response) &&
          (response['status'] === false || response['success'] === false)
        ) {
          this.setNotice(
            this.valueAsString(response['message']) || 'Commission batches could not be submitted.',
            true,
          );
          return;
        }

        this.setNotice(
          this.isRecord(response) && this.valueAsString(response['message'])
            ? this.valueAsString(response['message'])
            : `${batchIds.length} batch${batchIds.length === 1 ? '' : 'es'} submitted for approval.`,
        );
        this.loadBatches(true);
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.setNotice(
          this.apiErrorMessage(error, 'Unable to submit batches for approval. Please try again later.'),
          true,
        );
      },
    });
  }

  closePeriod(): void {
    if (
      this.periodClosed() ||
      this.isClosingPeriod() ||
      this.isLoading() ||
      this.isValidating() ||
      this.isCalculating() ||
      this.isSubmitting() ||
      this.isApproving() ||
      this.isRejecting() ||
      this.isTransferring()
    ) {
      return;
    }

    this.isClosingPeriod.set(true);
    this.setNotice('');
    this.http.post<unknown>(COMMISSION_PERIOD_CLOSE_URL, { period: this.period }).subscribe({
      next: (response) => {
        this.isClosingPeriod.set(false);
        if (
          this.isRecord(response) &&
          (response['status'] === false || response['success'] === false)
        ) {
          this.setNotice(
            this.valueAsString(response['message']) || 'The commission period could not be closed.',
            true,
          );
          return;
        }

        this.periodClosed.set(true);
        this.setNotice(
          this.isRecord(response) && this.valueAsString(response['message'])
            ? this.valueAsString(response['message'])
            : 'Nov 2026 commission period closed.',
        );
        this.loadBatches(true);
      },
      error: (error: unknown) => {
        this.isClosingPeriod.set(false);
        this.setNotice(
          this.apiErrorMessage(error, 'Unable to close the commission period. Please try again later.'),
          true,
        );
      },
    });
  }

  transferToPayroll(): void {
    if (this.periodClosed()) {
      this.setNotice('The Nov 2026 commission period is closed.');
      return;
    }
    if (
      this.isTransferring() ||
      this.isClosingPeriod() ||
      this.isCalculating() ||
      this.isSubmitting() ||
      this.isValidating() ||
      this.isApproving() ||
      this.isRejecting() ||
      this.isLoading()
    ) {
      return;
    }

    const selectedBatches = this.selectedVisibleBatches();
    if (!selectedBatches.length) {
      this.setNotice('Select one or more batches to transfer to payroll.');
      return;
    }
    if (selectedBatches.some((batch) => batch.status !== 'Approved' && batch.status !== 'Calculated')) {
      this.setNotice('Only approved or calculated batches can be transferred to payroll.');
      return;
    }

    const batchIds = selectedBatches.map((batch) => Number(batch.id));
    if (!batchIds.every((id) => Number.isSafeInteger(id) && id > 0)) {
      this.setNotice('Payroll transfer could not run because a selected batch has an invalid ID.', true);
      return;
    }

    this.setNotice('');
    this.isTransferring.set(true);
    this.http.post<unknown>(COMMISSION_TRANSFER_TO_PAYROLL_URL, {
      period: this.period,
      batch_ids: batchIds,
    }).subscribe({
      next: (response) => {
        this.isTransferring.set(false);
        if (
          this.isRecord(response) &&
          (response['status'] === false || response['success'] === false)
        ) {
          this.setNotice(
            this.valueAsString(response['message']) || 'Commission batches could not be transferred to payroll.',
            true,
          );
          return;
        }

        this.setNotice(
          this.isRecord(response) && this.valueAsString(response['message'])
            ? this.valueAsString(response['message'])
            : `${batchIds.length} batch${batchIds.length === 1 ? '' : 'es'} transferred to payroll.`,
        );
        this.loadBatches(true);
      },
      error: (error: unknown) => {
        this.isTransferring.set(false);
        this.setNotice(
          this.apiErrorMessage(error, 'Unable to transfer batches to payroll. Please try again later.'),
          true,
        );
      },
    });
  }

  approveSelectedBatch(): void {
    const batch = this.selectedBatch();
    if (
      !batch ||
      (batch.status !== 'Submitted' && batch.status !== 'Calculated') ||
      this.periodClosed()
    ) {
      this.setNotice('Select a submitted or calculated batch in an open period to approve it.');
      return;
    }
    if (
      this.isApproving() ||
      this.isRejecting() ||
      this.isCalculating() ||
      this.isSubmitting() ||
      this.isValidating() ||
      this.isClosingPeriod() ||
      this.isTransferring()
    ) {
      return;
    }

    const batchId = Number(batch.id);
    if (!Number.isSafeInteger(batchId) || batchId <= 0) {
      this.setNotice('Batch approval could not run because the selected batch has an invalid ID.', true);
      return;
    }

    this.setNotice('');
    this.isApproving.set(true);
    this.http.post<unknown>(
      publicApiUrl(`commission-batch/${batchId}/approve`),
      { remarks: this.approverComments().trim() },
    ).subscribe({
      next: (response) => {
        this.isApproving.set(false);
        if (
          this.isRecord(response) &&
          (response['status'] === false || response['success'] === false)
        ) {
          this.setNotice(
            this.valueAsString(response['message']) || 'Commission batch could not be approved.',
            true,
          );
          return;
        }

        this.setNotice(
          this.isRecord(response) && this.valueAsString(response['message'])
            ? this.valueAsString(response['message'])
            : `${batch.code} approved.`,
        );
        this.loadBatches(true);
      },
      error: (error: unknown) => {
        this.isApproving.set(false);
        this.setNotice(
          this.apiErrorMessage(error, 'Unable to approve the commission batch. Please try again later.'),
          true,
        );
      },
    });
  }

  rejectSelectedBatch(): void {
    const batch = this.selectedBatch();
    if (
      !batch ||
      (batch.status !== 'Submitted' && batch.status !== 'Calculated') ||
      this.periodClosed()
    ) {
      this.setNotice('Select a submitted or calculated batch in an open period to reject it.');
      return;
    }
    if (
      this.isRejecting() ||
      this.isApproving() ||
      this.isCalculating() ||
      this.isSubmitting() ||
      this.isValidating() ||
      this.isClosingPeriod() ||
      this.isTransferring()
    ) {
      return;
    }

    const batchId = Number(batch.id);
    if (!Number.isSafeInteger(batchId) || batchId <= 0) {
      this.setNotice('Batch rejection could not run because the selected batch has an invalid ID.', true);
      return;
    }

    this.setNotice('');
    this.isRejecting.set(true);
    this.http.post<unknown>(
      publicApiUrl(`commission-batch/${batchId}/reject`),
      { remarks: this.approverComments().trim() },
    ).subscribe({
      next: (response) => {
        this.isRejecting.set(false);
        if (
          this.isRecord(response) &&
          (response['status'] === false || response['success'] === false)
        ) {
          this.setNotice(
            this.valueAsString(response['message']) || 'Commission batch could not be rejected.',
            true,
          );
          return;
        }

        this.setNotice(
          this.isRecord(response) && this.valueAsString(response['message'])
            ? this.valueAsString(response['message'])
            : `${batch.code} rejected.`,
        );
        this.loadBatches(true);
      },
      error: (error: unknown) => {
        this.isRejecting.set(false);
        this.setNotice(
          this.apiErrorMessage(error, 'Unable to reject the commission batch. Please try again later.'),
          true,
        );
      },
    });
  }

  formatPkr(amount: number): string {
    return amount.toLocaleString('en-US');
  }

  exportSummary(): void {
    const rows = this.visibleBatches().map((batch) => [
      batch.code,
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
    this.setNotice('SAP data fetch is a demo placeholder; no SAP connection is configured.');
  }

  private setNotice(message: string, isError = false): void {
    this.notice.set(message);
    this.noticeIsError.set(isError);
  }

  private mapBatchListResponse(response: unknown): {
    batches: CommissionBatch[];
    branches: string[];
    periodClosed: boolean;
  } | null {
    if (
      !this.isRecord(response) ||
      response['status'] === false ||
      typeof response['periodClosed'] !== 'boolean' ||
      !Array.isArray(response['data']) ||
      !response['data'].every((item: unknown) => this.isRecord(item))
    ) {
      return null;
    }

    const batches = response['data']
      .map((item: Record<string, unknown>) => this.mapBatch(item))
      .filter((batch: CommissionBatch | null): batch is CommissionBatch => batch !== null);
    if (batches.length !== response['data'].length) {
      return null;
    }

    return {
      batches,
      branches: [...new Set(batches.map((batch) => batch.branch).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
      periodClosed: response['periodClosed'],
    };
  }

  private mapBatch(item: Record<string, unknown>): CommissionBatch | null {
    const status = this.valueAsString(item['status']);
    const duplicateCheck = this.valueAsString(item['duplicate_check']);
    const documents = this.valueAsNumberOrNull(item['documents_count']);
    const amount = this.valueAsNumberOrNull(item['total_amount']);
    const id = this.valueAsString(item['id']);
    const code = this.valueAsString(item['batch_code']);
    if (
      !id ||
      !code ||
      !this.isBatchStatus(status) ||
      (duplicateCheck !== 'Passed' && duplicateCheck !== 'Review Required') ||
      documents === null ||
      amount === null
    ) {
      return null;
    }

    return {
      id,
      code,
      category: this.valueAsString(item['category']),
      branch: this.valueAsString(item['branch']),
      documents,
      amount,
      status,
      duplicateCheck,
    };
  }

  private isBatchStatus(value: string): value is BatchStatus {
    return ['Draft', 'Submitted', 'Calculated', 'Approved', 'Transferred', 'Rejected'].includes(value);
  }

  private valueAsString(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
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
      const message = error.error['message'];
      if (typeof message === 'string') {
        return message;
      }
    }
    return fallback;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
