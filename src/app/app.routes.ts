import { Routes } from '@angular/router';
import { loginRoutes } from './components/login/login.routes';
import { authGuard } from './guards/auth.guard';
import { requireAccess, requirePermission } from './guards/permission.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./components/dashboard/dashboard').then((m) => m.dashboardComponent),
    canActivate: [authGuard],
  },
  ...loginRoutes,
  {
    path: 'profile',
    loadComponent: () => import('./components/profile/profile-page').then((m) => m.ProfilePageComponent),
    canActivate: [authGuard],
  },
  {
    path: 'forms-hub',
    loadComponent: () => import('./components/forms-hub/forms-hub').then((m) => m.FormsHubComponent),
    canActivate: [authGuard],
  },
  {
    path: 'recruitment',
    loadComponent: () => import('./components/HR-Portal/Application-Form/recruitment').then((m) => m.RecruitmentComponent),
    canActivate: [authGuard, requirePermission('application_form', 'list')],
  },
  {
    path: 'recruitment/create',
    loadComponent: () => import('./components/HR-Portal/Application-Form/create-job-requisition/create-job-requisition').then((m) => m.CreateJobRequisitionComponent),
    canActivate: [authGuard, requirePermission('application_form', 'add')],
  },
  {
    path: 'recruitment/edit/:id',
    loadComponent: () => import('./components/HR-Portal/Application-Form/create-job-requisition/create-job-requisition').then((m) => m.CreateJobRequisitionComponent),
    canActivate: [authGuard, requirePermission('application_form', 'update')],
  },
  {
    path: 'job-specification-form',
    loadComponent: () => import('./components/HR-Portal/job-specification-form/job-specification-form').then((m) => m.JobSpecificationFormComponent),
    canActivate: [authGuard, requirePermission('job_specification', 'list')],
  },
  {
    path: 'job-specification-form/create',
    loadComponent: () => import('./components/HR-Portal/job-specification-form/create-job-specification/create-job-specification').then((m) => m.CreateJobSpecificationComponent),
    canActivate: [authGuard, requirePermission('job_specification', 'add')],
  },
  {
    path: 'job-specification-form/edit/:id',
    loadComponent: () => import('./components/HR-Portal/job-specification-form/create-job-specification/create-job-specification').then((m) => m.CreateJobSpecificationComponent),
    canActivate: [authGuard, requirePermission('job_specification', 'update')],
  },
  {
    path: '',
    loadChildren: () => import('./components/gate-pass/gate-pass.routes').then((m) => m.gatePassRoutes),
    canActivate: [authGuard],
  },
  {
    path: 'employee-action',
    loadComponent: () => import('./components/HR-Portal/employee-action/employee-action').then((m) => m.EmployeeActionComponent),
    canActivate: [
      authGuard,
      requireAccess(
        {
          anyOf: [
            { moduleSlug: 'probation_evaluation_form', action: 'list' },
            { moduleSlug: 'training_development_form', action: 'list' },
            { moduleSlug: 'performance_appraisal_form', action: 'list' },
            { moduleSlug: 'expense_reimbursment_form', action: 'list' },
            { moduleSlug: 'loan_advance_form', action: 'list' },
            { moduleSlug: 'leave_application_form', action: 'list' },
          ],
        },
        'probation_evaluation_form',
        'list',
      ),
    ],
  },
  {
    path: '',
    loadChildren: () => import('./components/HR-Portal/payroll-master/payroll-master.routes').then((m) => m.payrollMasterRoutes),
    canActivate: [authGuard],
  },
  {
    path: 'employee-action/probation-evaluation-form',
    loadComponent: () => import('./components/HR-Portal/employee-action/probation-evaluation-form/probation-evaluation-form').then((m) => m.ProbationEvaluationFormComponent),
    canActivate: [authGuard, requirePermission('probation_evaluation_form', 'list')],
  },
  {
    path: 'employee-action/probation-evaluation-form/create',
    loadComponent: () => import('./components/HR-Portal/employee-action/probation-evaluation-form/add-probation-evaluation/add-probation-evaluation').then((m) => m.AddProbationEvaluationComponent),
    canActivate: [authGuard, requirePermission('probation_evaluation_form', 'add')],
  },
  {
    path: 'employee-action/probation-evaluation-form/edit/:id',
    loadComponent: () => import('./components/HR-Portal/employee-action/probation-evaluation-form/add-probation-evaluation/add-probation-evaluation').then((m) => m.AddProbationEvaluationComponent),
    canActivate: [authGuard, requirePermission('probation_evaluation_form', 'update')],
  },
  {
    path: 'employee-action/training-development-form',
    loadComponent: () => import('./components/HR-Portal/employee-action/training-development-form/training-development-form').then((m) => m.TrainingDevelopmentFormComponent),
    canActivate: [authGuard, requirePermission('training_development_form', 'list')],
  },
  {
    path: 'employee-action/training-development-form/create',
    loadComponent: () => import('./components/HR-Portal/employee-action/training-development-form/add-training-development/add-training-development').then((m) => m.AddTrainingDevelopmentComponent),
    canActivate: [authGuard, requirePermission('training_development_form', 'add')],
  },
  {
    path: 'employee-action/training-development-form/edit/:id',
    loadComponent: () => import('./components/HR-Portal/employee-action/training-development-form/add-training-development/add-training-development').then((m) => m.AddTrainingDevelopmentComponent),
    canActivate: [authGuard, requirePermission('training_development_form', 'update')],
  },
  {
    path: 'employee-action/performance-appraisal-form',
    loadComponent: () => import('./components/HR-Portal/employee-action/performance-appraisal-form/performance-appraisal-form').then((m) => m.PerformanceAppraisalFormComponent),
    canActivate: [authGuard, requirePermission('performance_appraisal_form', 'list')],
  },
  {
    path: 'employee-action/performance-appraisal-form/create',
    loadComponent: () => import('./components/HR-Portal/employee-action/performance-appraisal-form/add-performance-appraisal/add-performance-appraisal').then((m) => m.AddPerformanceAppraisalComponent),
    canActivate: [authGuard, requirePermission('performance_appraisal_form', 'add')],
  },
  {
    path: 'employee-action/performance-appraisal-form/edit/:id',
    loadComponent: () => import('./components/HR-Portal/employee-action/performance-appraisal-form/add-performance-appraisal/add-performance-appraisal').then((m) => m.AddPerformanceAppraisalComponent),
    canActivate: [authGuard, requirePermission('performance_appraisal_form', 'update')],
  },
  {
    path: 'employee-action/expense-reimbursement-form',
    loadComponent: () => import('./components/HR-Portal/employee-action/expense-reimbursment-form/expense-reimbursment-form').then((m) => m.ExpenseReimbursmentFormComponent),
    canActivate: [authGuard, requirePermission('expense_reimbursment_form', 'list')],
  },
  {
    path: 'employee-action/expense-reimbursement-form/create',
    loadComponent: () => import('./components/HR-Portal/employee-action/expense-reimbursment-form/add-expense-reimbursment/add-expense-reimbursment').then((m) => m.AddExpenseReimbursmentComponent),
    canActivate: [authGuard, requirePermission('expense_reimbursment_form', 'add')],
  },
  {
    path: 'employee-action/expense-reimbursement-form/edit/:id',
    loadComponent: () => import('./components/HR-Portal/employee-action/expense-reimbursment-form/add-expense-reimbursment/add-expense-reimbursment').then((m) => m.AddExpenseReimbursmentComponent),
    canActivate: [authGuard, requirePermission('expense_reimbursment_form', 'update')],
  },
  {
    path: 'employee-action/loan-advance-form',
    loadComponent: () => import('./components/HR-Portal/employee-action/loan-advance-form/loan-advance-form').then((m) => m.LoanAdvanceFormComponent),
    canActivate: [authGuard, requirePermission('loan_advance_form', 'list')],
  },
  {
    path: 'employee-action/leave-application-form',
    loadComponent: () => import('./components/HR-Portal/employee-action/leave-application-form/leave-application-form').then((m) => m.LeaveApplicationFormComponent),
    canActivate: [authGuard, requirePermission('leave_application_form', 'list')],
  },
  {
    path: 'employee-action/loan-advance-form/create',
    loadComponent: () => import('./components/HR-Portal/employee-action/loan-advance-form/add-loan-advance/add-loan-advance').then((m) => m.AddLoanAdvanceComponent),
    canActivate: [authGuard, requirePermission('loan_advance_form', 'add')],
  },
  {
    path: 'employee-action/loan-advance-form/edit/:id',
    loadComponent: () => import('./components/HR-Portal/employee-action/loan-advance-form/add-loan-advance/add-loan-advance').then((m) => m.AddLoanAdvanceComponent),
    canActivate: [authGuard, requirePermission('loan_advance_form', 'update')],
  },
  {
    path: 'employee-action/leave-application-form/create',
    loadComponent: () => import('./components/HR-Portal/employee-action/leave-application-form/add-leave-application/add-leave-application').then((m) => m.AddLeaveApplicationComponent),
    canActivate: [authGuard, requirePermission('leave_application_form', 'add')],
  },
  {
    path: 'employee-action/leave-application-form/edit/:id',
    loadComponent: () => import('./components/HR-Portal/employee-action/leave-application-form/add-leave-application/add-leave-application').then((m) => m.AddLeaveApplicationComponent),
    canActivate: [authGuard, requirePermission('leave_application_form', 'update')],
  },
  {
    path: 'employee-action/approval-authority-setup',
    loadComponent: () => import('./components/HR-Portal/employee-action/approval-authority-setup/approval-authority-setup').then((m) => m.ApprovalAuthoritySetupComponent),
    canActivate: [authGuard],
  },
  {
    path: 'setup/gl-account-determination',
    loadComponent: () => import('./components/setup/gl-account-determination/gl-account-determination').then((m) => m.GlAccountDeterminationComponent),
    canActivate: [authGuard, requirePermission('gl_account_determination_form', 'list')],
  },
  {
    path: 'setup/leave-types',
    loadComponent: () => import('./components/setup/leave-types/leave-types').then((m) => m.LeaveTypesComponent),
    canActivate: [authGuard, requirePermission('leave_types_form', 'list')],
  },
  {
    path: 'setup/user-setup',
    loadComponent: () => import('./components/setup/user-setup/user-setup').then((m) => m.UserSetupComponent),
    canActivate: [authGuard, requirePermission('user_setup_form', 'list')],
  },
  {
    path: 'setup/workstation',
    loadComponent: () => import('./components/setup/workstation/workstation').then((m) => m.WorkstationComponent),
    canActivate: [authGuard, requirePermission('workstation_form', 'list')],
  },
  {
    path: 'setup/kpi-setup/add',
    loadComponent: () => import('./components/setup/kpi-setup/add-kpi-setup/add-kpi-setup').then((m) => m.AddKpiSetupComponent),
    canActivate: [authGuard],
  },
  {
    path: 'setup/kpi-setup/:id/edit',
    loadComponent: () => import('./components/setup/kpi-setup/edit-kpi-setup/edit-kpi-setup').then((m) => m.EditKpiSetupComponent),
    canActivate: [authGuard],
  },
  {
    path: 'setup/kpi-setup',
    loadComponent: () => import('./components/setup/kpi-setup/kpi-setup').then((m) => m.KpiSetupComponent),
    canActivate: [authGuard],
  },
  {
    path: 'setup/overtime-list/add',
    loadComponent: () => import('./components/setup/overtime-list/add-overtime/add-overtime').then((m) => m.AddOvertimeComponent),
    canActivate: [authGuard, requirePermission('overtime_list_form', 'list')],
  },
  {
    path: 'setup/overtime-list',
    loadComponent: () => import('./components/setup/overtime-list/overtime-list').then((m) => m.OvertimeListComponent),
    canActivate: [authGuard, requirePermission('overtime_list_form', 'list')],
  },
  {
    path: 'setup/master-form',
    loadComponent: () => import('./components/setup/master-form/master-form').then((m) => m.MasterFormComponent),
    canActivate: [authGuard, requirePermission('master_form', 'list')],
  },
  {
    path: 'setup/withholding-tax',
    loadComponent: () => import('./components/setup/withholding-tax/withholding-tax').then((m) => m.WithholdingTaxComponent),
    canActivate: [authGuard, requirePermission('withholding_tax_form', 'list')],
  },
  {
    path: 'setup/employee-roster',
    loadComponent: () => import('./components/setup/employee-roster/employee-roster').then((m) => m.EmployeeRosterComponent),
    canActivate: [authGuard, requirePermission('employee_roster_form', 'list')],
  },
  {
    path: 'setup/issue-from-production-list',
    loadComponent: () => import('./components/setup/issue-from-production-list/issue-from-production-list').then((m) => m.IssueFromProductionListComponent),
    canActivate: [authGuard, requirePermission('good_issue_form', 'list')],
  },
  {
    path: 'setup/issue-from-production',
    loadComponent: () => import('./components/setup/issue-from-production/issue-from-production').then((m) => m.IssueFromProductionComponent),
    canActivate: [authGuard, requirePermission('good_issue_form', 'add')],
  },
  {
    path: 'setup/purchase-request',
    loadComponent: () => import('./components/setup/purchase-request/purchase-request').then((m) => m.PurchaseRequestComponent),
    canActivate: [authGuard],
  },
  {
    path: 'setup/purchase-order-list',
    redirectTo: 'miscellaneous/purchase-request',
    pathMatch: 'full',
  },
  {
    path: 'termination',
    loadComponent: () => import('./components/HR-Portal/termination/termination-form').then((m) => m.TerminationFormComponent),
    canActivate: [authGuard, requirePermission('termination_form', 'list')],
  },
  {
    path: 'termination/create',
    loadComponent: () => import('./components/HR-Portal/termination/add-termination/add-termination').then((m) => m.AddTerminationComponent),
    canActivate: [authGuard, requirePermission('termination_form', 'add')],
  },
  {
    path: 'termination/edit/:id',
    loadComponent: () => import('./components/HR-Portal/termination/add-termination/add-termination').then((m) => m.AddTerminationComponent),
    canActivate: [authGuard, requirePermission('termination_form', 'update')],
  },
  {
    path: '',
    loadChildren: () => import('./components/Plant-Maintenance/plant-maintenance.routes').then((m) => m.plantMaintenanceRoutes),
    canActivate: [authGuard],
  },
  {
    path: '',
    loadChildren: () => import('./components/miscellaneous/miscellaneous.routes').then((m) => m.miscellaneousRoutes),
    canActivate: [authGuard],
  },
];
