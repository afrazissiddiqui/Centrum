import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, from, last, of, Subscription } from 'rxjs';
import { catchError, finalize, map, mergeMap } from 'rxjs/operators';
import { AttendanceManagementService } from '../../../../services/attendance-management.service';
import { AlertService } from '../../../../services/alert.service';
import {
  ApplicationFormRecord,
  ApplicationFormService,
  EmployeeRosterListRecord,
  canonicalizeEmployeeCodeValue,
} from '../../../../services/application-form.service';
import {
  buildPaginationFooterItems,
  paginationItemTrack,
  PaginationFooterItem,
} from '../../../../utils/pagination.util';
import {
  EmployeeShiftAllocationRecord,
  EmployeeShiftAllocationService,
} from '../../../../services/employee-shift-allocation.service';
import { OvertimeListRecord, OvertimeListService } from '../../../../services/overtime-list.service';
import { WorkstationRecord, WorkstationService } from '../../../../services/workstation.service';
import { formatApiErrorMessage } from '../../../../utils/api-error.util';
import { computeOvertimeRate } from '../../../HR-Portal/payroll-master/payroll-setup/payroll-setup.service';

interface OvertimeEmployee extends ApplicationFormRecord {
  flag: '0' | '1';
  overtimeStatus: 'Not Posted' | 'Approved';
  workingHours: string | null;
  shiftHours: string | null;
  calculatedOvertimeHours: string | null;
}

@Component({
  selector: 'app-add-overtime',
  imports: [CommonModule, FormsModule],
  templateUrl: './add-overtime.html',
  styleUrl: './add-overtime.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddOvertimeComponent implements OnInit {
  private readonly applicationFormService = inject(ApplicationFormService);
  private readonly employeeShiftAllocationService = inject(EmployeeShiftAllocationService);
  private readonly overtimeListService = inject(OvertimeListService);
  private readonly attendanceService = inject(AttendanceManagementService);
  private readonly workstationService = inject(WorkstationService);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly hoursLoading = signal(false);
  readonly posting = signal(false);
  readonly searchText = signal('');
  readonly selectedDepartment = signal('');
  readonly selectedMonth = signal(this.localDateValue(new Date()).slice(0, 7));
  readonly employees = signal<OvertimeEmployee[]>([]);
  readonly selectedEmployeeKeys = signal<ReadonlySet<string>>(new Set());
  readonly postErrors = signal<Record<string, string>>({});
  readonly currentPage = signal(1);
  readonly pageSize = signal(25);
  readonly pageSizeOptions = [10, 25, 50, 100];
  private rosterRecords: EmployeeRosterListRecord[] = [];
  private shiftAllocations: EmployeeShiftAllocationRecord[] = [];
  private workstations: WorkstationRecord[] = [];
  private overtimeRecords: OvertimeListRecord[] = [];
  private hoursRequestId = 0;
  private hoursSubscription: Subscription | null = null;
  private readonly eligibleEmployees = computed(() =>
    this.employees().filter((employee) =>
      employee.flag === '0' &&
      this.isYes(employee.detail?.hrSettings.attendanceShiftManagement) &&
      this.isYes(employee.detail?.remuneration.overTimeApplicable),
    ),
  );
  readonly departments = computed(() => {
    const departments = new Map<string, string>();
    for (const employee of this.eligibleEmployees()) {
      const department = employee.Department.trim();
      if (department) {
        const key = department.toLocaleLowerCase();
        if (!departments.has(key)) {
          departments.set(key, department);
        }
      }
    }
    return [...departments.values()].sort((left, right) => left.localeCompare(right));
  });
  readonly filteredEmployees = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase();
    const department = this.selectedDepartment().trim().toLocaleLowerCase();
    const departmentEmployees = this.eligibleEmployees().filter((employee) =>
      !department || employee.Department.trim().toLocaleLowerCase() === department,
    );

    if (!query) {
      return departmentEmployees;
    }

    return departmentEmployees.filter((employee) =>
      [employee.EmployeeCode, employee.EmployeeName, employee.Department, employee.Designation]
        .some((value) => value.toLocaleLowerCase().includes(query)),
    );
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredEmployees().length / this.pageSize())));
  readonly activePage = computed(() => Math.min(this.currentPage(), this.totalPages()));
  readonly paginatedEmployees = computed(() => {
    const start = (this.activePage() - 1) * this.pageSize();
    return this.filteredEmployees().slice(start, start + this.pageSize());
  });
  readonly paginationItems = computed<PaginationFooterItem[]>(() =>
    buildPaginationFooterItems(this.totalPages(), this.activePage()),
  );
  readonly paginationStart = computed(() =>
    this.filteredEmployees().length ? (this.activePage() - 1) * this.pageSize() + 1 : 0,
  );
  readonly paginationEnd = computed(() =>
    Math.min(this.activePage() * this.pageSize(), this.filteredEmployees().length),
  );
  readonly filteredSelectableEmployees = computed(() =>
    this.filteredEmployees().filter((employee) =>
      this.isSelectableForPosting(employee),
    ),
  );
  readonly allVisibleSelected = computed(() => {
    const visible = this.filteredSelectableEmployees();
    return visible.length > 0 && visible.every((employee) =>
      this.selectedEmployeeKeys().has(this.employeeKey(employee)),
    );
  });

  ngOnInit(): void {
    this.loadEmployees();
  }

  onSearchChange(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(1);
  }

  onDepartmentChange(value: string): void {
    this.selectedDepartment.set(value);
    this.currentPage.set(1);
  }

  onMonthChange(value: string): void {
    if (!this.isValidMonth(value)) {
      return;
    }
    this.selectedMonth.set(value);
    this.postErrors.set({});
    this.currentPage.set(1);
    this.applyPostedEmployeeFlags(value);
    this.employees.update((employees) => employees.map((employee) => ({
      ...employee,
      workingHours: null,
      shiftHours: null,
      calculatedOvertimeHours: null,
    })));
    this.loadMonthlyOvertime();
  }

  onPageSizeChange(value: number | string): void {
    const size = Number(value);
    if (Number.isInteger(size) && size > 0) {
      this.pageSize.set(size);
      this.currentPage.set(1);
    }
  }

  setPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  trackPaginationItem(index: number, item: PaginationFooterItem): string {
    return paginationItemTrack(index, item);
  }

  overtimeHours(employee: OvertimeEmployee): string {
    if (employee.calculatedOvertimeHours !== null) {
      return employee.calculatedOvertimeHours;
    }
    const workingMinutes = this.durationToMinutes(employee.workingHours);
    const shiftMinutes = this.durationToMinutes(employee.shiftHours);
    if (workingMinutes === null || shiftMinutes === null) {
      return '—';
    }
    return this.formatDuration(Math.max(0, workingMinutes - shiftMinutes));
  }

  hasOvertimeHours(employee: OvertimeEmployee): boolean {
    const overtimeMinutes = this.durationToMinutes(this.overtimeHours(employee));
    return overtimeMinutes !== null && overtimeMinutes > 0;
  }

  isSelectableForPosting(employee: OvertimeEmployee): boolean {
    return employee.flag === '0' &&
      this.durationToMinutes(employee.workingHours) !== null &&
      this.durationToMinutes(employee.shiftHours) !== null &&
      this.hasOvertimeHours(employee) &&
      this.shiftIdForMonth(employee, this.selectedMonth()) !== null;
  }

  postEligibilityMessage(employee: OvertimeEmployee): string {
    const postError = this.postErrors()[this.employeeKey(employee)];
    if (postError) {
      return postError;
    }
    if (employee.flag === '1') {
      return 'Already posted for this month';
    }
    if (this.hoursLoading() && (!employee.workingHours || !employee.shiftHours)) {
      return 'Waiting for monthly hours';
    }

    const workingMinutes = this.durationToMinutes(employee.workingHours);
    const shiftMinutes = this.durationToMinutes(employee.shiftHours);
    if (workingMinutes === null || shiftMinutes === null) {
      return 'Monthly working or shift hours unavailable';
    }
    if (!this.hasOvertimeHours(employee)) {
      return 'No overtime hours for selected month';
    }
    if (!this.shiftIdForMonth(employee, this.selectedMonth())) {
      return 'No shift assignment found for selected month';
    }

    const basicSalary = employee.detail?.remuneration?.basicSalary ?? '';
    const grossSalary = Number(basicSalary.replace(/,/g, '').trim());
    if ((!Number.isFinite(grossSalary) || grossSalary <= 0) && !employee.apiId) {
      return 'Gross salary unavailable';
    }
    return 'Ready to post';
  }

  private formatDuration(totalMinutes: number): string {
    const overtimeMinutes = Math.max(0, totalMinutes);
    const hours = Math.floor(overtimeMinutes / 60);
    const minutes = overtimeMinutes % 60;
    if (hours === 0 && minutes === 0) {
      return '0h';
    }
    if (hours === 0) {
      return `${minutes}m`;
    }
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }

  employeeKey(employee: ApplicationFormRecord): string {
    return employee.EmployeeCode;
  }

  toggleAllVisible(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const checked = target.checked;
    this.selectedEmployeeKeys.update((selectedKeys) => {
      const nextSelectedKeys = new Set(selectedKeys);
      for (const employee of this.filteredSelectableEmployees()) {
        const key = this.employeeKey(employee);
        if (checked) {
          nextSelectedKeys.add(key);
        } else {
          nextSelectedKeys.delete(key);
        }
      }
      return nextSelectedKeys;
    });
  }

  toggleEmployeeSelection(employee: ApplicationFormRecord, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const key = this.employeeKey(employee);
    this.selectedEmployeeKeys.update((selectedKeys) => {
      const nextSelectedKeys = new Set(selectedKeys);
      if (target.checked) {
        nextSelectedKeys.add(key);
      } else {
        nextSelectedKeys.delete(key);
      }
      return nextSelectedKeys;
    });
    this.postErrors.update((errors) => {
      const nextErrors = { ...errors };
      delete nextErrors[key];
      return nextErrors;
    });
  }

  goToList(): void {
    void this.router.navigate(['/setup/overtime-list']);
  }

  postSelectedEmployees(): void {
    const employeesToPost = this.employees().filter((employee) =>
      employee.flag === '0' &&
      this.selectedEmployeeKeys().has(this.employeeKey(employee)) &&
      this.isSelectableForPosting(employee),
    );
    if (!employeesToPost.length || this.posting()) {
      return;
    }

    const month = this.selectedMonth();
    const overtimeDate = `${month}-01`;
    this.posting.set(true);
    const employeesMissingSalary = employeesToPost.filter((employee) =>
      this.overtimeRate(employee) === null && !!employee.apiId,
    );
    const profileDetails$ = employeesMissingSalary.length
      ? this.applicationFormService
          .fetchEmployeeProfileDetailsInBatches(employeesMissingSalary, employeesMissingSalary.length)
          .pipe(last())
      : of([]);
    profileDetails$.subscribe({
      next: (details) => {
        const employeesWithDetails = employeesToPost.map((employee) => {
          const detailRecord = details.find((record) =>
            this.normalizeEmployeeKey(record.EmployeeCode) === this.normalizeEmployeeKey(employee.EmployeeCode),
          );
          if (!detailRecord?.detail) {
            return employee;
          }
          return {
            ...employee,
            detail: {
              ...employee.detail,
              ...detailRecord.detail,
              remuneration: {
                ...employee.detail?.remuneration,
                ...detailRecord.detail.remuneration,
              },
            },
          };
        });
        this.submitEmployees(employeesWithDetails, month, overtimeDate);
      },
      error: (error: unknown) => {
        this.posting.set(false);
        void this.alertService.error(
          'Salary Data Unavailable',
          formatApiErrorMessage(error, 'Employee gross salaries could not be loaded to calculate overtime rates.'),
        );
      },
    });
  }

  private submitEmployees(
    employeesToPost: OvertimeEmployee[],
    month: string,
    overtimeDate: string,
  ): void {
    forkJoin(employeesToPost.map((employee) => {
      const overtimeRate = this.overtimeRate(employee);
      if (overtimeRate === null) {
        return of({
          employee,
          success: false as const,
          errorMessage: 'Gross salary is unavailable; overtime rate could not be calculated.',
        });
      }

      const workingMinutes = this.durationToMinutes(employee.workingHours);
      const shiftMinutes = this.durationToMinutes(employee.shiftHours);
      const overtimeMinutes = this.durationToMinutes(this.overtimeHours(employee));
      const shiftId = this.shiftIdForMonth(employee, month);
      if (workingMinutes === null || shiftMinutes === null || overtimeMinutes === null || !shiftId) {
        return of({
          employee,
          success: false as const,
          errorMessage: 'Monthly hours or shift assignment are unavailable; this employee was not posted.',
        });
      }

      const payload = {
        employee_code: employee.EmployeeCode,
        employee_name: employee.EmployeeName,
        overtime_date: overtimeDate,
        shift_id: String(shiftId),
        working_hours: workingMinutes / 60,
        shift_hours: shiftMinutes / 60,
        overtime_hours: overtimeMinutes / 60,
        overtime_rate: overtimeRate,
        exceptional_ot: 0,
        flag: '1' as const,
      };
      return this.overtimeListService.postOvertimeEmployee([payload]).pipe(
        map(() => ({ employee, payload, success: true as const })),
        catchError((error: unknown) => of({
          employee,
          payload,
          success: false as const,
          errorMessage: formatApiErrorMessage(error, 'Post failed.'),
        })),
      );
    })).subscribe((results) => {
      const successfulKeys = new Set(
        results.filter((result) => result.success).map((result) => this.employeeKey(result.employee)),
      );
      this.overtimeRecords = [
        ...this.overtimeRecords,
        ...results
          .filter((result) => result.success)
          .map(({ employee, payload }) => ({
            id: `local-${month}-${this.employeeKey(employee)}`,
            values: payload,
          })),
      ];
      this.employees.update((employees) => employees.map((employee) =>
        successfulKeys.has(this.employeeKey(employee))
          ? { ...employee, flag: '1', overtimeStatus: 'Approved' }
          : employee,
      ));
      this.selectedEmployeeKeys.update((selectedKeys) =>
        new Set([...selectedKeys].filter((key) => !successfulKeys.has(key))),
      );
      this.posting.set(false);

      const failedResults = results.filter((result) => !result.success);
      this.postErrors.set(Object.fromEntries(
        failedResults.map((result) => [this.employeeKey(result.employee), result.errorMessage]),
      ));
      if (failedResults.length) {
        const failedDetails = failedResults
          .map((result) => `${result.employee.EmployeeName}: ${result.errorMessage}`)
          .join('; ');
        void this.alertService.error(
          'Some Employees Were Not Posted',
          `${successfulKeys.size} employee(s) posted and marked Approved. ${failedResults.length} employee(s) remain unposted: ${failedDetails}`,
        );
        return;
      }

      void this.alertService.success(
        'Overtime Posted',
        `${successfulKeys.size} employee(s) posted and marked Approved.`,
      );
    });
  }

  private loadEmployees(): void {
    this.loading.set(true);
    forkJoin({
      employees: this.applicationFormService.fetchEmployeeProfiles(),
      overtimeRecords: this.overtimeListService.fetchOvertimeList(),
      roster: this.applicationFormService.fetchEmployeeRosterList().pipe(
        catchError((error: unknown) => {
          void this.alertService.error(
            'Roster Data Unavailable',
            formatApiErrorMessage(error, 'Employee roster data could not be loaded. Shift-hour calculations may be unavailable.'),
          );
          return of([] as EmployeeRosterListRecord[]);
        }),
      ),
      workstations: this.workstationService.fetchWorkstations().pipe(
        catchError((error: unknown) => {
          void this.alertService.error(
            'Shift Data Unavailable',
            formatApiErrorMessage(error, 'Workstation data could not be loaded. Shift-hour calculations may be unavailable.'),
          );
          return of([] as WorkstationRecord[]);
        }),
      ),
      shiftAllocations: this.employeeShiftAllocationService.fetchShiftAllocations().pipe(
        catchError((error: unknown) => {
          void this.alertService.error(
            'Shift Allocation Data Unavailable',
            formatApiErrorMessage(error, 'Shift allocation details could not be loaded. Shift-hour calculations may be unavailable.'),
          );
          return of([] as EmployeeShiftAllocationRecord[]);
        }),
      ),
    }).subscribe({
      next: ({ employees, overtimeRecords, roster, workstations, shiftAllocations }) => {
        this.rosterRecords = roster;
        this.workstations = workstations;
        this.shiftAllocations = shiftAllocations;
        this.overtimeRecords = overtimeRecords;
        const postedEmployeeKeys = this.postedEmployeeKeys(this.overtimeRecords, this.selectedMonth());
        this.employees.set(employees.map((employee) => {
          const isPosted = postedEmployeeKeys.has(employee.EmployeeCode) ||
            (!!employee.apiId && postedEmployeeKeys.has(employee.apiId));
          return {
            ...employee,
            flag: isPosted ? '1' : '0',
            overtimeStatus: isPosted ? 'Approved' : 'Not Posted',
            workingHours: null,
            shiftHours: null,
            calculatedOvertimeHours: null,
          };
        }));
        this.loading.set(false);
        this.loadMonthlyOvertime();
      },
      error: (error: unknown) => {
        this.employees.set([]);
        this.loading.set(false);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load eligible employees.'),
        );
      },
    });
  }

  private applyPostedEmployeeFlags(month: string): void {
    const postedEmployeeKeys = this.postedEmployeeKeys(this.overtimeRecords, month);
    this.employees.update((employees) => employees.map((employee) => {
      const isPosted = postedEmployeeKeys.has(employee.EmployeeCode) ||
        (!!employee.apiId && postedEmployeeKeys.has(employee.apiId));
      return {
        ...employee,
        flag: isPosted ? '1' : '0',
        overtimeStatus: isPosted ? 'Approved' : 'Not Posted',
      };
    }));
  }

  private overtimeRate(employee: OvertimeEmployee): number | null {
    const basicSalary = employee.detail?.remuneration?.basicSalary ?? '';
    const grossSalary = Number(basicSalary.replace(/,/g, '').trim());
    return Number.isFinite(grossSalary) && grossSalary > 0
      ? computeOvertimeRate(grossSalary)
      : null;
  }

  private shiftIdForMonth(employee: OvertimeEmployee, month: string): number | null {
    const [year, monthNumber] = month.split('-').map(Number);
    const fromDate = `${month}-01`;
    const toDate = this.localDateValue(new Date(year, monthNumber, 0));
    const employeeCode = this.normalizeEmployeeKey(employee.EmployeeCode);
    const assignments = this.rosterRecords
      .filter((assignment) => this.normalizeEmployeeKey(assignment.employee_id) === employeeCode)
      .map((assignment) => ({
        date: this.dateValue(assignment.shift_date),
        shift: assignment.shift.trim(),
      }))
      .filter((assignment) => assignment.date >= fromDate && assignment.date <= toDate && assignment.shift)
      .sort((left, right) => left.date.localeCompare(right.date));

    for (const assignment of assignments) {
      const shift = assignment.shift.trim();
      const normalizedShift = shift.toLocaleLowerCase();
      if (['off', 'day off', 'scheduled day off', 'hol', 'holiday', 'l', 'leave'].includes(normalizedShift)) {
        continue;
      }

      const directId = Number(shift);
      if (Number.isSafeInteger(directId) && directId > 0) {
        return directId;
      }

      const shiftAllocation = this.shiftAllocations.find((record) =>
        [record.code, record.shift, record.name]
          .some((value) => value.trim().toLocaleLowerCase() === normalizedShift),
      );
      const workstation = this.workstations.find((record) =>
        [record.code, record.shift, record.name, record.description]
          .some((value) => value.trim().toLocaleLowerCase() === normalizedShift),
      );
      for (const candidateId of [shiftAllocation?.id, workstation?.id]) {
        const resolvedId = Number(candidateId);
        if (Number.isSafeInteger(resolvedId) && resolvedId > 0) {
          return resolvedId;
        }
      }
    }

    return null;
  }

  private loadMonthlyOvertime(): void {
    this.hoursSubscription?.unsubscribe();
    const requestId = ++this.hoursRequestId;
    const month = this.selectedMonth();
    const [year, monthNumber] = month.split('-').map(Number);
    const fromDate = `${month}-24`;
    const toDate = this.localDateValue(new Date(year, monthNumber, 23));
    const employees = this.employees().filter((employee) =>
      employee.flag === '0' &&
      this.isYes(employee.detail?.hrSettings.attendanceShiftManagement) &&
      this.isYes(employee.detail?.remuneration.overTimeApplicable),
    );
    if (!employees.length) {
      this.hoursLoading.set(false);
      return;
    }

    this.hoursLoading.set(true);
    this.hoursSubscription = from(employees).pipe(
      mergeMap((employee) => {
        const legacyCode = employee.detail?.loginDetails?.legacyCode || employee.ExtEmpNo || '';
        return this.attendanceService.fetchCalculatedWorkingHoursByDate(
          { mode: 'dateRange', fromDate, toDate },
          legacyCode,
        ).pipe(
          map((hoursByDate) => ({
            employee,
            ...this.calculateMonthlyHours(employee, hoursByDate, fromDate, toDate),
          })),
          catchError(() => of({
            employee,
            workingHours: null,
            shiftHours: null,
            calculatedOvertimeHours: null,
          })),
        );
      }, 6),
      finalize(() => {
        if (requestId === this.hoursRequestId) {
          this.hoursLoading.set(false);
        }
      }),
    ).subscribe(({ employee, workingHours, shiftHours, calculatedOvertimeHours }) => {
      if (requestId !== this.hoursRequestId || month !== this.selectedMonth()) {
        return;
      }
      const key = this.employeeKey(employee);
      this.employees.update((current) => current.map((item) =>
        this.employeeKey(item) === key
          ? { ...item, workingHours, shiftHours, calculatedOvertimeHours }
          : item,
      ));
    });
  }

  private calculateMonthlyHours(
    employee: OvertimeEmployee,
    hoursByDate: Array<{ date: string; hoursWorked: string }>,
    fromDate: string,
    toDate: string,
  ): Pick<OvertimeEmployee, 'workingHours' | 'shiftHours' | 'calculatedOvertimeHours'> {
    const dailyHours = new Map(hoursByDate.map((item) => [item.date, item.hoursWorked]));
    let totalWorkingMinutes = 0;
    let totalShiftMinutes = 0;
    let hasWorkingHours = false;
    let hasShiftHours = false;

    for (const [date, hoursWorked] of dailyHours) {
      if (date < fromDate || date > toDate) {
        continue;
      }
      const workedMinutes = this.durationToMinutes(hoursWorked);
      if (workedMinutes === null) {
        continue;
      }
      hasWorkingHours = true;
      totalWorkingMinutes += workedMinutes;
    }

    const employeeCode = this.normalizeEmployeeKey(employee.EmployeeCode);
    const shiftsByDate = new Map<string, string>();
    for (const assignment of this.rosterRecords) {
      if (this.normalizeEmployeeKey(assignment.employee_id) !== employeeCode) {
        continue;
      }
      const date = this.dateValue(assignment.shift_date);
      if (date >= fromDate && date <= toDate) {
        shiftsByDate.set(date, assignment.shift);
      }
    }

    for (const [date, shift] of shiftsByDate) {
      const shiftMinutes = this.durationToMinutes(
        this.shiftHoursForAssignment(shift, this.shiftAllocations, this.workstations),
      );
      if (shiftMinutes === null) {
        continue;
      }
      hasShiftHours = true;
      totalShiftMinutes += shiftMinutes;
    }

    return {
      workingHours: hasWorkingHours ? this.formatDuration(totalWorkingMinutes) : null,
      shiftHours: hasShiftHours ? this.formatDuration(totalShiftMinutes) : null,
      calculatedOvertimeHours: hasShiftHours
      && hasWorkingHours
        ? this.formatDuration(Math.max(0, totalWorkingMinutes - totalShiftMinutes))
        : null,
    };
  }

  private postedEmployeeKeys(records: OvertimeListRecord[], month: string): Set<string> {
    const keys = new Set<string>();
    for (const record of records) {
      const values = record.values;
      const flag = Object.entries(values).find(([key]) =>
        key.toLocaleLowerCase().replace(/[^a-z]/g, '') === 'flag',
      )?.[1];
      if (flag === false || String(flag ?? '').trim() === '0') {
        continue;
      }
      const employeeKey = values['employeeId'] ?? values['employee_id'] ??
        values['employeeCode'] ?? values['employee_code'] ?? values['EmployeeCode'];
      const overtimeDate = Object.entries(values).find(([key]) =>
        ['overtimedate', 'otdate', 'date'].includes(key.toLocaleLowerCase().replace(/[^a-z]/g, '')),
      )?.[1];
      const overtimeMonth = overtimeDate instanceof Date
        ? `${overtimeDate.getFullYear()}-${String(overtimeDate.getMonth() + 1).padStart(2, '0')}`
        : typeof overtimeDate === 'string'
          ? overtimeDate.trim().match(/^\d{4}-\d{2}/)?.[0]
          : undefined;
      if (
        employeeKey !== undefined &&
        employeeKey !== null &&
        String(employeeKey).trim() &&
        overtimeMonth === month
      ) {
        keys.add(String(employeeKey).trim());
      }
    }
    return keys;
  }

  private shiftHoursForAssignment(
    shift: string,
    shiftAllocations: EmployeeShiftAllocationRecord[],
    workstations: WorkstationRecord[],
  ): string | null {
    const assignedShift = shift.trim().toLocaleLowerCase();
    if (['off', 'hol', 'l'].includes(assignedShift)) {
      return '0h';
    }

    const shiftAllocation = shiftAllocations.find((record) =>
      [record.id, record.code, record.shift, record.name]
        .some((value) => value.trim().toLocaleLowerCase() === assignedShift),
    );
    if (shiftAllocation?.startTime && shiftAllocation.endTime) {
      return this.shiftDuration(shiftAllocation.startTime, shiftAllocation.endTime);
    }

    const workstation = workstations.find((record) =>
      [record.code, String(record.id), record.shift, record.name, record.description]
        .some((value) => value.trim().toLocaleLowerCase() === assignedShift),
    );
    if (!workstation) {
      return null;
    }

    return this.shiftDuration(workstation.officeInTime, workstation.officeOutTime);
  }

  private shiftDuration(startTime: string, endTime: string): string | null {
    const start = this.timeInMinutes(startTime);
    const end = this.timeInMinutes(endTime);
    if (start === null || end === null) {
      return null;
    }
    const duration = (end - start + 24 * 60) % (24 * 60);
    const hours = Math.floor(duration / 60);
    const minutes = duration % 60;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }

  private normalizeEmployeeKey(value: string): string {
    return canonicalizeEmployeeCodeValue(value).trim().toLocaleLowerCase();
  }

  private dateValue(value: string): string {
    return value.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
  }

  private localDateValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private isValidMonth(value: string): boolean {
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      return false;
    }
    const month = Number(match[2]);
    return month >= 1 && month <= 12;
  }

  private timeInMinutes(value: string): number | null {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
      return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
  }

  private durationToMinutes(value: string | null): number | null {
    if (!value?.trim()) {
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

  private isYes(value: unknown): boolean {
    return value === true || ['yes', 'true', '1'].includes(String(value ?? '').trim().toLocaleLowerCase());
  }
}
