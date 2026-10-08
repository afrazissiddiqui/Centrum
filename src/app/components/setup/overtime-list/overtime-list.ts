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

type OvertimeDateFilterMode = 'today' | 'all' | 'specific' | 'range';

function toLocalDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  readonly dateFilterMode = signal<OvertimeDateFilterMode>('all');
  readonly todayDate = toLocalDateInputValue(new Date());
  readonly specificDate = signal('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly employeeSearchText = signal('');
  readonly currentPage = signal(1);
  readonly pageSize = signal(25);
  readonly pageSizeOptions = [10, 25, 50, 100];
  readonly showColumnSettings = signal(false);
  readonly columns = signal<OvertimeListColumn[]>([]);
  readonly selectedRecordId = signal<string | null>(null);

  readonly filteredRecords = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase();
    return this.records().filter((record) => {
      const overtimeDate = this.overtimeDateValue(record);
      const dateMatches = this.dateMatches(overtimeDate);
      const employeeQuery = this.employeeSearchText().trim().toLocaleLowerCase();
      const employeeCode = this.employeeValue(record, ['employeecode', 'employeeid']).toLocaleLowerCase();
      const employeeName = this.employeeValue(record, ['employeename']).toLocaleLowerCase();
      const employeeMatches = !employeeQuery ||
        employeeCode.includes(employeeQuery) ||
        employeeName.includes(employeeQuery);
      const searchMatches = !query || Object.entries(record.values).some(([key, value]) =>
        !this.isHiddenListField(key) && this.formatValue(value).toLocaleLowerCase().includes(query),
      );
      return dateMatches && employeeMatches && searchMatches;
    });
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredRecords().length / this.pageSize())));
  readonly totalOvertimeMinutes = computed(() =>
    this.records().reduce((total, record) =>
      total + (this.durationToMinutes(this.fieldValue(record, ['overtimehours'])) ?? 0),
    0),
  );
  readonly employeeCount = computed(() => {
    const employees = new Set<string>();
    for (const record of this.records()) {
      const employee = this.employeeValue(record, ['employeecode', 'employeeid', 'employeename']);
      if (employee) {
        employees.add(employee.toLocaleLowerCase());
      }
    }
    return employees.size;
  });
  readonly pendingRecordCount = computed(() =>
    this.records().filter((record) =>
      String(this.fieldValue(record, ['status']) ?? '').trim().toLocaleLowerCase() === 'pending',
    ).length,
  );
  readonly monthlyOvertimeTotals = computed(() => {
    const totals = new Map<string, number>();
    for (const record of this.records()) {
      const employeeCode = this.employeeValue(record, ['employeecode', 'employeeid']).toLocaleLowerCase();
      const overtimeDate = this.overtimeDateValue(record);
      const overtimeMinutes = this.durationToMinutes(this.fieldValue(record, ['overtimehours']));
      if (!employeeCode || !overtimeDate || overtimeMinutes === null) {
        continue;
      }
      const monthKey = `${employeeCode}:${overtimeDate.slice(0, 7)}`;
      totals.set(monthKey, (totals.get(monthKey) ?? 0) + overtimeMinutes);
    }
    return totals;
  });
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
  readonly detailRecord = computed(() => {
    const selectedId = this.selectedRecordId();
    const records = this.filteredRecords();
    return records.find((record) => record.id === selectedId) ??
      this.paginatedRecords()[0] ??
      null;
  });

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

  onDateFilterModeChange(value: string): void {
    if (value === 'today' || value === 'all' || value === 'specific' || value === 'range') {
      this.dateFilterMode.set(value);
      this.currentPage.set(1);
    }
  }

  onSpecificDateChange(value: string): void {
    this.specificDate.set(value);
    this.currentPage.set(1);
  }

  onDateFromChange(value: string): void {
    this.dateFrom.set(value);
    this.currentPage.set(1);
  }

  onDateToChange(value: string): void {
    this.dateTo.set(value);
    this.currentPage.set(1);
  }

  onEmployeeSearchChange(value: string): void {
    this.employeeSearchText.set(value);
    this.currentPage.set(1);
  }

  selectRecord(record: OvertimeListRecord): void {
    this.selectedRecordId.set(record.id);
  }

  onRecordRowKeydown(record: OvertimeListRecord, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectRecord(record);
    }
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

  formatMinutes(totalMinutes: number): string {
    return this.formatDuration(totalMinutes);
  }

  overtimeHoursValue(record: OvertimeListRecord): string {
    const minutes = this.durationToMinutes(this.fieldValue(record, ['overtimehours']));
    return minutes === null ? '—' : this.formatDuration(minutes);
  }

  employeeInitials(record: OvertimeListRecord): string {
    const name = this.employeeValue(record, ['employeename']);
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toLocaleUpperCase())
      .join('');
    return initials || 'OT';
  }

  formatCellValue(key: string, value: unknown): string {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
    if (normalizedKey === 'status' && typeof value === 'string') {
      const status = value.trim().toLowerCase();
      if (status === 'posted' || status === 'pending') {
        return 'Approved';
      }
    }

    if (!['overtimedate', 'createdat', 'updatedat'].includes(normalizedKey)) {
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

  formatRecordCell(key: string, record: OvertimeListRecord): string {
    if (key === 'monthlyOvertime') {
      const employeeCode = this.employeeValue(record, ['employeecode', 'employeeid']).toLocaleLowerCase();
      const month = this.overtimeDateValue(record).slice(0, 7);
      const minutes = this.monthlyOvertimeTotals().get(`${employeeCode}:${month}`);
      return minutes === undefined ? '—' : this.formatDuration(minutes);
    }
    return this.formatCellValue(key, record.values[key]);
  }

  private createColumns(records: OvertimeListRecord[]): OvertimeListColumn[] {
    const keys = new Set<string>();
    for (const record of records) {
      for (const key of Object.keys(record.values)) {
        if (!this.isHiddenListField(key)) {
          keys.add(key);
        }
      }
    }

    const columns = Array.from(keys, (key) => ({
      key,
      label: this.formatColumnLabel(key),
      visible: true,
    }));
    columns.push({ key: 'monthlyOvertime', label: 'Monthly Overtime', visible: true });
    return columns;
  }

  private isHiddenListField(key: string): boolean {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
    return normalizedKey === 'flag' || normalizedKey === 'id';
  }

  private overtimeDateValue(record: OvertimeListRecord): string {
    const dateEntry = Object.entries(record.values).find(([key]) =>
      key.toLowerCase().replace(/[^a-z]/g, '') === 'overtimedate',
    );
    const value = dateEntry?.[1];
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
  }

  employeeValue(record: OvertimeListRecord, fieldNames: string[]): string {
    const value = this.fieldValue(record, fieldNames);
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  }

  private fieldValue(record: OvertimeListRecord, fieldNames: string[]): unknown {
    return Object.entries(record.values).find(([key]) =>
      fieldNames.includes(key.toLowerCase().replace(/[^a-z]/g, '')),
    )?.[1];
  }

  private durationToMinutes(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) && value >= 0 ? value * 60 : null;
    }
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const text = value.trim();
    const clockFormat = text.match(/^(\d{1,3}):(\d{2})$/);
    if (clockFormat) {
      const minutes = Number(clockFormat[2]);
      return minutes < 60 ? Number(clockFormat[1]) * 60 + minutes : null;
    }
    const parts = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/gi)];
    if (parts.length) {
      return parts.reduce((total, part) => {
        const amount = Number(part[1]);
        return total + (part[2].toLocaleLowerCase().startsWith('h') ? amount * 60 : amount);
      }, 0);
    }
    const numericHours = Number(text);
    return Number.isFinite(numericHours) && numericHours >= 0 ? numericHours * 60 : null;
  }

  private formatDuration(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    if (hours === 0) {
      return minutes === 0 ? '0h' : `${minutes}m`;
    }
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }

  private dateMatches(overtimeDate: string): boolean {
    switch (this.dateFilterMode()) {
      case 'today':
        return overtimeDate === this.todayDate;
      case 'specific':
        return !!this.specificDate() && overtimeDate === this.specificDate();
      case 'range': {
        const from = this.dateFrom();
        const to = this.dateTo();
        if (from && to && from > to) {
          return false;
        }
        return !!overtimeDate && (!from || overtimeDate >= from) && (!to || overtimeDate <= to);
      }
      case 'all':
        return true;
    }
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
