import { LeaveApplicationRecord } from '../../../../services/leave-application.service';
import { canonicalAttendanceKey } from '../../../../services/attendance-management.service';

export interface PayrollLeaveDayCounts {
  paid: number;
  unpaid: number;
}

export function computeUnpaidLeaveDeduction(grossSalary: number, absentDays: number): number {
  if (!Number.isFinite(grossSalary) || !Number.isFinite(absentDays) || grossSalary <= 0 || absentDays <= 0) {
    return 0;
  }
  return Math.round(((grossSalary / 30) * absentDays) * 100) / 100;
}

export function payrollLeaveSearchEmployeeCode(employeeCode: string): string {
  const normalized = canonicalAttendanceKey(employeeCode);
  return /^\d+$/.test(normalized) ? `emp-${normalized}` : employeeCode.trim().toLowerCase();
}

export function countPayrollLeaveDays(
  records: Array<Pick<LeaveApplicationRecord, 'EmployeeId' | 'FromDate' | 'ToDate' | 'LeaveType'>>,
  payrollMonth: string,
): Map<string, PayrollLeaveDayCounts> {
  const [yearValue, monthValue] = payrollMonth.split('-').map(Number);
  if (!Number.isInteger(yearValue) || !Number.isInteger(monthValue) || monthValue < 1 || monthValue > 12) {
    return new Map();
  }

  const monthStart = Date.UTC(yearValue, monthValue - 1, 1) / 86400000;
  const monthEnd = Date.UTC(yearValue, monthValue, 0) / 86400000;
  const datesByEmployee = new Map<string, { paid: Set<number>; unpaid: Set<number> }>();

  for (const record of records) {
    const employeeKey = canonicalAttendanceKey(record.EmployeeId);
    const leaveStart = parseLeaveDay(record.FromDate);
    const leaveEnd = parseLeaveDay(record.ToDate);
    if (!employeeKey || leaveStart === null || leaveEnd === null) {
      continue;
    }

    const start = Math.max(monthStart, Math.min(leaveStart, leaveEnd));
    const end = Math.min(monthEnd, Math.max(leaveStart, leaveEnd));
    if (start > end) {
      continue;
    }

    const dates = datesByEmployee.get(employeeKey) ?? { paid: new Set<number>(), unpaid: new Set<number>() };
    const leaveType = record.LeaveType.trim().toLowerCase().replace(/[^a-z]/g, '');
    const target = leaveType === 'unannouncedleave' ? dates.unpaid : dates.paid;
    for (let day = start; day <= end; day += 1) {
      target.add(day);
    }
    datesByEmployee.set(employeeKey, dates);
  }

  const countsByEmployee = new Map<string, PayrollLeaveDayCounts>();
  for (const [employeeKey, dates] of datesByEmployee) {
    for (const day of dates.unpaid) {
      dates.paid.delete(day);
    }
    countsByEmployee.set(employeeKey, {
      paid: dates.paid.size,
      unpaid: dates.unpaid.size,
    });
  }

  return countsByEmployee;
}

function parseLeaveDay(value: string): number | null {
  const trimmed = value.trim();
  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const year = isoDate ? Number(isoDate[1]) : slashDate ? Number(slashDate[3]) : Number.NaN;
  const month = isoDate ? Number(isoDate[2]) : slashDate ? Number(slashDate[2]) : Number.NaN;
  const day = isoDate ? Number(isoDate[3]) : slashDate ? Number(slashDate[1]) : Number.NaN;

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return timestamp / 86400000;
}
