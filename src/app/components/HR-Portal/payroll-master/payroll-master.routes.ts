import { Routes } from '@angular/router';
import { requireAccess, requirePermission } from '../../../guards/permission.guard';
import { PayrollMasterShellComponent } from './payroll-master-shell';
import { PayrollProcessingComponent } from './payroll-processing/payroll-processing';
import { AddPayrollProcessComponent } from './payroll-processing/add-payroll-process/add-payroll-process';
import { AttendanceManagmentComponent } from './attendance-managment/attendance-managment';
import { TaxManagmentComponent } from './tax-managment/tax-managment';
import { TaxComputationComponent } from './tax-computation/tax-computation';
import { BonusComponent } from './bonus/bonus';
import { BonusAddComponent } from './bonus/bonus-add';

export const payrollMasterRoutes: Routes = [
  {
    path: 'payroll-master',
    component: PayrollMasterShellComponent,
    canActivate: [
      requireAccess(
        {
          anyOf: [
            { moduleSlug: 'payroll_processing_form', action: 'list' },
            { moduleSlug: 'attendance_managment_form', action: 'list' },
            { moduleSlug: 'tax_allowance_form', action: 'list' },
            { moduleSlug: 'tax_computation_form', action: 'list' },
          ],
        },
        'payroll_processing_form',
        'list',
      ),
    ],
    children: [
      { path: '', component: PayrollProcessingComponent, canActivate: [requirePermission('payroll_processing_form', 'list')] },
      { path: 'payroll-processing/create', component: AddPayrollProcessComponent, canActivate: [requirePermission('payroll_processing_form', 'add')] },
      { path: 'attendance-managment', component: AttendanceManagmentComponent, canActivate: [requirePermission('attendance_managment_form', 'list')] },
      { path: 'tax-managment', component: TaxManagmentComponent, canActivate: [requirePermission('tax_allowance_form', 'list')] },
      { path: 'tax-computation', component: TaxComputationComponent, canActivate: [requirePermission('tax_computation_form', 'list')] },
      { path: 'bonus/create', component: BonusAddComponent, canActivate: [requirePermission('tax_computation_form', 'add')] },
      { path: 'bonus', component: BonusComponent, canActivate: [requirePermission('tax_computation_form', 'list')] },
    ],
  },
];
