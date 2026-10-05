import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertService } from '../../../../services/alert.service';
import { PageToolbarComponent } from '../../../page-toolbar/page-toolbar';
import { PayrollMasterLayoutService } from '../payroll-master-layout.service';

@Component({
  selector: 'app-bonus-add',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PageToolbarComponent],
  templateUrl: './bonus-add.html',
  styleUrl: '../../Application-Form/Application-Form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .bonus-entry {
      display: flex;
      flex-direction: column;
      min-height: 0;
      flex: 1 1 auto;
    }
    .bonus-form-main {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 24px;
      background: #fff;
    }
    .bonus-form-heading {
      margin: 0 0 24px;
    }
    .bonus-form-heading h1 {
      margin: 0;
      color: #1d2d3e;
      font-size: 1.35rem;
      font-weight: 600;
    }
    .bonus-form-section {
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
    }
    .bonus-form-section h2 {
      margin: 0 0 18px;
      color: #32363a;
      font-size: 1rem;
      font-weight: 600;
    }
    .bonus-form-fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
      gap: 18px 20px;
      max-width: 1040px;
    }
    .bonus-form-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }
    .bonus-form-field label,
    .bonus-form-field__label {
      color: #32363a;
      font-size: 0.875rem;
      font-weight: 500;
    }
    .bonus-form-field input,
    .bonus-form-field output {
      box-sizing: border-box;
      width: 100%;
      min-height: 40px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 8px 10px;
      color: #1d2d3e;
      font: inherit;
    }
    .bonus-form-field input:focus {
      border-color: #0070f2;
      outline: 2px solid #0070f2;
      outline-offset: 1px;
    }
    .bonus-form-field output {
      display: flex;
      align-items: center;
      background: #f5f6f7;
      font-weight: 600;
    }
    .bonus-form-error {
      color: #b42318;
      font-size: 0.8rem;
    }
    @media (max-width: 600px) {
      .bonus-form-main {
        padding: 16px;
      }
    }
  `],
})
export class BonusAddComponent {
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  private readonly router = inject(Router);
  private readonly alertService = inject(AlertService);
  private readonly layout = inject(PayrollMasterLayoutService);

  readonly bonusForm = this.formBuilder.group({
    employeeId: ['', Validators.required],
    employeeName: ['', Validators.required],
    grossSalaryCash: [0, [Validators.required, Validators.min(0)]],
    grossSalaryBank: [0, [Validators.required, Validators.min(0)]],
    bonusCash: [0, [Validators.required, Validators.min(0)]],
    bonusBank: [0, [Validators.required, Validators.min(0)]],
  });

  get totalBonus(): number {
    return this.bonusForm.controls.bonusCash.value + this.bonusForm.controls.bonusBank.value;
  }

  toggleSidebar(): void {
    this.layout.toggleSidebar();
  }

  cancel(): void {
    void this.router.navigateByUrl('/payroll-master/bonus');
  }

  save(): void {
    if (this.bonusForm.invalid) {
      this.bonusForm.markAllAsTouched();
      return;
    }

    this.alertService.toast('Bonus API is not connected yet. The details were not saved.', 'info');
  }
}