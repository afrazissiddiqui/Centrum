import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertService } from '../../../../services/alert.service';
import { ApplicationFormRecord, ApplicationFormService } from '../../../../services/application-form.service';
import { formatApiErrorMessage } from '../../../../utils/api-error.util';

@Component({
  selector: 'app-add-overtime',
  imports: [CommonModule, FormsModule],
  templateUrl: './add-overtime.html',
  styleUrl: './add-overtime.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddOvertimeComponent implements OnInit {
  private readonly applicationFormService = inject(ApplicationFormService);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly searchText = signal('');
  readonly employees = signal<ApplicationFormRecord[]>([]);
  readonly filteredEmployees = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase();
    const eligibleEmployees = this.employees().filter((employee) =>
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

  goToList(): void {
    void this.router.navigate(['/setup/overtime-list']);
  }

  private loadEmployees(): void {
    this.loading.set(true);
    this.applicationFormService.fetchEmployeeProfiles().subscribe({
      next: (employees) => {
        this.employees.set(employees);
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

  private isYes(value: unknown): boolean {
    return value === true || ['yes', 'true', '1'].includes(String(value ?? '').trim().toLocaleLowerCase());
  }
}
