import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { ApplicationFormRecord, ApplicationFormService, canonicalizeEmployeeCodeValue, EmployeeRosterAddPayload, EmployeeRosterListRecord } from '../../../services/application-form.service';
import { AlertService } from '../../../services/alert.service';
import { formatApiErrorMessage } from '../../../utils/api-error.util';
import { PageToolbarComponent } from '../../page-toolbar/page-toolbar';
import { GatePassDepartmentService } from '../../gate-pass/gate-pass-department.service';
import { WorkstationRecord, WorkstationService } from '../../../services/workstation.service';
import { glAccountBranchLabel, resolveBranchCode } from '../gl-account-determination/gl-account-branch.options';

type ShiftCode = string;
type MonthHalf = 'First Half' | 'Second Half';
const ROSTER_BRANCH_OPTIONS = ['AHCP_Peshawar', 'AHCP_HO', 'AHCP_Faisalabad'];

interface RosterDay {
  date: number;
  weekday: string;
  isToday: boolean;
  isHoliday: boolean;
}

interface BranchHoliday {
  date: number;
  weekday: string;
  label: string;
}

interface RosterEmployee extends ApplicationFormRecord {
  hub: string;
  role: string;
  shifts: ShiftCode[];
}

export function findUnassignedEmployees(
  employees: ApplicationFormRecord[],
  roster: EmployeeRosterListRecord[],
): ApplicationFormRecord[] {
  const assignedEmployeeCodes = new Set<string>();
  for (const rosterEntry of roster) {
    const employeeCode = normalizeEmployeeCodeForRoster(rosterEntry.employee_id);
    if (employeeCode) {
      assignedEmployeeCodes.add(employeeCode);
    }
  }

  const seenEmployeeCodes = new Set<string>();
  return employees.filter((employee) => {
    const employeeCode = normalizeEmployeeCodeForRoster(employee.EmployeeCode);
    const rawApplicability = (employee as ApplicationFormRecord & { EmployeeShiftApplicable?: unknown }).EmployeeShiftApplicable;
    const explicitlyApplicable = rawApplicability === true || ['true', 'yes', '1'].includes(String(rawApplicability ?? '').trim().toLowerCase())
      ? true
      : rawApplicability === false || ['false', 'no', '0'].includes(String(rawApplicability ?? '').trim().toLowerCase())
        ? false
        : undefined;
    const applicable = explicitlyApplicable ?? employee.detail?.hrSettings.attendanceShiftManagement.trim().toLowerCase() === 'yes';
    if (!applicable || !employeeCode || assignedEmployeeCodes.has(employeeCode) || seenEmployeeCodes.has(employeeCode)) {
      return false;
    }
    seenEmployeeCodes.add(employeeCode);
    return true;
  });
}

function normalizeEmployeeCodeForRoster(value: string | null | undefined): string {
  const normalized = canonicalizeEmployeeCodeValue(String(value ?? '')).trim().toLowerCase();
  const numericCode = normalized.match(/^(?:emp[-\s]?)?(\d+)$/)?.[1];
  return numericCode ? `emp-${numericCode.padStart(8, '0')}` : normalized;
}

export function rosterBranchName(value: string | null | undefined): string {
  const branch = String(value ?? '').trim();
  if (!branch) {
    return '';
  }
  if (branch.toLowerCase() === 'lahore ho') {
    return 'AHCP_HO';
  }
  return glAccountBranchLabel(resolveBranchCode(branch));
}

export function matchesRosterBranch(employeeBranch: string, selectedBranch: string): boolean {
  return selectedBranch === 'All Branches' ||
    rosterBranchName(employeeBranch).toLowerCase() === rosterBranchName(selectedBranch).toLowerCase();
}

const NO_DEPARTMENT_FILTER = '__no_department__';

export function filterUnassignedEmployees(
  employees: ApplicationFormRecord[],
  searchText: string,
  departmentFilter: string,
): ApplicationFormRecord[] {
  const query = searchText.trim().toLowerCase();
  return employees.filter((employee) => {
    const department = String(employee.Department ?? '').trim();
    const matchesDepartment = !departmentFilter ||
      (departmentFilter === NO_DEPARTMENT_FILTER
        ? !department
        : department.toLowerCase() === departmentFilter.toLowerCase());
    const matchesSearch = !query ||
      [employee.EmployeeName, employee.EmployeeCode, employee.Designation, department]
        .some((value) => String(value ?? '').toLowerCase().includes(query));
    return matchesDepartment && matchesSearch;
  });
}

function isAssignedRosterShift(shift: string): boolean {
  const normalized = shift.trim().toLowerCase();
  return normalized !== '' && normalized !== '+' && normalized !== 'null' && normalized !== 'undefined';
}

export function rosterDayIndexForMonth(shiftDate: string, monthLabel: string): number | null {
  const [monthName, yearText] = monthLabel.split(' ');
  const targetYear = Number(yearText);
  const targetMonth = new Date(`${monthName} 1, ${targetYear}`).getMonth();
  const isoDate = shiftDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  const date = isoDate
    ? new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
    : new Date(shiftDate);

  if (Number.isNaN(date.getTime()) || date.getFullYear() !== targetYear || date.getMonth() !== targetMonth) {
    return null;
  }

  return date.getDate() - 1;
}

export function rosterShiftsForEmployeeMonth(
  records: EmployeeRosterListRecord[],
  employeeCode: string,
  monthLabel: string,
): ShiftCode[] {
  const [monthName, yearText] = monthLabel.split(' ');
  const year = Number(yearText);
  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const shifts = Array.from({ length: daysInMonth }, () => '+');
  const normalizedEmployeeCode = normalizeEmployeeCodeForRoster(employeeCode);
  const latestRecordByDay = new Map<number, EmployeeRosterListRecord>();

  for (const record of records) {
    if (
      normalizeEmployeeCodeForRoster(record.employee_id) !== normalizedEmployeeCode ||
      !isAssignedRosterShift(record.shift)
    ) {
      continue;
    }
    const dayIndex = rosterDayIndexForMonth(record.shift_date, monthLabel);
    if (dayIndex === null) {
      continue;
    }
    const current = latestRecordByDay.get(dayIndex);
    if (!current || compareRosterRecordVersion(current, record) <= 0) {
      latestRecordByDay.set(dayIndex, record);
    }
  }

  for (const [dayIndex, record] of latestRecordByDay) {
    shifts[dayIndex] = record.shift;
  }

  return shifts;
}

function compareRosterRecordVersion(
  left: EmployeeRosterListRecord,
  right: EmployeeRosterListRecord,
): number {
  const leftTimestamp = Date.parse(left.updated_at || left.created_at || '');
  const rightTimestamp = Date.parse(right.updated_at || right.created_at || '');
  if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp) && leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }

  const leftId = Number(left.id);
  const rightId = Number(right.id);
  if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
    return leftId - rightId;
  }

  return 0;
}

export function rosterPeriodForDate(date: Date): { monthLabel: string; monthHalf: MonthHalf } {
  return {
    monthLabel: date.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    monthHalf: date.getDate() <= 15 ? 'First Half' : 'Second Half',
  };
}

export function rosterShiftOptions(workstations: WorkstationRecord[]) {
  const options = workstations
    .map((workstation) => {
      const code = rosterWorkstationCode(workstation, workstations);
      const description = workstation.description.trim() || workstation.name.trim() || workstation.shift.trim();
      return {
        code,
        title: `${description} (${code})`,
        className: 'dynamic',
      };
    })
    .filter((option) => option.code);
  const uniqueOptions = options.filter(
    (option, index, allOptions) => allOptions.findIndex((item) => item.code.toLowerCase() === option.code.toLowerCase()) === index,
  );

  return [
    ...uniqueOptions,
    { code: 'HOL', title: 'Holiday', className: 'holiday' },
    { code: 'OFF', title: 'Scheduled Day Off', className: 'off' },
  ];
}

function rosterWorkstationCode(
  workstation: WorkstationRecord,
  workstations: WorkstationRecord[],
): string {
  const baseCode = workstation.code.trim() || String(workstation.id).trim() || workstation.shift.trim();
  const duplicateCode = workstations.some((item) =>
    item !== workstation &&
    (item.code.trim() || String(item.id).trim() || item.shift.trim()).toLowerCase() === baseCode.toLowerCase(),
  );
  return duplicateCode ? String(workstation.id).trim() || baseCode : baseCode;
}

export function rosterShiftInitial(shift: ShiftCode, workstations: WorkstationRecord[]): string {
  const normalizedShift = shift.trim();
  if (!normalizedShift || normalizedShift === '+' || ['OFF', 'HOL', 'L'].includes(normalizedShift.toUpperCase())) {
    return normalizedShift;
  }

  const lowerShift = normalizedShift.toLowerCase();
  const workstationIndex = workstations.findIndex((item) =>
    [item.code, String(item.id), item.shift, item.name, item.description]
      .some((value) => value.trim().toLowerCase() === lowerShift),
  );
  return workstationIndex >= 0
    ? String(workstationIndex + 1)
    : normalizedShift;
}

@Component({
  selector: 'app-employee-roster',
  imports: [CommonModule, FormsModule, PageToolbarComponent],
  templateUrl: './employee-roster.html',
  styleUrl: './employee-roster.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class EmployeeRosterComponent implements OnInit {
  private readonly employeeService = inject(ApplicationFormService);
  private readonly alertService = inject(AlertService);
  private readonly departmentService = inject(GatePassDepartmentService);
  private readonly initialCalendarPeriod = rosterPeriodForDate(new Date());
  readonly workstationService = inject(WorkstationService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly employees = signal<RosterEmployee[]>([]);
  readonly unassignedEmployees = signal<ApplicationFormRecord[]>([]);
  readonly unassignedSearchText = signal('');
  readonly unassignedDepartmentFilter = signal('');
  readonly unassignedCalendarEmployee = signal<RosterEmployee | null>(null);
  readonly unassignedSelectedShift = signal<ShiftCode | null>(null);
  readonly editingRosterCalendar = signal(false);
  private calendarOriginalShifts: ShiftCode[] = [];
  private rosterRecords: EmployeeRosterListRecord[] = [];
  private originalRosterShifts = new Map<string, string[]>();
  readonly searchText = signal('');
  readonly selectedHub = signal('All Branches');
  readonly rosterBranchOptions = ['All Branches', ...ROSTER_BRANCH_OPTIONS];
  readonly selectedDepartment = signal('All Departments');
  readonly selectedDepartmentCode = signal('');
  readonly departmentOptions = this.departmentService.departments;
  readonly monthLabel = signal(this.initialCalendarPeriod.monthLabel);
  readonly selectedMonthHalf = signal<MonthHalf>(this.initialCalendarPeriod.monthHalf);
  readonly selectedCell = signal<{ employeeCode: string; day: number } | null>(null);
  readonly shiftDialog = signal<{ employee: RosterEmployee; dayIndex: number; dayDate: number; shift: ShiftCode } | null>(null);
  readonly shiftDialogPosition = signal({ top: 0, left: 0 });
  readonly shiftDialogDragging = signal(false);
  private shiftDialogDrag: { pointerId: number; startX: number; startY: number; startTop: number; startLeft: number } | null = null;
  readonly hasChanges = signal(false);
  readonly selectedEmployees = signal(new Set<string>());
  readonly conflictsVisible = signal(true);
  readonly workstationLoading = signal(false);
  readonly workstationLegendOpen = signal(false);
  readonly branchHolidaysOpen = signal(false);
  readonly unassignedDialogOpen = signal(false);
  readonly shiftOptions = computed(() => rosterShiftOptions(this.workstationService.workstations()));
  readonly unassignedDepartmentOptions = computed(() => {
    const departments = [...new Set(
      this.unassignedEmployees()
        .map((employee) => String(employee.Department ?? '').trim())
        .filter(Boolean),
    )].sort((left, right) => left.localeCompare(right));
    const options = [
      { value: '', label: 'All Departments' },
      ...departments.map((department) => ({ value: department, label: department })),
    ];
    if (this.unassignedEmployees().some((employee) => !String(employee.Department ?? '').trim())) {
      options.push({ value: NO_DEPARTMENT_FILTER, label: 'No department' });
    }
    return options;
  });

  readonly visibleDays = computed<RosterDay[]>(() => {
    const [monthName, yearText] = this.monthLabel().split(' ');
    const year = Number(yearText);
    const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const firstHalf = this.selectedMonthHalf() === 'First Half';
    const today = new Date();

    return Array.from({ length: daysInMonth }, (_, index) => {
      const date = index + 1;
      const day = new Date(year, monthIndex, date);
      return {
        date,
        weekday: day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        isToday:
          today.getFullYear() === year &&
          today.getMonth() === monthIndex &&
          today.getDate() === date,
        isHoliday: day.getDay() === 0 || day.getDay() === 6,
      };
    }).filter((day) => (firstHalf ? day.date <= 15 : day.date > 15));
  });

  readonly fullMonthDays = computed<RosterDay[]>(() => {
    const [monthName, yearText] = this.monthLabel().split(' ');
    const year = Number(yearText);
    const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const today = new Date();

    return Array.from({ length: daysInMonth }, (_, index) => {
      const date = index + 1;
      const day = new Date(year, monthIndex, date);
      return {
        date,
        weekday: day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        isToday:
          today.getFullYear() === year &&
          today.getMonth() === monthIndex &&
          today.getDate() === date,
        isHoliday: day.getDay() === 0 || day.getDay() === 6,
      };
    });
  });

  readonly branchHolidays = computed<BranchHoliday[]>(() => {
    const [monthName, yearText] = this.monthLabel().split(' ');
    const year = Number(yearText);
    const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    return Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(year, monthIndex, index + 1);
      const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
      return {
        date: index + 1,
        weekday,
        label: weekday === 'Sunday' ? 'Weekly holiday' : 'Weekend holiday',
      };
    }).filter((holiday) => holiday.weekday === 'Saturday' || holiday.weekday === 'Sunday');
  });

  readonly filteredEmployees = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const department = this.selectedDepartment();
    return this.employees().filter((employee) => {
      const matchesBranch = matchesRosterBranch(employee.hub, this.selectedHub());
      const matchesDepartment = department === 'All Departments' || employee.Department === department;
      const matchesSearch = !query || [employee.EmployeeName, employee.EmployeeCode, employee.Designation, employee.Department]
        .join(' ')
        .toLowerCase()
        .includes(query);
      return matchesBranch && matchesDepartment && matchesSearch;
    });
  });

  readonly filteredUnassignedEmployees = computed(() => {
    return filterUnassignedEmployees(
      this.unassignedEmployees(),
      this.unassignedSearchText(),
      this.unassignedDepartmentFilter(),
    );
  });

  readonly totalEmployees = computed(() => this.employees().length);
  readonly morningCount = computed(() => this.employees().filter((employee) => employee.shifts.some((shift) => this.shiftName(shift) === 'Morning')).length);
  readonly eveningCount = computed(() => this.employees().filter((employee) => employee.shifts.some((shift) => this.shiftName(shift) === 'Evening')).length);
  readonly nightCount = computed(() => this.employees().filter((employee) => employee.shifts.some((shift) => this.shiftName(shift) === 'Night')).length);
  readonly unassignedCount = computed(() => this.unassignedEmployees().length);
  readonly activeCount = computed(() => this.filteredEmployees().length);

  readonly allVisibleSelected = computed(() => {
    const visible = this.filteredEmployees();
    const selected = this.selectedEmployees();
    return visible.length > 0 && visible.every((employee) => selected.has(employee.EmployeeCode));
  });

  ngOnInit(): void {
    this.departmentService.ensureLoaded().subscribe();
    this.loadWorkstations();
    this.loadEmployees();
  }

  private loadWorkstations(): void {
    if (this.workstationLoading()) {
      return;
    }
    this.workstationLoading.set(true);
    this.workstationService.fetchWorkstations().pipe(finalize(() => this.workstationLoading.set(false))).subscribe({
      error: (error: unknown) => {
        this.alertService.error('Shift Load Failed', formatApiErrorMessage(error, 'Could not load workstation shifts.'));
      },
    });
  }

  onDepartmentChange(departmentName: string): void {
    this.selectedDepartment.set(departmentName);
    const department = this.departmentOptions().find((item) => item.name === departmentName);
    this.selectedDepartmentCode.set(department?.id ?? '');
  }

  openWorkstationLegend(): void {
    this.workstationLegendOpen.set(true);
  }

  closeWorkstationLegend(): void {
    this.workstationLegendOpen.set(false);
  }

  openBranchHolidays(): void {
    this.branchHolidaysOpen.set(true);
  }

  closeBranchHolidays(): void {
    this.branchHolidaysOpen.set(false);
  }

  loadEmployees(): void {
    this.loading.set(true);
    forkJoin({
      roster: this.employeeService.fetchEmployeeRosterList(),
      profiles: this.employeeService.fetchEmployeeProfiles(),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ roster, profiles }: { roster: EmployeeRosterListRecord[]; profiles: ApplicationFormRecord[] }) => {
          this.rosterRecords = roster;
          const rosterEmployees = this.toRosterEmployees(roster, profiles);
          this.employees.set(rosterEmployees);
          this.originalRosterShifts = new Map(
            rosterEmployees.map((employee) => [employee.EmployeeCode, [...employee.shifts]]),
          );
          this.unassignedEmployees.set(findUnassignedEmployees(profiles, roster));
        },
        error: (error) => {
          this.alertService.error(
            'Roster Load Failed',
            formatApiErrorMessage(error, 'Could not load roster employees and shifts.'),
          );
        },
      });
  }

  openUnassignedDialog(): void {
    this.unassignedSearchText.set('');
    this.unassignedDepartmentFilter.set('');
    this.unassignedDialogOpen.set(true);
  }

  closeUnassignedDialog(): void {
    this.unassignedDialogOpen.set(false);
    this.unassignedSearchText.set('');
    this.unassignedDepartmentFilter.set('');
  }

  openUnassignedCalendar(employee: ApplicationFormRecord): void {
    this.closeUnassignedDialog();
    this.loadWorkstations();
    this.editingRosterCalendar.set(false);
    this.calendarOriginalShifts = [];
    this.unassignedCalendarEmployee.set({
      ...this.toRosterEmployee(employee, 0),
      hub: rosterBranchName(employee.detail?.personalInfo.branchLocation || employee.detail?.requisition.location) || this.selectedHub(),
      shifts: this.fullMonthDays().map(() => '+'),
    });
    this.unassignedSelectedShift.set(null);
  }

  openEmployeeCalendar(employee: RosterEmployee): void {
    this.loadWorkstations();
    const shifts = this.rosterShiftsForMonth(employee.EmployeeCode);
    this.editingRosterCalendar.set(true);
    this.calendarOriginalShifts = [...shifts];
    this.unassignedCalendarEmployee.set({ ...employee, shifts });
    this.unassignedSelectedShift.set(null);
  }

  closeUnassignedCalendar(): void {
    this.unassignedCalendarEmployee.set(null);
    this.unassignedSelectedShift.set(null);
    this.editingRosterCalendar.set(false);
    this.calendarOriginalShifts = [];
  }

  selectUnassignedShift(shift: ShiftCode): void {
    this.unassignedSelectedShift.set(shift);
  }

  assignUnassignedDay(dayIndex: number): void {
    const day = this.fullMonthDays()[dayIndex];
    if (!day) {
      return;
    }
    const shift = this.unassignedSelectedShift();
    if (!shift) {
      this.alertService.validation('Select a shift first.');
      return;
    }
    this.unassignedCalendarEmployee.update((employee) => {
      if (!employee) {
        return employee;
      }
      const shifts = [...employee.shifts];
      shifts[dayIndex] = shift;
      return { ...employee, shifts };
    });
  }

  async submitUnassignedCalendar(): Promise<void> {
    const employee = this.unassignedCalendarEmployee();
    const days = this.fullMonthDays()
      .map((day, index) => ({ day, index }));
    if (this.editingRosterCalendar()) {
      await this.submitExistingEmployeeCalendar(employee, days);
      return;
    }

    if (!employee) {
      return;
    }

    const assignedDays = days.filter(({ index }) =>
      this.isAssignedShift(this.shiftForFullMonth(employee, index)),
    );
    if (!assignedDays.length) {
      this.alertService.validation('Assign at least one shift before submitting.');
      return;
    }
    const unassignedCount = days.length - assignedDays.length;
    if (
      unassignedCount > 0 &&
      !(await this.alertService.confirmWarning(
        'Unassigned shifts remain',
        `${unassignedCount} day(s) have no shift. Continue to post the assigned shifts and leave the other days unassigned?`,
        'Post assigned shifts',
      ))
    ) {
      return;
    }

    const payload: EmployeeRosterAddPayload = {
      data: assignedDays.map(({ day, index }) => ({
        employee_id: this.toApiEmployeeId(employee.EmployeeCode),
        shift_date: this.rosterDate(day.date),
        shift: this.toApiShift(this.shiftForFullMonth(employee, index)),
        role: employee.role,
        hub: employee.hub,
        note: null,
      })),
    };

    this.saving.set(true);
    this.employeeService
      .addEmployeeRoster(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.employees.update((employees) => [
            ...employees.filter((item) => item.EmployeeCode !== employee.EmployeeCode),
            employee,
          ]);
          this.syncRosterRecords(payload.data);
          this.originalRosterShifts.set(employee.EmployeeCode, [...employee.shifts]);
          this.unassignedEmployees.update((employees) =>
            employees.filter((item) => item.EmployeeCode !== employee.EmployeeCode),
          );
          this.closeUnassignedCalendar();
          this.alertService.success('Roster Submitted', `${employee.EmployeeName} was added for ${this.monthLabel()}.`);
        },
        error: (error: unknown) => {
          this.alertService.error('Roster Submit Failed', formatApiErrorMessage(error, 'Could not submit employee roster.'));
        },
      });
  }

  private async submitExistingEmployeeCalendar(
    employee: RosterEmployee | null,
    days: Array<{ day: RosterDay; index: number }>,
  ): Promise<void> {
    if (!employee) {
      return Promise.resolve();
    }
    const assignedDays = days.filter(({ index }) =>
      this.isAssignedShift(this.shiftForFullMonth(employee, index)),
    );
    const changedDays = assignedDays.filter(({ index }) =>
      this.shiftForFullMonth(employee, index) !== this.calendarOriginalShifts[index],
    );
    if (!changedDays.length) {
      this.closeUnassignedCalendar();
      return Promise.resolve();
    }

    const unassignedCount = days.length - assignedDays.length;
    if (
      unassignedCount > 0 &&
      !(await this.alertService.confirmWarning(
        'Unassigned shifts remain',
        `${unassignedCount} day(s) have no shift. Continue to save the assigned shift changes and leave the other days unassigned?`,
        'Save assigned shifts',
      ))
    ) {
      return;
    }

    const payload: EmployeeRosterAddPayload = {
      data: changedDays.map(({ day, index }) => ({
        employee_id: this.toApiEmployeeId(employee.EmployeeCode),
        shift_date: this.rosterDate(day.date),
        shift: this.toApiShift(this.shiftForFullMonth(employee, index)),
        role: employee.role,
        hub: employee.hub || this.selectedHub(),
        note: null,
      })),
    };

    this.saving.set(true);
    this.employeeService
      .addEmployeeRoster(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.syncRosterRecords(payload.data);
          this.employees.update((employees) => employees.map((item) =>
            item.EmployeeCode === employee.EmployeeCode
              ? { ...item, shifts: [...employee.shifts] }
              : item,
          ));
          this.originalRosterShifts.set(employee.EmployeeCode, [...employee.shifts]);
          this.hasChanges.set(false);
          this.closeUnassignedCalendar();
          this.alertService.success('Roster Updated', `${employee.EmployeeName}'s shifts were updated.`);
        },
        error: (error: unknown) => {
          this.alertService.error(
            'Roster Update Failed',
            formatApiErrorMessage(error, 'Could not update employee shifts.'),
          );
        },
      });
  }

  private rosterShiftsForMonth(employeeCode: string): ShiftCode[] {
    return rosterShiftsForEmployeeMonth(this.rosterRecords, employeeCode, this.monthLabel());
  }

  private rosterDateValue(value: string): string {
    return value.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
  }

  private syncRosterRecords(rows: EmployeeRosterAddPayload['data']): void {
    for (const row of rows) {
      const normalizedEmployeeCode = this.normalizeRosterEmployeeCode(row.employee_id);
      const existingIndex = this.rosterRecords.findIndex((record) =>
        this.normalizeRosterEmployeeCode(record.employee_id) === normalizedEmployeeCode &&
        this.rosterDateValue(record.shift_date) === row.shift_date,
      );
      if (existingIndex >= 0) {
        this.rosterRecords[existingIndex] = {
          ...this.rosterRecords[existingIndex],
          shift: row.shift,
        };
        continue;
      }

      const employee = this.employees().find((record) =>
        this.normalizeRosterEmployeeCode(record.EmployeeCode) === normalizedEmployeeCode,
      );
      this.rosterRecords.push({
        ...row,
        employee_name: employee?.EmployeeName ?? '',
        department: employee?.Department ?? '',
        designation: employee?.Designation ?? '',
        employment_status: employee?.EmploymentStatus ?? '',
      });
    }
  }

  isAssignedShift(shift: ShiftCode): boolean {
    return isAssignedRosterShift(shift);
  }

  private toApiShift(shift: ShiftCode): string {
    const normalized = shift.trim();
    const lower = normalized.toLowerCase();
    const workstations = this.workstationService.workstations();
    const workstation = workstations.find((item) =>
      rosterWorkstationCode(item, workstations).toLowerCase() === lower,
    ) ?? workstations.find((item) =>
      [item.shift, item.code, item.name, item.description]
        .some((value) => value.trim().toLowerCase() === lower),
    );
    if (workstation) {
      const workstationCode = workstation.code.trim();
      const isUniqueCode = !workstations.some((item) =>
        item !== workstation && item.code.trim().toLowerCase() === workstationCode.toLowerCase(),
      );
      if (isUniqueCode && workstationCode && workstationCode.length <= 8) {
        return workstationCode;
      }
      if (String(workstation.id).trim()) {
        return String(workstation.id).trim();
      }
    }
    if (['m', 'morning', 'morning shift'].includes(lower)) {
      return 'M';
    }
    if (['e', 'evening', 'evening shift'].includes(lower)) {
      return 'E';
    }
    if (['n', 'night', 'night shift'].includes(lower)) {
      return 'N';
    }
    if (['off', 'day off', 'scheduled day off'].includes(lower)) {
      return 'OFF';
    }
    if (['hol', 'holiday'].includes(lower)) {
      return 'HOL';
    }
    if (['l', 'leave'].includes(lower)) {
      return 'L';
    }
    const compactCode = normalized
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .map((word) => word[0])
      .join('')
      .slice(0, 3)
      .toUpperCase();
    return compactCode || normalized.slice(0, 3).toUpperCase();
  }

  private toApiEmployeeId(employeeCode: string): string {
    const normalized = this.employeeService.normalizeEmployeeCodeValue(employeeCode).trim();
    const numericCode = normalized.match(/^(?:emp[-\s]?)?(\d+)$/i)?.[1];
    return numericCode ? `Emp-${numericCode.padStart(8, '0')}` : normalized;
  }

  openUnassignedShiftDialog(employee: RosterEmployee, dayIndex: number): void {
    this.assignUnassignedDay(dayIndex);
  }

  shiftFor(employee: RosterEmployee, dayIndex: number): ShiftCode {
    if (!employee.shifts.length) {
      return '+';
    }
    if (employee.shifts.length === this.fullMonthDays().length) {
      const date = this.visibleDays()[dayIndex]?.date ?? dayIndex + 1;
      return employee.shifts[date - 1] ?? '+';
    }
    return employee.shifts[dayIndex % employee.shifts.length];
  }

  shiftForFullMonth(employee: RosterEmployee, dayIndex: number): ShiftCode {
    return employee.shifts[dayIndex] ?? '+';
  }

  toggleEmployee(employee: RosterEmployee, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedEmployees.update((selected) => {
      const next = new Set(selected);
      if (checked) {
        next.add(employee.EmployeeCode);
      } else {
        next.delete(employee.EmployeeCode);
      }
      return next;
    });
  }

  toggleAllVisible(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedEmployees.update((selected) => {
      const next = new Set(selected);
      this.filteredEmployees().forEach((employee) => {
        if (checked) {
          next.add(employee.EmployeeCode);
        } else {
          next.delete(employee.EmployeeCode);
        }
      });
      return next;
    });
  }

  isEmployeeSelected(employee: RosterEmployee): boolean {
    return this.selectedEmployees().has(employee.EmployeeCode);
  }

  shiftClass(shift: ShiftCode): string {
    return 'roster-shift';
  }

  shiftBackground(description: string): string {
    return `hsl(${this.descriptionHue(description)} 88% 92%)`;
  }

  shiftForeground(description: string): string {
    return `hsl(${this.descriptionHue(description)} 55% 28%)`;
  }

  shiftName(shift: ShiftCode): string {
    const lower = shift.trim().toLowerCase();
    const workstation = this.workstationService.workstations().find((item) =>
      [item.code, String(item.id)].some((value) => value.trim().toLowerCase() === lower),
    );
    const label = workstation?.shift.trim() || shift;
    return { M: 'Morning', E: 'Evening', N: 'Night', OFF: 'Day Off', L: 'Leave', HOL: 'Holiday', '+': 'Unassigned' }[label] || label;
  }

  shiftInitial(shift: ShiftCode): string {
    return rosterShiftInitial(shift, this.workstationService.workstations());
  }

  shiftDescription(shift: string): string {
    const workstation = this.workstationService
      .workstations()
      .find((item) => [item.code, String(item.id), item.shift].some((value) => value.trim().toLowerCase() === shift.trim().toLowerCase()));
    return workstation?.description.trim() || workstation?.name.trim() || this.shiftName(shift);
  }

  monthDayLabel(dayDate: number): string {
    const day = this.fullMonthDays().find((item) => item.date === dayDate);
    return day ? `${day.weekday} ${day.date}` : String(dayDate);
  }

  private descriptionHue(description: string): number {
    const normalizedDescription = description.trim().toLowerCase();
    if (normalizedDescription === 'morning') {
      return 45;
    }
    if (normalizedDescription === 'holiday') {
      return 145;
    }
    if (normalizedDescription === 'scheduled day off' || normalizedDescription === 'day off') {
      return 215;
    }

    const descriptions = this.workstationService
      .workstations()
      .map((workstation) => workstation.description.trim() || workstation.name.trim() || workstation.shift.trim())
      .filter(Boolean)
      .filter((value, index, values) => values.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);
    const index = descriptions.findIndex((value) => value.trim().toLowerCase() === normalizedDescription);
    return index >= 0 ? (28 + index * 137.508) % 360 : 215;
  }

  selectCell(employee: RosterEmployee, dayIndex: number): void {
    const dayDate = this.visibleDays()[dayIndex]?.date;
    if (dayDate === undefined) {
      this.selectedCell.set(null);
      return;
    }
    this.selectedCell.set({ employeeCode: employee.EmployeeCode, day: dayIndex });
  }

  openShiftDialog(employee: RosterEmployee, dayIndex: number, event: MouseEvent): void {
    const dayDate = this.visibleDays()[dayIndex]?.date;
    if (dayDate === undefined) {
      return;
    }
    this.loadWorkstations();
    this.selectedCell.set({ employeeCode: employee.EmployeeCode, day: dayIndex });
    this.shiftDialog.set({ employee, dayIndex, dayDate, shift: this.shiftFor(employee, dayIndex) });
    const popoverWidth = 350;
    const popoverHeight = Math.min(560, Math.max(220, window.innerHeight - 16));
    const gap = 10;
    const left = event.clientX + gap + popoverWidth <= window.innerWidth
      ? event.clientX + gap
      : event.clientX - popoverWidth - gap;
    const top = Math.min(Math.max(8, event.clientY - 70), Math.max(8, window.innerHeight - popoverHeight - 8));
    this.shiftDialogPosition.set({
      top,
      left: Math.max(8, left),
    });
  }

  startShiftDialogDrag(event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }

    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    const position = this.shiftDialogPosition();
    this.shiftDialogDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTop: position.top,
      startLeft: position.left,
    };
    this.shiftDialogDragging.set(true);
    event.preventDefault();
  }

  moveShiftDialog(event: PointerEvent): void {
    const drag = this.shiftDialogDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const dialog = event.currentTarget as HTMLElement;
    const maxTop = Math.max(8, window.innerHeight - dialog.offsetHeight - 8);
    const maxLeft = Math.max(8, window.innerWidth - dialog.offsetWidth - 8);
    this.shiftDialogPosition.set({
      top: Math.min(Math.max(8, drag.startTop + event.clientY - drag.startY), maxTop),
      left: Math.min(Math.max(8, drag.startLeft + event.clientX - drag.startX), maxLeft),
    });
  }

  endShiftDialogDrag(event: PointerEvent): void {
    if (!this.shiftDialogDrag || this.shiftDialogDrag.pointerId !== event.pointerId) {
      return;
    }

    this.shiftDialogDrag = null;
    this.shiftDialogDragging.set(false);
  }

  chooseDialogShift(shift: ShiftCode): void {
    this.shiftDialog.update((dialog) => (dialog ? { ...dialog, shift } : dialog));
  }

  closeShiftDialog(): void {
    this.shiftDialog.set(null);
  }

  applyDialogShift(): void {
    const dialog = this.shiftDialog();
    if (!dialog) {
      return;
    }
    if (this.unassignedCalendarEmployee()?.EmployeeCode === dialog.employee.EmployeeCode) {
      const updatedEmployee = {
        ...dialog.employee,
        shifts: dialog.employee.shifts.map((shift, index) => index === dialog.dayIndex ? dialog.shift : shift),
      };
      this.unassignedCalendarEmployee.set(updatedEmployee);
    } else {
      const payload: EmployeeRosterAddPayload = {
        data: [{
          employee_id: this.toApiEmployeeId(dialog.employee.EmployeeCode),
          shift_date: this.rosterDate(dialog.dayDate),
          shift: this.toApiShift(dialog.shift),
          role: dialog.employee.role,
          hub: dialog.employee.hub || this.selectedHub(),
          note: null,
        }],
      };
      this.saving.set(true);
      this.employeeService
        .addEmployeeRoster(payload)
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => {
            this.employees.update((employees) => employees.map((employee) => {
              if (employee.EmployeeCode !== dialog.employee.EmployeeCode) {
                return employee;
              }
              const shifts = [...employee.shifts];
              shifts[dialog.dayDate - 1] = dialog.shift;
              return { ...employee, shifts };
            }));
            this.syncRosterRecords(payload.data);
            const employee = this.employees().find((item) => item.EmployeeCode === dialog.employee.EmployeeCode);
            if (employee) {
              this.originalRosterShifts.set(employee.EmployeeCode, [...employee.shifts]);
            }
            this.hasChanges.set(false);
            this.closeShiftDialog();
            this.alertService.success('Roster Updated', 'The selected shift was saved.');
          },
          error: (error: unknown) => {
            this.alertService.error('Roster Update Failed', formatApiErrorMessage(error, 'Could not save the selected shift.'));
          },
        });
      return;
    }
    this.closeShiftDialog();
  }

  assignShift(shift: ShiftCode): void {
    const selected = this.selectedCell();
    const employeeCodes = this.selectedEmployees();
    if (employeeCodes.size > 0) {
      const editableIndexes = this.visibleDays().map((day) => day.date - 1);
      this.employees.update((employees) => employees.map((employee) => {
        if (!employeeCodes.has(employee.EmployeeCode)) {
          return employee;
        }
        const shifts = this.monthlyShifts(employee);
        editableIndexes.forEach((index) => {
          shifts[index] = shift;
        });
        return { ...employee, shifts };
      }));
      this.hasChanges.set(true);
      return;
    }
    if (!selected) {
      this.alertService.validation('Select a roster cell first.');
      return;
    }
    const dayDate = this.visibleDays()[selected.day]?.date;
    if (dayDate === undefined) {
      return;
    }
    this.employees.update((employees) => employees.map((employee) => {
      if (employee.EmployeeCode !== selected.employeeCode) {
        return employee;
      }
      const shifts = this.monthlyShifts(employee);
      shifts[dayDate - 1] = shift;
      return { ...employee, shifts };
    }));
    this.hasChanges.set(true);
  }

  assignDaysOff(): void {
    this.assignShift('OFF');
  }

  applyRotation(): void {
    const selected = this.selectedEmployees();
    if (!selected.size) {
      this.alertService.validation('Select at least one employee first.');
      return;
    }
    const editableIndexes = this.visibleDays().map((day) => day.date - 1);
    this.employees.update((employees) => employees.map((employee) => {
      if (!selected.has(employee.EmployeeCode) || !employee.shifts.length) {
        return employee;
      }
      const shifts = this.monthlyShifts(employee);
      const editableShifts = editableIndexes
        .map((index) => shifts[index])
        .filter((shift): shift is ShiftCode => shift !== undefined);
      editableIndexes.forEach((index, position) => {
        if (position < editableShifts.length) {
          shifts[index] = editableShifts[(position + 1) % editableShifts.length];
        }
      });
      return { ...employee, shifts };
    }));
    this.hasChanges.set(true);
  }

  changeMonth(offset: number): void {
    if (this.hasChanges()) {
      this.alertService.validation('Save roster changes before changing the month.');
      return;
    }
    const [monthName, yearText] = this.monthLabel().split(' ');
    const date = new Date(`${monthName} 1, ${yearText}`);
    date.setMonth(date.getMonth() + offset);
    this.monthLabel.set(date.toLocaleString('en-US', { month: 'long', year: 'numeric' }));
    this.refreshEmployeeMonthShifts();
  }

  jumpToToday(): void {
    const today = new Date();
    const monthLabel = today.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    if (monthLabel === this.monthLabel()) {
      return;
    }
    if (this.hasChanges()) {
      this.alertService.validation('Save roster changes before changing the month.');
      return;
    }
    this.monthLabel.set(monthLabel);
    this.refreshEmployeeMonthShifts();
  }

  private refreshEmployeeMonthShifts(): void {
    this.employees.update((employees) => employees.map((employee) => ({
      ...employee,
      shifts: this.rosterShiftsForMonth(employee.EmployeeCode),
    })));
    this.originalRosterShifts = new Map(
      this.employees().map((employee) => [employee.EmployeeCode, [...employee.shifts]]),
    );
    this.clearSelection();
  }

  onMonthHalfChange(value: string): void {
    this.selectedMonthHalf.set(value as MonthHalf);
    this.clearSelection();
  }

  dismissConflicts(): void {
    this.conflictsVisible.set(false);
  }

  clearSelection(): void {
    this.selectedCell.set(null);
    this.selectedEmployees.set(new Set());
  }

  saveChanges(): void {
    if (!this.hasChanges() || this.saving()) {
      return;
    }

    const changedRows = this.employees().flatMap((employee) => {
      const originalShifts = this.originalRosterShifts.get(employee.EmployeeCode) ?? [];
      return this.visibleDays().flatMap((day) => {
        const dayIndex = day.date - 1;
        const currentShift = this.shiftForDate(employee, day.date);
        const originalShift = originalShifts[dayIndex] ?? '+';
        return currentShift === originalShift
          ? []
          : [{
              employee_id: this.toApiEmployeeId(employee.EmployeeCode),
              shift_date: this.rosterDate(day.date),
              shift: this.toApiShift(currentShift),
              role: employee.role,
              hub: employee.hub || this.selectedHub(),
              note: null,
            }];
      });
    });

    if (changedRows.length === 0) {
      this.hasChanges.set(false);
      return;
    }

    const payload: EmployeeRosterAddPayload = {
      data: changedRows,
    };

    this.saving.set(true);
    this.employeeService
      .addEmployeeRoster(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.syncRosterRecords(changedRows);
          this.originalRosterShifts = new Map(
            this.employees().map((employee) => [employee.EmployeeCode, [...employee.shifts]]),
          );
          this.hasChanges.set(false);
          this.alertService.success('Roster Updated', 'Roster changes were saved successfully.');
        },
        error: (error) => {
          this.alertService.error('Roster Save Failed', formatApiErrorMessage(error, 'Could not save roster changes.'));
        },
      });
  }

  private rosterDate(day: number): string {
    const [monthName, year] = this.monthLabel().split(' ');
    const month = new Date(`${monthName} 1, ${year}`).getMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private shiftForDate(employee: RosterEmployee, day: number): ShiftCode {
    return employee.shifts.length === this.fullMonthDays().length
      ? employee.shifts[day - 1] ?? '+'
      : this.shiftFor(employee, day - 1);
  }

  private monthlyShifts(employee: RosterEmployee): ShiftCode[] {
    const days = this.fullMonthDays();
    if (employee.shifts.length === days.length) {
      return [...employee.shifts];
    }
    if (!employee.shifts.length) {
      return days.map(() => '+');
    }
    return days.map((_, index) => employee.shifts[index % employee.shifts.length] ?? '+');
  }

  private toRosterEmployee(record: ApplicationFormRecord, index: number): RosterEmployee {
    const patterns: ShiftCode[][] = [
      ['E', 'E', 'E', 'M', 'M', 'OFF', 'OFF'],
      ['N', 'N', 'N', 'OFF', 'OFF', 'M', 'M'],
      ['M', 'M', 'M', 'OFF', 'OFF', 'N', 'N'],
      ['M', 'M', 'M', 'M', 'M', 'OFF', 'OFF'],
      ['E', 'E', 'E', 'OFF', 'E', 'E', 'E'],
    ];
    return {
      ...record,
      hub: 'Lahore HO',
      role: record.Designation || ['Ops', 'Supp', 'Logistics', 'Eng', 'Staff'][index % 5],
      shifts: patterns[index % patterns.length],
    };
  }

  private toRosterEmployees(
    records: EmployeeRosterListRecord[],
    profiles: ApplicationFormRecord[],
  ): RosterEmployee[] {
    const grouped = new Map<string, EmployeeRosterListRecord>();
    const profilesByCode = new Map(
      profiles.map((profile) => [this.normalizeRosterEmployeeCode(profile.EmployeeCode), profile]),
    );

    for (const record of records) {
      const employeeCode = this.normalizeRosterEmployeeCode(record.employee_id);
      if (!employeeCode) {
        continue;
      }

      const existing = grouped.get(employeeCode);
      if (!existing) {
        grouped.set(employeeCode, record);
      }
    }

    return Array.from(grouped.values()).map((record, index) => {
      const employeeCode = this.normalizeRosterEmployeeCode(record.employee_id);
      const profile = profilesByCode.get(employeeCode);
      const rosterEmployee = this.toRosterEmployee(this.toApplicationRecord(record, profile), index);
      return {
        ...rosterEmployee,
        hub: rosterBranchName(
          profile?.detail?.personalInfo.branchLocation ||
          profile?.detail?.requisition.location ||
          record.hub,
        ),
        role: record.role || record.designation || rosterEmployee.role,
        shifts: rosterShiftsForEmployeeMonth(records, employeeCode, this.monthLabel()),
      };
    });
  }

  private normalizeRosterEmployeeCode(value: string | null | undefined): string {
    const normalized = this.employeeService.normalizeEmployeeCodeValue(String(value ?? '')).trim();
    const numericCode = normalized.match(/^(?:emp[-\s]?)?(\d+)$/i)?.[1];
    return numericCode ? `emp-${numericCode.padStart(8, '0')}` : normalized.toLowerCase();
  }

  private toApplicationRecord(
    record: EmployeeRosterListRecord,
    profile?: ApplicationFormRecord,
  ): ApplicationFormRecord {
    return {
      EmployeeCode: profile?.EmployeeCode || record.employee_id,
      EmployeeName: profile?.EmployeeName || record.employee_name || record.employee_id,
      Department: profile?.Department || record.department,
      EmployeeNature: '',
      Designation: profile?.Designation || record.designation || record.role,
      ReportingManager: '',
      EmploymentType: '',
      EmploymentStatus: record.employment_status,
      EmploymentCategory: '',
      status: '',
    };
  }


}
