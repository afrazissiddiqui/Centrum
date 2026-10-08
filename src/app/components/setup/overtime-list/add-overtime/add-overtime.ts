import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, from, of, Subscription } from 'rxjs';
import { catchError, finalize, map, mergeMap } from 'rxjs/operators';
import { AttendanceManagementService } from '../../../../services/attendance-management.service';
import { AlertService } from '../../../../services/alert.service';
import {
  ApplicationFormRecord,
  ApplicationFormService,
  EmployeeRosterListRecord,
  canonicalizeEmployeeCodeValue,
} from '../../../../services/application-form.service';
import { OvertimeListRecord, OvertimeListService } from '../../../../services/overtime-list.service';
import { WorkstationRecord, WorkstationService } from '../../../../services/workstation.service';
import { formatApiErrorMessage } from '../../../../utils/api-error.util';

interface OvertimeEmployee extends ApplicationFormRecord {
  flag: '0' | '1';
  overtimeStatus: 'Not Posted' | 'Approved';
  workingHours: string | null;
  shiftHours: string | null;
  rangeOvertimeHours: string | null;
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
  private readonly overtimeListService = inject(OvertimeListService);
  private readonly attendanceService = inject(AttendanceManagementService);
  private readonly workstationService = inject(WorkstationService);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly hoursLoading = signal(false);
  readonly posting = signal(false);
  readonly searchText = signal('');
  readonly selectedDate = signal(this.localDateValue(new Date()));
  readonly overtimeFromDate = signal(this.firstDayOfCurrentMonth());
  readonly overtimeToDate = signal(this.todayDate());
  readonly employees = signal<OvertimeEmployee[]>([]);
  readonly selectedEmployeeKeys = signal<ReadonlySet<string>>(new Set());
  private rosterRecords: EmployeeRosterListRecord[] = [];
  private workstations: WorkstationRecord[] = [];
  private readonly rangeHoursCache = new Map<string, Array<{ date: string; hoursWorked: string }>>();
  private hoursRequestId = 0;
  private hoursSubscription: Subscription | null = null;
  readonly filteredEmployees = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase();
    const eligibleEmployees = this.employees().filter((employee) =>
      employee.flag === '0' &&
      this.isYes(employee.detail?.hrSettings.attendanceShiftManagement) &&
      this.isYes(employee.detail?.remuneration.overTimeApplicable),
    );

    if (!query) {
      return eligibleEmployees;
    }

    return eligibleEmployees.filter((employee) =>
      [employee.EmployeeCode, employee.EmployeeName, employee.Department, employee.Designation]
        .some((value) => value.toLocaleLowerCase().includes(query)),
    );
  });

  ngOnInit(): void {
    this.loadEmployees();
  }

  onSearchChange(value: string): void {
    this.searchText.set(value);
  }

  onDateChange(value: string): void {
    if (!this.isValidDate(value)) {
      return;
    }
    this.selectedDate.set(value);
    this.employees.update((employees) => employees.map((employee) => ({
      ...employee,
      workingHours: null,
      shiftHours: this.shiftHoursForEmployee(employee, value, this.rosterRecords, this.workstations),
    })));
    this.loadMonthlyOvertime();
  }

  onOvertimeFromDateChange(value: string): void {
    this.overtimeFromDate.set(value);
    this.resetRangeOvertime();
  }

  onOvertimeToDateChange(value: string): void {
    this.overtimeToDate.set(value);
    this.resetRangeOvertime();
  }

  setTodayDate(): void {
    this.onDateChange(this.todayDate());
  }

  todayDate(): string {
    return this.localDateValue(new Date());
  }

  overtimeRangeError(): string {
    const fromDate = this.overtimeFromDate();
    const toDate = this.overtimeToDate();
    if (!this.isValidDate(fromDate) || !this.isValidDate(toDate)) {
      return 'Select valid start and end dates to calculate range overtime.';
    }
    return fromDate > toDate ? 'The start date must be on or before the end date.' : '';
  }

  private firstDayOfCurrentMonth(): string {
    const today = new Date();
    return this.localDateValue(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  overtimeHours(employee: OvertimeEmployee): string {
    const workingMinutes = this.durationToMinutes(employee.workingHours);
    const shiftMinutes = this.durationToMinutes(employee.shiftHours);
    if (workingMinutes === null || shiftMinutes === null) {
      return '—';
    }
    return this.formatDuration(Math.max(0, workingMinutes - shiftMinutes));
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
  }

  goToList(): void {
    void this.router.navigate(['/setup/overtime-list']);
  }

  postSelectedEmployees(): void {
    const employeesToPost = this.employees().filter((employee) =>
      employee.flag === '0' && this.selectedEmployeeKeys().has(this.employeeKey(employee)),
    );
    if (!employeesToPost.length || this.posting()) {
      return;
    }

    this.posting.set(true);
    forkJoin(employeesToPost.map((employee) =>
      this.overtimeListService.postOvertimeEmployee([{
        employee_code: employee.EmployeeCode,
        employee_name: employee.EmployeeName,
        overtime_date: '2026-10-01',
        shift_id: '1',
        working_hours: 8,
        shift_hours: 8,
        overtime_hours: 0,
        overtime_rate: 0,
        exceptional_ot: 0,
        flag: '1',
      }]).pipe(
        map(() => ({ employee, success: true as const })),
        catchError((error: unknown) => of({
          employee,
          success: false as const,
          errorMessage: formatApiErrorMessage(error, 'Post failed.'),
        })),
      ),
    )).subscribe((results) => {
      const successfulKeys = new Set(
        results.filter((result) => result.success).map((result) => this.employeeKey(result.employee)),
      );
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
      roster: this.applicationFormService.fetchEmployeeRosterList(),
      workstations: this.workstationService.fetchWorkstations(),
    }).subscribe({
      next: ({ employees, overtimeRecords, roster, workstations }) => {
        this.rosterRecords = roster;
        this.workstations = workstations;
        const postedEmployeeKeys = this.postedEmployeeKeys(overtimeRecords);
        const date = this.selectedDate();
        this.employees.set(employees.map((employee) => {
          const isPosted = postedEmployeeKeys.has(employee.EmployeeCode) ||
            (!!employee.apiId && postedEmployeeKeys.has(employee.apiId));
          return {
            ...employee,
            flag: isPosted ? '1' : '0',
            overtimeStatus: isPosted ? 'Approved' : 'Not Posted',
            workingHours: null,
            shiftHours: this.shiftHoursForEmployee(employee, date, roster, workstations),
            rangeOvertimeHours: null,
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

  private loadMonthlyOvertime(): void {
    this.hoursSubscription?.unsubscribe();
    const requestId = ++this.hoursRequestId;
    const date = this.selectedDate();
    const fromDate = this.overtimeFromDate();
    const toDate = this.overtimeToDate();
    if (!this.isValidDate(fromDate) || !this.isValidDate(toDate) || fromDate > toDate) {
      this.hoursLoading.set(false);
      this.employees.update((employees) => employees.map((employee) => ({
        ...employee,
        rangeOvertimeHours: null,
      })));
      return;
    }

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
        const cacheKey = `${fromDate}:${toDate}:${legacyCode}`;
        const cached = this.rangeHoursCache.get(cacheKey);
        const hoursByDate$ = cached !== undefined
          ? of(cached)
          : this.attendanceService.fetchCalculatedWorkingHoursByDate(
            { mode: 'dateRange', fromDate, toDate },
            legacyCode,
          ).pipe(
            map((hoursByDate) => {
              this.rangeHoursCache.set(cacheKey, hoursByDate);
              return hoursByDate;
            }),
            catchError(() => of(null)),
          );
        return hoursByDate$.pipe(
          mergeMap((hoursByDate) => {
            const selectedDateHours = hoursByDate?.find((item) => item.date === date)?.hoursWorked;
            const selectedDayHours$ =
              hoursByDate !== null && date >= fromDate && date <= toDate
                ? of(selectedDateHours ?? null)
                : this.attendanceService.fetchCalculatedWorkingHours({ mode: 'date', date }, legacyCode);
            return selectedDayHours$.pipe(map((workingHours) => ({
              employee,
              workingHours,
              rangeOvertimeHours: hoursByDate
                ? this.calculateOvertimeInRange(employee, hoursByDate, fromDate, toDate)
                : null,
            })));
          }),
        );
      }, 6),
      finalize(() => {
        if (requestId === this.hoursRequestId) {
          this.hoursLoading.set(false);
        }
      }),
    ).subscribe(({ employee, workingHours, rangeOvertimeHours }) => {
      if (
        requestId !== this.hoursRequestId ||
        date !== this.selectedDate() ||
        fromDate !== this.overtimeFromDate() ||
        toDate !== this.overtimeToDate()
      ) {
        return;
      }
      const key = this.employeeKey(employee);
      this.employees.update((current) => current.map((item) =>
        this.employeeKey(item) === key
          ? {
              ...item,
              workingHours,
              rangeOvertimeHours: rangeOvertimeHours === null
                ? null
                : this.formatDuration(rangeOvertimeHours),
            }
          : item,
      ));
    });
  }

  private resetRangeOvertime(): void {
    this.employees.update((employees) => employees.map((employee) => ({
      ...employee,
      rangeOvertimeHours: null,
    })));
    this.loadMonthlyOvertime();
  }

  private calculateOvertimeInRange(
    employee: OvertimeEmployee,
    hoursByDate: Array<{ date: string; hoursWorked: string }>,
    fromDate: string,
    toDate: string,
  ): number {
    const dailyHours = new Map(hoursByDate.map((item) => [item.date, item.hoursWorked]));
    let totalOvertimeMinutes = 0;
    for (const [date, hoursWorked] of dailyHours) {
      if (date < fromDate || date > toDate) {
        continue;
      }
      const workedMinutes = this.durationToMinutes(hoursWorked);
      if (workedMinutes === null || workedMinutes === 0) {
        continue;
      }
      const shiftHours = this.shiftHoursForEmployee(employee, date, this.rosterRecords, this.workstations);
      const shiftMinutes = this.durationToMinutes(shiftHours);
      if (shiftMinutes === null) {
        continue;
      }
      totalOvertimeMinutes += Math.max(0, workedMinutes - shiftMinutes);
    }
    return totalOvertimeMinutes;
  }

  private postedEmployeeKeys(records: OvertimeListRecord[]): Set<string> {
    const keys = new Set<string>();
    for (const record of records) {
      const values = record.values;
      const employeeKey = values['employeeId'] ?? values['employee_id'] ??
        values['employeeCode'] ?? values['employee_code'] ?? values['EmployeeCode'];
      if (employeeKey !== undefined && employeeKey !== null && String(employeeKey).trim()) {
        keys.add(String(employeeKey).trim());
      }
    }
    return keys;
  }

  private shiftHoursForEmployee(
    employee: ApplicationFormRecord,
    date: string,
    roster: EmployeeRosterListRecord[],
    workstations: WorkstationRecord[],
  ): string | null {
    const employeeCode = this.normalizeEmployeeKey(employee.EmployeeCode);
    const assignment = roster.find((entry) =>
      this.normalizeEmployeeKey(entry.employee_id) === employeeCode &&
      this.dateValue(entry.shift_date) === date,
    );
    if (!assignment) {
      return null;
    }

    const assignedShift = assignment.shift.trim().toLocaleLowerCase();
    if (['off', 'hol', 'l'].includes(assignedShift)) {
      return '0h';
    }

    const workstation = workstations.find((record) =>
      [record.code, String(record.id), record.shift, record.name, record.description]
        .some((value) => value.trim().toLocaleLowerCase() === assignedShift),
    );
    if (!workstation) {
      return null;
    }

    const start = this.timeInMinutes(workstation.officeInTime);
    const end = this.timeInMinutes(workstation.officeOutTime);
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

  private isValidDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && this.localDateValue(date) === value;
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
