import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertService } from '../../../services/alert.service';
import { OvertimeListRecord, OvertimeListService } from '../../../services/overtime-list.service';
import { formatApiErrorMessage } from '../../../utils/api-error.util';
import {
  buildPaginationFooterItems,
  paginationItemTrack,
  PaginationFooterItem,
} from '../../../utils/pagination.util';

interface OvertimeListColumn {
  key: string;
  label: string;
  visible: boolean;
}

@Component({
  selector: 'app-overtime-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './overtime-list.html',
  styleUrl: './overtime-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OvertimeListComponent implements OnInit {
  private readonly overtimeListService = inject(OvertimeListService);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly records = signal<OvertimeListRecord[]>([]);
  readonly searchText = signal('');
  readonly currentPage = signal(1);
  readonly pageSize = signal(25);
  readonly pageSizeOptions = [10, 25, 50, 100];
  readonly showColumnSettings = signal(false);
  readonly columns = signal<OvertimeListColumn[]>([]);

  readonly filteredRecords = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase();
    const records = this.records();
    if (!query) {
      return records;
    }

    return records.filter((record) =>
      Object.entries(record.values).some(([key, value]) =>
        !this.isFlagField(key) && this.formatValue(value).toLocaleLowerCase().includes(query),
      ),
    );
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredRecords().length / this.pageSize())));
  readonly paginationItems = computed<PaginationFooterItem[]>(() =>
    buildPaginationFooterItems(this.totalPages(), this.currentPage()),
  );
  readonly paginatedRecords = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredRecords().slice(start, start + this.pageSize());
  });
  readonly paginationStart = computed(() =>
    this.filteredRecords().length ? (this.currentPage() - 1) * this.pageSize() + 1 : 0,
  );
  readonly paginationEnd = computed(() => Math.min(
    this.currentPage() * this.pageSize(),
    this.filteredRecords().length,
  ));
  readonly visibleColumns = computed(() => this.columns().filter((column) => column.visible));

  ngOnInit(): void {
    this.loadRecords();
  }

  goToAddPage(): void {
    void this.router.navigate(['/setup/overtime-list/add']);
  }

  loadRecords(): void {
    this.loading.set(true);
    this.overtimeListService.fetchOvertimeList().subscribe({
      next: (records) => {
        this.records.set(records);
        this.columns.set(this.createColumns(records));
        this.currentPage.set(1);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.records.set([]);
        this.columns.set([]);
        this.loading.set(false);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load overtime list.'),
        );
      },
    });
  }

  onSearchChange(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(1);
  }

  onPageSizeChange(value: number | string): void {
    const size = Number(value);
    if (Number.isInteger(size) && size > 0) {
      this.pageSize.set(size);
      this.currentPage.set(1);
    }
  }

  setColumnVisibility(key: string, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    this.columns.update((columns) => columns.map((column) =>
      column.key === key ? { ...column, visible: target.checked } : column,
    ));
  }

  setPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  trackPaginationItem(index: number, item: PaginationFooterItem): string {
    return paginationItemTrack(index, item);
  }

  formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  formatCellValue(key: string, value: unknown): string {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (normalizedKey === 'status' && typeof value === 'string') {
      const status = value.trim().toLowerCase();
      if (status === 'posted' || status === 'pending') {
        return 'Approved';
      }
    }

    if (!['createdat', 'updatedat'].includes(normalizedKey)) {
      return this.formatValue(value);
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return this.formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
    }

    if (typeof value !== 'string') {
      return this.formatValue(value);
    }

    const dateParts = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
    if (!dateParts) {
      return this.formatValue(value);
    }

    return this.formatDateParts(Number(dateParts[1]), Number(dateParts[2]), Number(dateParts[3]));
  }

  private createColumns(records: OvertimeListRecord[]): OvertimeListColumn[] {
    const keys = new Set<string>();
    for (const record of records) {
      for (const key of Object.keys(record.values)) {
        if (!this.isFlagField(key)) {
          keys.add(key);
        }
      }
    }

    return Array.from(keys, (key) => ({
      key,
      label: this.formatColumnLabel(key),
      visible: true,
    }));
  }

  private isFlagField(key: string): boolean {
    return key.toLowerCase().replace(/[^a-z]/g, '') === 'flag';
  }

  private formatColumnLabel(key: string): string {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private formatDateParts(year: number, month: number, day: number): string {
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  }
}
