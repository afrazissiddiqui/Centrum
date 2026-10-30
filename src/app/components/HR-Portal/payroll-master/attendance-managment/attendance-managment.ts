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
  AttendanceRawPunchUpdatePayload,
  AttendanceSlotRef,
  formatIsoDate,
  formatPunchDate,
  formatPunchTime,
  formatWorkingDuration,
  canonicalAttendanceKey,
} from '../../../../services/attendance-management.service';
import {
  LeaveApplicationRecord,
  LeaveApplicationService,
} from '../../../../services/leave-application.service';
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
  totalWorkingMinutes: number;
  workingDays: number;
  absentDays: number;
}

export function attendanceSearchUserId(searchText: string, queryMode: AttendanceQueryMode): string {
  const search = searchText.trim();
  return queryMode === 'dateRange' && /^(?:emp-)?\d+$/i.test(search) ? search : '';
}

export function calculateLeaveOverlapDays(
  requestFromDate: string | null | undefined,
  requestToDate: string | null | undefined,
  rangeFromDate: string | null | undefined,
  rangeToDate: string | null | undefined,
): number {
  const leaveStart = parseAttendanceDate(requestFromDate);
  const leaveEnd = parseAttendanceDate(requestToDate);
  const rangeStart = parseAttendanceDate(rangeFromDate);
  const rangeEnd = parseAttendanceDate(rangeToDate);

  if (!leaveStart || !leaveEnd || !rangeStart || !rangeEnd) {
    return 0;
  }

  const overlapStart = new Date(Math.max(leaveStart.getTime(), rangeStart.getTime()));
  const overlapEnd = new Date(Math.min(leaveEnd.getTime(), rangeEnd.getTime()));
  if (overlapEnd < overlapStart) {
    return 0;
  }

  return Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1;
}

export interface MatchedLeaveDates {
  paidDates: Set<string>;
  unpaidDates: Set<string>;
}

export function indexLeaveDatesByType(
  employees: Array<Pick<DateRangeAttendanceRow, 'employeeKey' | 'employeeCode'> & { absentDates: string[] }>,
  records: Array<Pick<LeaveApplicationRecord, 'EmployeeId' | 'FromDate' | 'ToDate' | 'LeaveType'>>,
  rangeFromDate: string,
  rangeToDate: string,
): Map<string, MatchedLeaveDates> {
  const employeeByCode = new Map(
    employees.map((employee) => [canonicalAttendanceKey(employee.employeeCode), employee]),
  );
  const rangeStart = parseAttendanceDate(rangeFromDate);
  const rangeEnd = parseAttendanceDate(rangeToDate);
  const intervalsByEmployeeAndType = new Map<string, Array<[number, number]>>();

  if (!rangeStart || !rangeEnd) {
    return new Map();
  }

  const rangeStartDay = Math.min(rangeStart.getTime(), rangeEnd.getTime()) / 86400000;
  const rangeEndDay = Math.max(rangeStart.getTime(), rangeEnd.getTime()) / 86400000;
  for (const record of records) {
    const employee = employeeByCode.get(canonicalAttendanceKey(record.EmployeeId));
    const leaveStart = parseAttendanceDate(record.FromDate);
    const leaveEnd = parseAttendanceDate(record.ToDate);
    if (!employee || !leaveStart || !leaveEnd) {
      continue;
    }

    const startDay = Math.max(rangeStartDay, Math.min(leaveStart.getTime(), leaveEnd.getTime()) / 86400000);
    const endDay = Math.min(rangeEndDay, Math.max(leaveStart.getTime(), leaveEnd.getTime()) / 86400000);
    if (startDay > endDay) {
      continue;
    }

    const leaveType = record.LeaveType.trim().toLowerCase() === 'unannounced leave' ? 'unpaid' : 'paid';
    const groupKey = `${employee.employeeKey}|${leaveType}`;
    const intervals = intervalsByEmployeeAndType.get(groupKey) ?? [];
    intervals.push([startDay, endDay]);
    intervalsByEmployeeAndType.set(groupKey, intervals);
  }

  const leaveDatesByEmployee = new Map<string, MatchedLeaveDates>();
  const dayMilliseconds = 86400000;
  for (const employee of employees) {
    const matchedDates: MatchedLeaveDates = { paidDates: new Set(), unpaidDates: new Set() };
    const absentDays = employee.absentDates
      .map((date) => ({ date, day: parseAttendanceDate(date)?.getTime() ?? Number.NaN }))
      .filter((entry) => Number.isFinite(entry.day))
      .sort((left, right) => left.day - right.day);

    for (const leaveType of ['paid', 'unpaid'] as const) {
      const intervals = intervalsByEmployeeAndType.get(`${employee.employeeKey}|${leaveType}`);
      if (!intervals?.length) {
        continue;
      }

      intervals.sort(([startA], [startB]) => startA - startB);
      let intervalIndex = 0;
      const matchedDatesForType = leaveType === 'paid' ? matchedDates.paidDates : matchedDates.unpaidDates;
      for (const absent of absentDays) {
        const day = absent.day / dayMilliseconds;
        while (intervalIndex < intervals.length && intervals[intervalIndex][1] < day) {
          intervalIndex += 1;
        }
        const interval = intervals[intervalIndex];
        if (interval && interval[0] <= day && day <= interval[1]) {
          matchedDatesForType.add(absent.date);
        }
      }
    }

    for (const date of matchedDates.unpaidDates) {
      matchedDates.paidDates.delete(date);
    }
    leaveDatesByEmployee.set(employee.employeeKey, matchedDates);
  }

  return leaveDatesByEmployee;
}

function toDateTimeLocalValue(value: string): string {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (match) {
    return `${match[1]}T${match[2]}`;
  }
  const date = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return date ? `${date[1]}T00:00` : '';
}

function toApiDateTimeValue(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?/);
  if (match) {
    return `${match[1]} ${match[2]}:${match[3] ?? '00'}`;
  }
  return trimmed;
}

function toTimeInputValue(value: string): string {
  return value.trim().match(/(?:T|\s)(\d{2}:\d{2})/)?.[1] ?? '';
}

function combineDateAndTime(dateTime: string, time: string): string {
  const date = dateTime.trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
  return date && time ? `${date} ${time}:00` : '';
}

function parseAttendanceDate(value: string | null | undefined): Date | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  private readonly leaveApplicationService = inject(LeaveApplicationService);
  private readonly alertService = inject(AlertService);
  private readonly shellbarSearch = inject(ShellbarSearchService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly loadingPage = signal(false);
  readonly loadingLeaveSummary = signal(false);
  readonly showViewDialog = signal(false);
  readonly selectedRecord = signal<AttendanceDailyRecord | null>(null);
  readonly selectedDateRangeRecords = signal<AttendanceDailyRecord[]>([]);
  readonly pageRecords = signal<AttendanceDailyRecord[]>([]);
  readonly updatingAttendance = signal(false);

  @ViewChild('tableScroll') private tableScroll?: ElementRef<HTMLDivElement>;

  private pageEnrichSub?: Subscription;
  private querySub?: Subscription;
  private leaveSummarySub?: Subscription;
  private attendanceSessionReady = false;
  private leaveSummaryRequested = false;
  private pageEnrichGeneration = 0;
  private selectedDateRangeEmployeeKey = '';
  private readonly enrichedEmployeeKeys = new Set<string>();
  private readonly dateRangePaidLeaveMap = new Map<string, number>();
  private readonly dateRangeUnpaidLeaveMap = new Map<string, number>();
  private readonly dateRangePaidLeaveDates = new Map<string, Set<string>>();
  private readonly dateRangeUnpaidLeaveDates = new Map<string, Set<string>>();
  private readonly failedLeaveEmployeeKeys = new Set<string>();
  private attendanceSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  private attendanceSearchUserId = '';
  attendanceUpdateRecordId: string | number | null = null;
  attendanceUpdateForm: AttendanceRawPunchUpdatePayload = this.emptyAttendanceUpdateForm();
  attendanceUpdatePunchIn = '';
  attendanceUpdatePunchOut = '';
  showAttendanceUpdateDialog = false;

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
      this.leaveSummarySub?.unsubscribe();
      if (this.attendanceSearchTimeout) {
        clearTimeout(this.attendanceSearchTimeout);
      }
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
          totalWorkingMinutes: 0,
          workingDays: 0,
          absentDays: 0,
        };
        rowsByEmployee.set(slot.employeeKey, row);
      }
      row.recordsByDate[slot.date] = slot;
      row.totalWorkingMinutes += slot.workingMinutes;
      if (slot.punchIn || slot.punchOut) {
        row.workingDays += 1;
      }
      if (slot.status === 'Absent') {
        row.absentDays += 1;
      }
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

    if (this.attendanceSearchTimeout) {
      clearTimeout(this.attendanceSearchTimeout);
      this.attendanceSearchTimeout = null;
    }

    const searchUserId = this.userId.trim()
      ? ''
      : attendanceSearchUserId(this.searchText, this.queryMode);
    if (searchUserId === this.attendanceSearchUserId) {
      return;
    }

    this.attendanceSearchTimeout = setTimeout(() => {
      this.attendanceSearchTimeout = null;
      if (!searchUserId && !this.attendanceSearchUserId) {
        return;
      }
      this.attendanceSearchUserId = searchUserId;
      this.currentPage = 1;
      this.loadRecords();
    }, 300);
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.renderCurrentPage();
  }

  onQueryModeChange(): void {
    if (this.attendanceSearchTimeout) {
      clearTimeout(this.attendanceSearchTimeout);
      this.attendanceSearchTimeout = null;
    }
    this.attendanceSearchUserId = '';
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
        return row.WorkingHours || formatWorkingDuration(row.WorkingMinutes);
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
    if (normalized === 'paid leave') {
      return 'attendance-status--leave';
    }
    if (normalized === 'unpaid leave') {
      return 'attendance-status--unpaid-leave';
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

  canUpdateAttendance(record: AttendanceDailyRecord | null | undefined): boolean {
    return !!record?.CardNo ||
      !!record?.Punches.some((punch) => punch.RecordId !== undefined && punch.RecordId !== null);
  }

  openAttendanceUpdate(record: AttendanceDailyRecord): void {
    const sourcePunch = record.Punches.find(
      (punch) => punch.RecordId !== undefined && punch.RecordId !== null,
    );
    const cardNo = record.CardNo || sourcePunch?.EmployeeId;
    if (!cardNo) {
      void this.alertService.warning('Cannot Update Attendance', 'The employee card number is missing.');
      return;
    }

    this.attendanceUpdateRecordId = cardNo;
    const attendanceDateTime = toApiDateTimeValue(
      toDateTimeLocalValue(record.PunchOut || record.PunchIn || record.AttendanceDate),
    );
    this.attendanceUpdateForm = {
      card_no: cardNo,
      punch_in: toApiDateTimeValue(record.PunchIn),
      punch_out: toApiDateTimeValue(record.PunchOut),
      hours_worked: record.WorkingHours || formatWorkingDuration(record.WorkingMinutes),
      machine_id: sourcePunch?.DeviceNo ?? record.PunchInDevice ?? '',
      status: sourcePunch?.Status ?? '',
      attendance_date: attendanceDateTime,
    };
    this.attendanceUpdatePunchIn = toTimeInputValue(record.PunchIn);
    this.attendanceUpdatePunchOut = toTimeInputValue(record.PunchOut);
    this.showAttendanceUpdateDialog = true;
  }

  closeAttendanceUpdate(): void {
    if (this.updatingAttendance()) {
      return;
    }
    this.showAttendanceUpdateDialog = false;
    this.attendanceUpdateRecordId = null;
    this.attendanceUpdatePunchIn = '';
    this.attendanceUpdatePunchOut = '';
  }

  closeAttendanceUpdateFromBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeAttendanceUpdate();
    }
  }

  isAttendanceUpdateValid(): boolean {
    return this.attendanceUpdateRecordId !== null &&
      !!this.attendanceUpdateForm.card_no.trim() &&
      !!this.attendanceUpdateForm.attendance_date.trim() &&
      (!!this.attendanceUpdatePunchIn || !!this.attendanceUpdatePunchOut);
  }

  saveAttendanceUpdate(): void {
    const id = this.attendanceUpdateRecordId;
    if (id === null || !this.isAttendanceUpdateValid()) {
      void this.alertService.validation('Enter a punch-in or punch-out time to update attendance.');
      return;
    }

    const payload: AttendanceRawPunchUpdatePayload = {
      ...this.attendanceUpdateForm,
      punch_in: combineDateAndTime(this.attendanceUpdateForm.attendance_date, this.attendanceUpdatePunchIn),
      punch_out: combineDateAndTime(this.attendanceUpdateForm.attendance_date, this.attendanceUpdatePunchOut),
    };
    this.updatingAttendance.set(true);
    this.attendanceService.updateAttendanceRecord(id, payload).subscribe({
      next: () => {
        this.updatingAttendance.set(false);
        this.showAttendanceUpdateDialog = false;
        this.attendanceUpdateRecordId = null;
        this.attendanceUpdatePunchIn = '';
        this.attendanceUpdatePunchOut = '';
        this.closeViewDialog();
        this.alertService.success('Attendance Updated', 'The attendance record was updated successfully.');
        this.loadRecords();
      },
      error: (error: unknown) => {
        this.updatingAttendance.set(false);
        void this.alertService.error(
          'Update Failed',
          formatApiErrorMessage(error, 'Failed to update the attendance record.'),
        );
      },
    });
  }

  viewDateRangeRecord(row: DateRangeAttendanceRow): void {
    const slots = this.attendanceService.slots().filter(
      (slot) => slot.employeeKey === row.employeeKey && this.dateRangeDates.includes(slot.date),
    );
    this.selectedRecord.set(null);
    this.selectedDateRangeEmployeeKey = row.employeeKey;
    this.selectedDateRangeRecords.set(this.attendanceService.materializeSlots(slots));
    this.showViewDialog.set(true);
  }

  getDateRangeDetailRecord(date: string): AttendanceDailyRecord | undefined {
    return this.selectedDateRangeRecords().find((record) => record.AttendanceDate === date);
  }

  getDateRangeDetailStatus(date: string): string {
    const record = this.getDateRangeDetailRecord(date);
    return record?.AttendanceStatus === 'Absent'
      ? this.getDateRangeLeaveStatus(this.selectedDateRangeEmployeeKey, date) ?? record.AttendanceStatus
      : record?.AttendanceStatus ?? '—';
  }

  get selectedDateRangeTotalWorkingMinutes(): number {
    return this.selectedDateRangeRecords().reduce((total, record) => total + record.WorkingMinutes, 0);
  }

  get selectedDateRangeWorkingDays(): number {
    return this.selectedDateRangeRecords().filter((record) => record.PunchIn || record.PunchOut).length;
  }

  getDateRangePaidLeaveCount(employeeKey: string): number | string {
    return this.failedLeaveEmployeeKeys.has(employeeKey) ? '—' : this.dateRangePaidLeaveMap.get(employeeKey) ?? 0;
  }

  getDateRangeUnpaidLeaveCount(employeeKey: string): number | string {
    return this.failedLeaveEmployeeKeys.has(employeeKey) ? '—' : this.dateRangeUnpaidLeaveMap.get(employeeKey) ?? 0;
  }

  isDatePaidLeave(employeeKey: string, date: string): boolean {
    return this.dateRangePaidLeaveDates.get(employeeKey)?.has(date) ?? false;
  }

  getDateRangeLeaveStatus(employeeKey: string, date: string): 'Paid Leave' | 'Unpaid Leave' | null {
    if (this.dateRangeUnpaidLeaveDates.get(employeeKey)?.has(date)) {
      return 'Unpaid Leave';
    }
    return this.isDatePaidLeave(employeeKey, date) ? 'Paid Leave' : null;
  }

  closeViewDialog(): void {
    this.showViewDialog.set(false);
    this.selectedRecord.set(null);
    this.selectedDateRangeRecords.set([]);
    this.selectedDateRangeEmployeeKey = '';
  }

  private emptyAttendanceUpdateForm(): AttendanceRawPunchUpdatePayload {
    return {
      card_no: '',
      punch_in: '',
      punch_out: '',
      hours_worked: '',
      machine_id: '',
      status: '',
      attendance_date: '',
    };
  }

  private loadRecords(): void {
    this.loading.set(true);
    this.attendanceSessionReady = false;
    this.leaveSummarySub?.unsubscribe();
    this.loadingLeaveSummary.set(false);
    this.leaveSummaryRequested = false;
    this.dateRangePaidLeaveMap.clear();
    this.dateRangeUnpaidLeaveMap.clear();
    this.dateRangePaidLeaveDates.clear();
    this.dateRangeUnpaidLeaveDates.clear();
    this.failedLeaveEmployeeKeys.clear();
    if (this.attendanceSearchTimeout) {
      clearTimeout(this.attendanceSearchTimeout);
      this.attendanceSearchTimeout = null;
    }
    this.pageEnrichSub?.unsubscribe();
    this.enrichedEmployeeKeys.clear();

    const searchUserId = this.userId.trim()
      ? ''
      : attendanceSearchUserId(this.searchText, this.queryMode);
    this.attendanceSearchUserId = searchUserId;
    const query: AttendanceQuery = {
      mode: this.queryMode,
      userId: this.userId.trim() || searchUserId,
      date: this.selectedDate,
      fromDate: this.fromDate,
      toDate: this.toDate,
    };

    this.querySub?.unsubscribe();
    this.querySub = this.attendanceService.loadSession(query).subscribe({
      next: () => {
        this.loading.set(false);
        this.attendanceSessionReady = true;
        this.renderCurrentPage();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.dateRangePaidLeaveMap.clear();
        this.dateRangeUnpaidLeaveMap.clear();
        this.dateRangePaidLeaveDates.clear();
        this.dateRangeUnpaidLeaveDates.clear();
        this.leaveSummaryRequested = false;
        this.failedLeaveEmployeeKeys.clear();
        this.pageRecords.set([]);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load attendance records.'),
        );
      },
    });
  }

  private clearDateRangeResults(): void {
    this.querySub?.unsubscribe();
    this.leaveSummarySub?.unsubscribe();
    this.attendanceSessionReady = false;
    this.loading.set(false);
    this.loadingLeaveSummary.set(false);
    this.pageEnrichSub?.unsubscribe();
    this.pageEnrichGeneration += 1;
    this.loadingPage.set(false);
    this.enrichedEmployeeKeys.clear();
    this.dateRangePaidLeaveMap.clear();
    this.dateRangeUnpaidLeaveMap.clear();
    this.dateRangePaidLeaveDates.clear();
    this.dateRangeUnpaidLeaveDates.clear();
    this.leaveSummaryRequested = false;
    this.failedLeaveEmployeeKeys.clear();
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
    if (this.attendanceSessionReady) {
      this.refreshDateRangeLeaveSummary();
    }
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

  private refreshDateRangeLeaveSummary(): void {
    const employees = this.dateRangeRows;
    if (this.queryMode !== 'dateRange' || !employees.length || this.leaveSummaryRequested) {
      return;
    }

    this.leaveSummaryRequested = true;
    this.loadingLeaveSummary.set(true);
    const pendingRows = employees.filter((row) => row.absentDays > 0);
    for (const row of employees) {
      if (row.absentDays === 0) {
        this.dateRangePaidLeaveMap.set(row.employeeKey, 0);
        this.dateRangeUnpaidLeaveMap.set(row.employeeKey, 0);
        this.dateRangePaidLeaveDates.set(row.employeeKey, new Set());
        this.dateRangeUnpaidLeaveDates.set(row.employeeKey, new Set());
      }
    }

    if (pendingRows.length === 0) {
      this.loadingLeaveSummary.set(false);
      return;
    }

    const employeesWithAbsences = pendingRows.map((row) => ({
      employeeKey: row.employeeKey,
      employeeCode: row.employeeCode,
      absentDates: Object.values(row.recordsByDate)
        .filter((record) => record.status === 'Absent')
        .map((record) => record.date),
    }));

    this.leaveSummarySub = this.leaveApplicationService
      .fetchLeaveApplicationsForDateRange(this.fromDate, this.toDate)
      .subscribe({
      next: (records) => {
        const leaveDatesByEmployee = indexLeaveDatesByType(
          employeesWithAbsences,
          records,
          this.fromDate,
          this.toDate,
        );
        for (const row of pendingRows) {
          const leaveDates = leaveDatesByEmployee.get(row.employeeKey) ?? {
            paidDates: new Set<string>(),
            unpaidDates: new Set<string>(),
          };
          this.dateRangePaidLeaveMap.set(row.employeeKey, leaveDates.paidDates.size);
          this.dateRangeUnpaidLeaveMap.set(row.employeeKey, leaveDates.unpaidDates.size);
          this.dateRangePaidLeaveDates.set(row.employeeKey, leaveDates.paidDates);
          this.dateRangeUnpaidLeaveDates.set(row.employeeKey, leaveDates.unpaidDates);
        }
        this.loadingLeaveSummary.set(false);
      },
      error: (error: unknown) => {
        pendingRows.forEach((row) => this.failedLeaveEmployeeKeys.add(row.employeeKey));
        this.loadingLeaveSummary.set(false);
        void this.alertService.error(
          'Leave Summary Failed',
          `Leave summaries for ${pendingRows.length} employee(s) could not be loaded. ${formatApiErrorMessage(
            error,
            'The leave service could not load records for the selected date range.',
          )}`,
        );
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
