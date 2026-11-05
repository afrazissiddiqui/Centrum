/** Maps route path (no leading slash) to the single HR portal shellbar title. */
const EXACT_TITLES: Record<string, string> = {
  dashboard: 'Home',
  profile: 'View profile',
  'forms-hub': 'All Forms',
  login: 'Sign in',
  recruitment: 'Recruitment',
  'recruitment/create': 'Application Form',
  'job-specification-form': 'Job Specification',
  'job-specification-form/create': 'Create Job Specification',
  'job-specification-form/edit': 'Update Job Specification',
  'employee-action': 'Employee Action',
  'employee-action/approval-authority-setup': 'Approval Setup',
  'employee-action/probation-evaluation-form': 'Probation Evaluation Form',
  'employee-action/probation-evaluation-form/create': 'Probation Evaluation Form',
  'employee-action/probation-evaluation-form/edit': 'Update Probation Evaluation',
  'employee-action/training-development-form': 'Training & Development Form',
  'employee-action/training-development-form/create': 'Training & Development Form',
  'employee-action/training-development-form/edit': 'Update Training & Development',
  'employee-action/performance-appraisal-form': 'Performance Appraisal Form',
  'employee-action/performance-appraisal-form/create': 'Performance Appraisal Form',
  'employee-action/performance-appraisal-form/edit': 'Update Performance Appraisal',
  'employee-action/expense-reimbursement-form': 'Expense Reimbursement Form',
  'employee-action/expense-reimbursement-form/create': 'Expense Reimbursement Form',
  'employee-action/expense-reimbursement-form/edit': 'Update Expense Reimbursement',
  'employee-action/loan-advance-form': 'Loan / Advance Form',
  'employee-action/loan-advance-form/create': 'Loan / Advance Form',
  'employee-action/leave-application-form': 'Leave Application Form',
  'employee-action/leave-application-form/create': 'Leave Application Form',
  'employee-action/leave-application-form/edit': 'Update Leave Request',
  termination: 'Employee Separation',
  'termination/create': 'Employee Separation Form',
  'payroll-master': 'Payroll Processing',
  'payroll-master/payroll-processing/create': 'New Payroll Process',
  'payroll-master/attendance-managment': 'Attendance Management',
  'payroll-master/tax-managment': 'Tax Allowance Form',
  'payroll-master/tax-computation': 'Tax Computation',
  'payroll-master/bonus': 'Bonus',
  'payroll-master/bonus/create': 'Add Bonus',
  // 'payroll-master/payroll-setup': 'Payroll Setup',
  miscellaneous: 'SAP Form',
  'miscellaneous/good-receipt-note': 'Good Receipt',
  'miscellaneous/good-receipt-note/create': 'Add Good Receipt',
  'miscellaneous/good-receipt-note/edit': 'Edit Good Receipt',
  'miscellaneous/receipt-from-production': 'Receipt from production',
  'miscellaneous/receipt-from-production/create': 'Add Receipt from Production',
  'miscellaneous/issue-from-production': 'Issue For Production',
  'miscellaneous/purchase-request': 'Purchase Request',
  'miscellaneous/crushed-risen-consumption': 'Crushed Risen Consumption List',
  'miscellaneous/crushed-risen-consumption/create': 'Crushed Risen Consumption',
  'miscellaneous/crushed-risen-consumption/edit': 'Update Crushed Risen Consumption',
  'miscellaneous/delivery': 'Delivery',
  'miscellaneous/inventory-transfer': 'Inventory transfer',
  'miscellaneous/good-issue': 'Good Issue',
  'miscellaneous/sample-inspection-request': 'Sample Inspection Request',
  'miscellaneous/sample-inspection-request/form': 'Sample Inspection Request',
  'gate-pass': 'Gate Pass',
  'gate-pass/ogp': 'OGP',
  'gate-pass/agp': 'AGP',
  'gate-pass/igp': 'IGP',
  'setup/gl-account-determination': 'GL Account Determination',
  'setup/leave-types': 'Leave Types',
  'setup/user-setup': 'User Setup',
  'setup/workstation': 'Workstation',
  'setup/kpi-setup': 'KPI Setup',
  'setup/kpi-setup/add': 'Add KPI',
  'setup/overtime-list': 'Overtime List',
  'setup/master-form': 'Master Form',
  'setup/withholding-tax': 'Withholding Tax',
  'setup/employee-roster': 'Employee Roster',
  'setup/issue-from-production-list': 'Issue For Production',
  'setup/issue-from-production': 'Issue For Production',
};

const PREFIX_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: 'gate-pass/ogp', title: 'OGP' },
  { prefix: 'gate-pass/agp', title: 'AGP' },
  { prefix: 'gate-pass/igp', title: 'IGP' },
  { prefix: 'payroll-master', title: 'Payroll Processing' },
  { prefix: 'miscellaneous', title: 'SAP Form' },
  { prefix: 'employee-action', title: 'Employee Action' },
  { prefix: 'termination', title: 'Employee Separation' },
  { prefix: 'job-specification-form', title: 'Job Specification' },
  { prefix: 'recruitment', title: 'Recruitment' },
  { prefix: 'gate-pass', title: 'Gate Pass' },
  { prefix: 'setup', title: 'Setup' },
];

const NON_SEARCH_ROUTE_KEYS = new Set([
  '',
  'login',
  'dashboard',
  'profile',
  'forms-hub',
  'employee-action/approval-authority-setup',
  'setup/gl-account-determination',
  'setup/leave-types',
  'setup/user-setup',
  'setup/workstation',
  'setup/overtime-list',
  'setup/master-form',
  'setup/issue-from-production-list',
  'setup/issue-from-production',
]);

export function isShellbarSearchRoute(routeKey: string): boolean {
  const key = routeKey.replace(/^\//, '').replace(/\/$/, '');
  if (NON_SEARCH_ROUTE_KEYS.has(key)) {
    return false;
  }
  if (/(^|\/)(create|edit)(\/|$)/.test(key)) {
    return false;
  }
  return true;
}

export function resolveShellbarSearchPlaceholder(routeKey: string): string {
  const title = resolveShellbarTitle(routeKey);
  return `Search ${title} list…`;
}

export function resolveShellbarTitle(routeKey: string): string {
  const key = routeKey.replace(/^\//, '').replace(/\/$/, '');
  if (!key) {
    return 'Home';
  }
  if (EXACT_TITLES[key]) {
    return EXACT_TITLES[key];
  }
  for (const { prefix, title } of PREFIX_TITLES) {
    if (key === prefix || key.startsWith(`${prefix}/`)) {
      return title;
    }
  }
  return 'Home';
}
