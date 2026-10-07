import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AlertService } from '../../../../services/alert.service';
import { ApplicationFormRecord, ApplicationFormService } from '../../../../services/application-form.service';
import { OvertimeListRecord, OvertimeListService } from '../../../../services/overtime-list.service';
import { formatApiErrorMessage } from '../../../../utils/api-error.util';

interface OvertimeEmployee extends ApplicationFormRecord {
  flag: '0' | '1';
  overtimeStatus: 'Not Posted' | 'Approved';
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
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly posting = signal(false);
  readonly searchText = signal('');
  readonly employees = signal<OvertimeEmployee[]>([]);
  readonly selectedEmployeeKeys = signal<ReadonlySet<string>>(new Set());
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
    }).subscribe({
      next: ({ employees, overtimeRecords }) => {
        const postedEmployeeKeys = this.postedEmployeeKeys(overtimeRecords);
        this.employees.set(employees.map((employee) => {
          const isPosted = postedEmployeeKeys.has(employee.EmployeeCode) ||
            (!!employee.apiId && postedEmployeeKeys.has(employee.apiId));
          return {
            ...employee,
            flag: isPosted ? '1' : '0',
            overtimeStatus: isPosted ? 'Approved' : 'Not Posted',
          };
        }));
        this.loading.set(false);
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

  private isYes(value: unknown): boolean {
    return value === true || ['yes', 'true', '1'].includes(String(value ?? '').trim().toLocaleLowerCase());
  }
}
