import { CommonModule } from '@angular/common';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ColumnResizeDirective } from '../../../../column-resize';
import { PageToolbarComponent } from '../../../page-toolbar/page-toolbar';
import { AlertService } from '../../../../services/alert.service';
import {
  AttendanceDailyRecord,
  AttendanceManagementService,
  AttendanceQuery,
  AttendanceQueryMode,
  AttendanceSlotRef,
  formatIsoDate,
  formatPunchDate,
  formatPunchTime,
  formatWorkingDuration,
} from '../../../../services/attendance-management.service';
import { ShellbarSearchService } from '../../../../services/shellbar-search.service';
import { formatApiErrorMessage } from '../../../../utils/api-error.util';
import {
  buildPaginationFooterItems,
  paginationItemTrack,
  PaginationFooterItem,
} from '../../../../utils/pagination.util';
import { connectShellbarSearch } from '../../../../utils/shellbar-search-connect.util';
import { PayrollMasterLayoutService } from '../payroll-master-layout.service';

type AttendanceColumnKey =
  | 'EmployeeId'
  | 'EmployeeName'
  | 'AttendanceDate'
  | 'PunchIn'
  | 'PunchOut'
  | 'WorkingHours'
  | 'PunchInDevice'
  | 'PunchOutDevice'
  | 'PunchCount'
  | 'AttendanceStatus';

interface DateRangeAttendanceRow {
  employeeKey: string;
  employeeCode: string;
  employeeName: string;
  recordsByDate: Record<string, AttendanceSlotRef>;
}

@Component({
  selector: 'app-attendance-managment',
  standalone: true,
  imports: [CommonModule, FormsModule, ColumnResizeDirective, PageToolbarComponent],
  templateUrl: './attendance-managment.html',
  styleUrls: ['../../Application-Form/Application-Form.css', './attendance-managment.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AttendanceManagmentComponent implements OnInit {
  private readonly layout = inject(PayrollMasterLayoutService);
  private readonly attendanceService = inject(AttendanceManagementService);
  private readonly alertService = inject(AlertService);
  private readonly shellbarSearch = inject(ShellbarSearchService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly loadingPage = signal(false);
  readonly showViewDialog = signal(false);
  readonly selectedRecord = signal<AttendanceDailyRecord | null>(null);
  readonly selectedDateRangeRecords = signal<AttendanceDailyRecord[]>([]);
  readonly pageRecords = signal<AttendanceDailyRecord[]>([]);

  @ViewChild('tableScroll') private tableScroll?: ElementRef<HTMLDivElement>;

  private pageEnrichSub?: Subscription;
  private querySub?: Subscription;
  private pageEnrichGeneration = 0;
  private readonly enrichedEmployeeKeys = new Set<string>();

  Math = Math;
  searchText = '';
  selectedStatus = '';
  queryMode: AttendanceQueryMode = 'today';
  userId = '';
  selectedDate = formatIsoDate(new Date());
  fromDate = formatIsoDate(new Date());
  toDate = formatIsoDate(new Date());
  showDialog = false;
  activeTab: 'filter' = 'filter';
  sortColumn: AttendanceColumnKey | '' = 'AttendanceStatus';
  sortDirection: 'asc' | 'desc' = 'desc';
  currentPage = 1;
  pageSize = 25;
  readonly skeletonRows = [1, 2, 3, 4, 5, 6, 7, 8];
  readonly pageSizeOptions = [10, 25, 50, 100];
  readonly queryModeOptions: Array<{ value: AttendanceQueryMode; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'date', label: 'Specific Date' },
    { value: 'dateRange', label: 'Date Range' },
  ];

  readonly columns: Array<{ key: AttendanceColumnKey; label: string; visible: boolean }> = [
    { key: 'EmployeeId', label: 'User ID', visible: true },
    { key: 'EmployeeName', label: 'Employee Name', visible: true },
    { key: 'AttendanceDate', label: 'Date', visible: true },
    { key: 'PunchIn', label: 'Punch In', visible: true },
    { key: 'PunchOut', label: 'Punch Out', visible: true },
    { key: 'WorkingHours', label: 'Working Hours', visible: true },
    { key: 'PunchInDevice', label: 'In Device', visible: false },
    { key: 'PunchOutDevice', label: 'Out Device', visible: false },
    { key: 'PunchCount', label: 'Punches', visible: false },
    { key: 'AttendanceStatus', label: 'Status', visible: true },
  ];

  ngOnInit(): void {
    connectShellbarSearch(this.shellbarSearch, this.destroyRef, {
      getSearchText: () => this.searchText,
      setSearchText: (value) => {
        this.searchText = value;
      },
      onSearchChange: () => this.onSearchChange(),
    });

    this.destroyRef.onDestroy(() => {
      this.pageEnrichSub?.unsubscribe();
      this.querySub?.unsubscribe();
    });
    this.loadRecords();
  }

  get filteredSlotCount(): number {
    return this.filteredSlots.length;
  }

  get totalSlotCount(): number {
    return this.attendanceService.totalSlotCount();
  }

  get statusOptions(): string[] {
    return ['Present', 'Absent'];
  }

  get filteredSlots(): AttendanceSlotRef[] {
    let list = this.attendanceService.slots();

    if (this.selectedStatus) {
      list = list.filter((row) => row.status === this.selectedStatus);
    }

    if (this.searchText.trim()) {
      const search = this.searchText.toLowerCase();
      list = list.filter(
        (row) =>
          row.displayId.toLowerCase().includes(search) ||
          row.employeeName.toLowerCase().includes(search) ||
          row.date.toLowerCase().includes(search) ||
          formatPunchDate(row.date).toLowerCase().includes(search) ||
          formatPunchTime(row.punchIn).toLowerCase().includes(search) ||
          formatPunchTime(row.punchOut).toLowerCase().includes(search) ||
          row.status.toLowerCase().includes(search),
      );
    }

    if (this.sortColumn) {
      const direction = this.sortDirection === 'asc' ? 1 : -1;
      const key = this.sortColumn;
      list = [...list].sort((left, right) => {
        const leftValue = this.getSlotSortableValue(left, key);
        const rightValue = this.getSlotSortableValue(right, key);
        if (leftValue < rightValue) {
          return -1 * direction;
        }
        if (leftValue > rightValue) {
          return 1 * direction;
        }
        return 0;
      });
    }

    return list;
  }

  get visibleColumns(): Array<{ key: AttendanceColumnKey; label: string; visible: boolean }> {
    return this.columns.filter((column) => column.visible);
  }

  get visibleIdentityColumnCount(): number {
    return this.visibleColumns.filter((column) => this.getColumnGroup(column.key) === 'identity').length;
  }

  get visibleTimeColumnCount(): number {
    return this.visibleColumns.filter((column) => this.getColumnGroup(column.key) === 'time').length;
  }

  get visibleStatusColumnCount(): number {
    return this.visibleColumns.filter((column) => this.getColumnGroup(column.key) === 'status').length;
  }

  get totalPages(): number {
    const itemCount = this.queryMode === 'dateRange' ? this.dateRangeRows.length : this.filteredSlots.length;
    return Math.max(1, Math.ceil(itemCount / this.pageSize));
  }

  get dateRangeDates(): string[] {
    const [start, end] = this.fromDate <= this.toDate
      ? [this.fromDate, this.toDate]
      : [this.toDate, this.fromDate];
    const cursor = new Date(`${start}T00:00:00`);
    const lastDate = new Date(`${end}T00:00:00`);
    if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(lastDate.getTime())) {
      return [];
    }

    const dates: string[] = [];
    while (cursor.getTime() <= lastDate.getTime()) {
      dates.push(formatIsoDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  get dateRangeRows(): DateRangeAttendanceRow[] {
    const rowsByEmployee = new Map<string, DateRangeAttendanceRow>();
    for (const slot of this.filteredSlots) {
      let row = rowsByEmployee.get(slot.employeeKey);
      if (!row) {
        row = {
          employeeKey: slot.employeeKey,
          employeeCode: slot.displayId,
          employeeName: slot.employeeName,
          recordsByDate: {},
        };
        rowsByEmployee.set(slot.employeeKey, row);
      }
      row.recordsByDate[slot.date] = slot;
    }

    return [...rowsByEmployee.values()].sort((left, right) =>
      left.employeeCode.localeCompare(right.employeeCode, undefined, { numeric: true }),
    );
  }

  get paginatedDateRangeRows(): DateRangeAttendanceRow[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.dateRangeRows.slice(start, start + this.pageSize);
  }

  get paginationFooterItems(): PaginationFooterItem[] {
    return buildPaginationFooterItems(this.totalPages, this.currentPage);
  }

  trackPaginationItem(index: number, item: PaginationFooterItem): string {
    return paginationItemTrack(index, item);
  }

  isLastPageActive(): boolean {
    return this.currentPage === this.totalPages;
  }

  get paginatedSlots(): AttendanceSlotRef[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredSlots.slice(start, start + this.pageSize);
  }

  get paginatedList(): AttendanceDailyRecord[] {
    return this.pageRecords();
  }

  get selectedCount(): number {
    return this.pageRecords().filter((row) => row.selected).length;
  }

  get presentCount(): number {
    return this.filteredSlots.filter((row) => row.status === 'Present').length;
  }

  get absentCount(): number {
    return this.filteredSlots.filter((row) => row.status === 'Absent').length;
  }

  get totalPunchCount(): number {
    return this.filteredSlots.reduce((sum, row) => sum + row.punchCount, 0);
  }

  getColumnGroup(key: AttendanceColumnKey): 'identity' | 'time' | 'status' {
    switch (key) {
      case 'EmployeeId':
      case 'EmployeeName':
        return 'identity';
      case 'AttendanceDate':
      case 'PunchIn':
      case 'PunchOut':
      case 'WorkingHours':
      case 'PunchInDevice':
      case 'PunchOutDevice':
      case 'PunchCount':
        return 'time';
      default:
        return 'status';
    }
  }

  getColumnGroupClass(key: AttendanceColumnKey): string {
    return `attendance-col--${this.getColumnGroup(key)}`;
  }

  get currentQueryLabel(): string {
    const userSuffix = this.userId.trim() ? ` · User ${this.userId.trim()}` : '';
    switch (this.queryMode) {
      case 'today':
        return `Today${userSuffix}`;
      case 'date':
        return `${this.selectedDate}${userSuffix}`;
      case 'dateRange':
        return `${this.fromDate} to ${this.toDate}${userSuffix}`;
    }
  }

  hasActiveListFilters(): boolean {
    return !!this.selectedStatus || !!this.searchText.trim();
  }

  toggleSidebar(): void {
    this.layout.toggleSidebar();
  }

  onSearchChange(): void {
    this.currentPage = 1;
    this.renderCurrentPage();
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.renderCurrentPage();
  }

  onQueryModeChange(): void {
    if (this.queryMode === 'today') {
      this.loadRecords();
    } else if (this.queryMode === 'dateRange') {
      this.clearDateRangeResults();
    }
  }

  onDateRangeCriteriaChange(): void {
    if (this.queryMode === 'dateRange') {
      this.clearDateRangeResults();
    }
  }

  applyQuery(): void {
    this.currentPage = 1;
    if (this.queryMode === 'dateRange' && !this.userId.trim()) {
      this.clearDateRangeResults();
      return;
    }
    this.loadRecords();
  }

  openDialog(): void {
    this.showDialog = true;
  }

  closeDialog(): void {
    this.showDialog = false;
  }

  sortData(column: AttendanceColumnKey): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      this.renderCurrentPage();
      return;
    }

    this.sortColumn = column;
    this.sortDirection =
      column === 'AttendanceDate' || column === 'PunchIn' || column === 'PunchOut' ? 'desc' : 'asc';
    this.renderCurrentPage();
  }

  setPage(page: number): void {
    if (page < 1 || page > this.totalPages) {
      return;
    }
    this.currentPage = page;
    this.renderCurrentPage();
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.renderCurrentPage();
  }

  isAllSelected(): boolean {
    return this.paginatedList.length > 0 && this.paginatedList.every((row) => row.selected);
  }

  toggleAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    for (const row of this.paginatedList) {
      row.selected = checked;
    }
  }

  displayCellValue(row: AttendanceDailyRecord, key: AttendanceColumnKey): string | number {
    switch (key) {
      case 'AttendanceDate':
        return formatPunchDate(row.AttendanceDate);
      case 'PunchIn':
        return formatPunchTime(row.PunchIn);
      case 'PunchOut':
        return formatPunchTime(row.PunchOut);
      case 'WorkingHours':
        return formatWorkingDuration(row.WorkingMinutes);
      case 'AttendanceStatus':
        return row.AttendanceStatus;
      case 'PunchCount':
        return row.PunchCount;
      default:
        return String(row[key] ?? '—') || '—';
    }
  }

  formatAttendanceDate = formatPunchDate;
  formatAttendanceTime = formatPunchTime;
  formatWorkingDuration = formatWorkingDuration;

  formatDateRangeHeader(date: string): string {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return date;
    }
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][
      Number(match[2]) - 1
    ];
    return month ? `${Number(match[3])}/${month}/${match[1].slice(-2)}` : date;
  }

  getStatusClass(status: string): string {
    const normalized = status.trim().toLowerCase();
    if (normalized === 'present') {
      return 'attendance-status--present';
    }
    if (normalized === 'absent') {
      return 'attendance-status--absent';
    }
    return 'attendance-status--default';
  }

  getSkeletonClass(column: AttendanceColumnKey): string {
    switch (column) {
      case 'EmployeeName':
        return 'attendance-skeleton--name';
      case 'AttendanceStatus':
        return 'attendance-skeleton--status';
      case 'PunchIn':
      case 'PunchOut':
      case 'AttendanceDate':
        return 'attendance-skeleton--time';
      default:
        return 'attendance-skeleton--text';
    }
  }

  viewRecord(record: AttendanceDailyRecord): void {
    this.selectedDateRangeRecords.set([]);
    this.showViewDialog.set(true);
    this.selectedRecord.set(record);
  }

  viewDateRangeRecord(row: DateRangeAttendanceRow): void {
    const slots = this.attendanceService.slots().filter(
      (slot) => slot.employeeKey === row.employeeKey && this.dateRangeDates.includes(slot.date),
    );
    this.selectedRecord.set(null);
    this.selectedDateRangeRecords.set(this.attendanceService.materializeSlots(slots));
    this.showViewDialog.set(true);
  }

  getDateRangeDetailRecord(date: string): AttendanceDailyRecord | undefined {
    return this.selectedDateRangeRecords().find((record) => record.AttendanceDate === date);
  }

  closeViewDialog(): void {
    this.showViewDialog.set(false);
    this.selectedRecord.set(null);
    this.selectedDateRangeRecords.set([]);
  }

  private loadRecords(): void {
    if (this.queryMode === 'dateRange' && !this.userId.trim()) {
      this.clearDateRangeResults();
      return;
    }

    this.loading.set(true);
    this.pageEnrichSub?.unsubscribe();
    this.enrichedEmployeeKeys.clear();

    const query: AttendanceQuery = {
      mode: this.queryMode,
      userId: this.userId,
      date: this.selectedDate,
      fromDate: this.fromDate,
      toDate: this.toDate,
    };

    this.querySub?.unsubscribe();
    this.querySub = this.attendanceService.loadSession(query).subscribe({
      next: () => {
        this.loading.set(false);
        this.renderCurrentPage();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.pageRecords.set([]);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load attendance records from Pioneer Biometrics.'),
        );
      },
    });
  }

  private clearDateRangeResults(): void {
    this.querySub?.unsubscribe();
    this.loading.set(false);
    this.pageEnrichSub?.unsubscribe();
    this.pageEnrichGeneration += 1;
    this.loadingPage.set(false);
    this.enrichedEmployeeKeys.clear();
    this.attendanceService.clearSession();
    this.pageRecords.set([]);
    this.closeViewDialog();
    this.currentPage = 1;
    this.resetTableScroll();
  }

  private renderCurrentPage(): void {
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }

    const slots = this.paginatedSlots;
    this.pageRecords.set(this.attendanceService.materializeSlots(slots));
    this.enrichCurrentPageEmployees(slots);
    queueMicrotask(() => this.resetTableScroll());
  }

  private resetTableScroll(): void {
    const scrollHost = this.tableScroll?.nativeElement;
    if (!scrollHost) {
      return;
    }

    scrollHost.scrollTop = 0;
    scrollHost.scrollLeft = 0;
  }

  private enrichCurrentPageEmployees(slots: AttendanceSlotRef[]): void {
    this.pageEnrichSub?.unsubscribe();

    const employeeKeys = [...new Set(slots.map((slot) => slot.employeeKey))].filter(
      (key) => !this.enrichedEmployeeKeys.has(key),
    );
    if (employeeKeys.length === 0) {
      return;
    }

    const summaries = this.attendanceService.getEmployeeSummariesForKeys(employeeKeys);
    if (summaries.length === 0) {
      employeeKeys.forEach((key) => this.enrichedEmployeeKeys.add(key));
      return;
    }

    const generation = ++this.pageEnrichGeneration;
    this.loadingPage.set(true);
    employeeKeys.forEach((key) => this.enrichedEmployeeKeys.add(key));

    this.pageEnrichSub = this.attendanceService.enrichEmployeeSummaries(summaries).subscribe({
      next: () => {
        if (generation !== this.pageEnrichGeneration) {
          return;
        }
        this.loadingPage.set(false);
        this.pageRecords.set(this.attendanceService.materializeSlots(this.paginatedSlots));
      },
      error: () => {
        if (generation !== this.pageEnrichGeneration) {
          return;
        }
        this.loadingPage.set(false);
      },
    });
  }

  private getSlotSortableValue(row: AttendanceSlotRef, key: AttendanceColumnKey): string | number {
    switch (key) {
      case 'EmployeeId':
        return row.displayId.toLowerCase();
      case 'EmployeeName':
        return row.employeeName.toLowerCase();
      case 'AttendanceDate':
        return row.date;
      case 'PunchIn':
        return row.punchIn || '';
      case 'PunchOut':
        return row.punchOut || '';
      case 'WorkingHours':
        return row.workingMinutes;
      case 'PunchCount':
        return row.punchCount;
      case 'AttendanceStatus':
        return row.status;
      default:
        return '';
    }
  }
}
