import { SidebarItem, SidebarSection } from '../../sidebar/sidebar';

export const PAYROLL_MASTER_SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'payroll-processing', label: 'Payroll Processing', route: '/payroll-master', access: { moduleSlug: 'payroll_processing_form', action: 'list' } }
];

export const PAYROLL_MASTER_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    id: 'payroll-sub-modules',
    title: 'Payroll Sub Modules',
    items: [
      { id: 'attendance-managment', label: 'Attendance Managment', route: '/payroll-master/attendance-managment', access: { moduleSlug: 'attendance_managment_form', action: 'list' } },
      { id: 'unpaid-leave', label: 'Unpaid Leave', route: '/payroll-master/unpaid-leave', access: { moduleSlug: 'employee_roster_form', action: 'list' } },
      { id: 'tax-managment', label: 'Tax Allowance Form', route: '/payroll-master/tax-managment', access: { moduleSlug: 'tax_allowance_form', action: 'list' } },
      { id: 'tax-computation', label: 'Tax Computation', route: '/payroll-master/tax-computation', access: { moduleSlug: 'tax_computation_form', action: 'list' } },
      { id: 'bonus', label: 'Bonus', route: '/payroll-master/bonus', access: { moduleSlug: 'tax_computation_form', action: 'list' } },
      // { id: 'payroll-setup', label: 'Payroll Setup', route: '/payroll-master/payroll-setup' }
    ]
  }
];

export function payrollMasterActiveItemFromUrl(url: string): string {
  if (url.includes('/payroll-master/attendance-managment')) {
    return 'attendance-managment';
  }
  if (url.includes('/payroll-master/unpaid-leave')) {
    return 'unpaid-leave';
  }
  if (url.includes('/payroll-master/tax-managment')) {
    return 'tax-managment';
  }
  if (url.includes('/payroll-master/tax-computation')) {
    return 'tax-computation';
  }
  if (url.includes('/payroll-master/bonus')) {
    return 'bonus';
  }
  // if (url.includes('/payroll-master/payroll-setup')) {
  //   return 'payroll-setup';
  // }
  return 'payroll-processing';
}
