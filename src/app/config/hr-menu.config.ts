  import { AccessRequirement } from '../utils/access-requirement.util';

export interface HrMenuOption {
  label: string;
  value: string;
  icon: string;
  route?: string;
  /** Full URL for external apps (navigates away from this portal). */
  externalUrl?: string;
  children?: HrMenuOption[];
  access?: AccessRequirement;
}

export interface HrMenuAction {
  label: string;
  icon: string;
  route: string;
  value: string;
  access?: AccessRequirement;
}

/** HR shellbar dropdown — single source for navigation targets. */
export const HR_MENU_OPTIONS: HrMenuOption[] = [
  { label: 'Home', value: 'dashboard', icon: 'home', route: '/dashboard' },
  {
    label: 'HR',
    value: 'hr',
    icon: 'employee',
    children: [
      { label: 'Recruitment', value: 'recruitment', icon: 'employee-pane', route: '/recruitment', access: { anyOf: [{ moduleSlug: 'application_form', action: 'list' }, { moduleSlug: 'job_specification', action: 'list' }] } },
      { label: 'Employee Action', value: 'employee-action', icon: 'employee', route: '/employee-action', access: { anyOf: [
        { moduleSlug: 'probation_evaluation_form', action: 'list' },
        { moduleSlug: 'training_development_form', action: 'list' },
        { moduleSlug: 'performance_appraisal_form', action: 'list' },
        { moduleSlug: 'expense_reimbursment_form', action: 'list' },
        { moduleSlug: 'loan_advance_form', action: 'list' },
        { moduleSlug: 'leave_application_form', action: 'list' },
      ] } },
      { label: 'Payroll', value: 'payroll-master', icon: 'opportunities', route: '/payroll-master', access: { anyOf: [
        { moduleSlug: 'payroll_processing_form', action: 'list' },
        { moduleSlug: 'attendance_managment_form', action: 'list' },
        { moduleSlug: 'tax_allowance_form', action: 'list' },
        { moduleSlug: 'tax_computation_form', action: 'list' },
      ] } },
      { label: 'Employee Separation', value: 'Employee Separation', icon: 'feedback', route: '/termination', access: { moduleSlug: 'termination_form', action: 'list' } },
    ],
  },
  { label: 'Gate Pass', value: 'gate-pass/ogp', icon: 'shipping-status', route: '/gate-pass' },
  { label: 'SAP Form', value: 'miscellaneous', icon: 'grid', route: '/miscellaneous', access: { anyOf: [
    { moduleSlug: 'good_receipt_note_form', action: 'list' },
    { moduleSlug: 'good_issue_form', action: 'list' },
    { moduleSlug: 'delivery_form', action: 'list' },
    { moduleSlug: 'inventory_transfer_form', action: 'list' },
    { moduleSlug: 'inventory_transfer_request_form', action: 'list' },
    { moduleSlug: 'receipt_from_production_form', action: 'list' },
    { moduleSlug: 'issue_from_production_form', action: 'list' },
    { moduleSlug: 'purchase_request_form', action: 'list' },
  ] } },
  {
    label: 'Setup',
    value: 'setup',
    icon: 'settings',
    children: [
      {
        label: 'GL Account Determination',
        value: 'setup/gl-account-determination',
        icon: 'account',
        route: '/setup/gl-account-determination',
        access: { moduleSlug: 'gl_account_determination_form', action: 'list' },
      },
      {
        label: 'User Setup',
        value: 'setup/user-setup',
        icon: 'employee',
        route: '/setup/user-setup',
        access: { moduleSlug: 'user_setup_form', action: 'list' },
      },
      {
        label: 'Leave Types',
        value: 'setup/leave-types',
        icon: 'calendar',
        route: '/setup/leave-types',
        access: { moduleSlug: 'leave_types_form', action: 'list' },
      },
      {
        label: 'Workstation',
        value: 'setup/workstation',
        icon: 'building',
        route: '/setup/workstation',
        access: { moduleSlug: 'workstation_form', action: 'list' },
      },
      {
        label: 'KPI Setup',
        value: 'setup/kpi-setup',
        icon: 'bar-chart',
        route: '/setup/kpi-setup',
        access: { moduleSlug: 'itr_setup_form', action: 'add' },
      },
      {
        label: 'Overtime List',
        value: 'setup/overtime-list',
        icon: 'time-entry-request',
        route: '/setup/overtime-list',
        access: { moduleSlug: 'overtime_list_form', action: 'list' },
      },
      {
        label: 'Employee Shift Allocation',
        value: 'setup/master-form',
        icon: 'form',
        route: '/setup/master-form',
        access: { moduleSlug: 'master_form', action: 'list' },
      },
      {
        label: 'Withholding Tax',
        value: 'setup/withholding-tax',
        icon: 'money-bills',
        route: '/setup/withholding-tax',
        access: { moduleSlug: 'withholding_tax_form', action: 'list' },
      },
      {
        label: 'Employee Roster',
        value: 'setup/employee-roster',
        icon: 'employee',
        route: '/setup/employee-roster',
        access: { moduleSlug: 'employee_roster_form', action: 'list' },
      },
    ],
  },
  // { label: 'Continuous Performance', value: 'continuous-performance', icon: 'performance' },
  // { label: 'Development', value: 'development', icon: 'learning-assistant' },
  // { label: 'Goals', value: 'goals', icon: 'goal' },
  
  // { label: 'Learning', value: 'learning', icon: 'learning-assistant' },
  // { label: 'Org Chart', value: 'org-chart', icon: 'org-chart' },
  { label: 'Quality Control', value: 'quality-control', icon: 'performance', externalUrl: 'http://alhafiz.vdc.services:8082/dashboard' },
  // { label: 'Succession', value: 'succession', icon: 'family-care' },
];

/** Flat list of menu entries that have a route (for dashboard action bar, etc.). */
export function getNavigableHrMenuActions(options: HrMenuOption[] = HR_MENU_OPTIONS): HrMenuAction[] {
  const actions: HrMenuAction[] = [];

  for (const option of options) {
    if (option.value === 'login') {
      continue;
    }

    if (option.children?.length) {
      for (const child of option.children) {
        if (child.route) {
          actions.push({
            label: child.label,
            icon: child.icon,
            route: child.route,
            value: child.value,
            access: child.access,
          });
        }
      }
      continue;
    }

    if (option.route) {
      actions.push({
        label: option.label,
        icon: option.icon,
        route: option.route,
        value: option.value,
        access: option.access,
      });
    }
  }

  return actions;
}

/** Prefer Application Form when allowed; otherwise Job Specification. */
export function resolveRecruitmentRoute(
  canAccess: (requirement: AccessRequirement) => boolean,
): string {
  if (canAccess({ moduleSlug: 'application_form', action: 'list' })) {
    return '/recruitment';
  }
  if (canAccess({ moduleSlug: 'job_specification', action: 'list' })) {
    return '/job-specification-form';
  }
  return '/dashboard';
}