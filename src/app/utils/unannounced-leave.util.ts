import { canonicalizeEmployeeCodeValue, type ApplicationFormRecord } from '../services/application-form.service';
import type { AttendanceDailyRecord } from '../services/attendance-management.service';
import type { LeaveApplicationRecord } from '../services/leave-application.service';

const UNANNOUNCED_LEAVE_TYPE = 'Unannounced Leave';

function normalizeEmployeeCode(value: string | null | undefined): string {
  const normalized = canonicalizeEmployeeCodeValue(String(value ?? '')).trim().toLowerCase();
  const numericCode = normalized.match(/^(?:emp[-\s]?)?(\d+)$/)?.[1];
  return numericCode ? `emp-${numericCode.padStart(8, '0')}` : normalized;
}

function normalizeLeaveType(value: string | undefined): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

function leaveApplicationCoversDate(application: LeaveApplicationRecord, date: string): boolean {
  const fromDate = application.FromDate.trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
  const toDate = application.ToDate.trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? '';
  return fromDate && toDate
    ? fromDate <= date && date <= toDate
    : application.RequestDate.trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] === date;
}

export function employeeShiftIsNotApplicable(employee: ApplicationFormRecord): boolean {
  const rawApplicability = (employee as ApplicationFormRecord & { EmployeeShiftApplicable?: unknown })
    .EmployeeShiftApplicable;
  const normalized = String(rawApplicability ?? '').trim().toLowerCase();
  if (rawApplicability === false || ['false', 'no', '0'].includes(normalized)) {
    return true;
  }
  if (rawApplicability === true || ['true', 'yes', '1'].includes(normalized)) {
    return false;
  }
  return String(employee.detail?.hrSettings?.attendanceShiftManagement ?? '').trim().toLowerCase() === 'no';
}

export function nonShiftUnannouncedLeaveDates(
  employeeCode: string,
  dates: string[],
  attendance: ReadonlyMap<string, Pick<AttendanceDailyRecord, 'PunchIn' | 'PunchOut'>>,
  publicHolidayDates: Iterable<string> = [],
  today = new Date(),
): string[] {
  const normalizedEmployeeCode = employeeCode.toLowerCase();
  const holidaySet = new Set(Array.from(publicHolidayDates, (value) => value.trim()).filter(Boolean));
  return dates.filter((date) => {
    const dateParts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const isSunday = dateParts
      ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])).getDay() === 0
      : false;
    if (holidaySet.has(date) || isSunday || !isRosterDateBeforeToday(date, today)) {
      return false;
    }
    const dailyAttendance = attendance.get(`${normalizedEmployeeCode}|${date}`);
    return !dailyAttendance?.PunchIn && !dailyAttendance?.PunchOut;
  });
}

export function unannouncedLeaveDatesNotCoveredByApplications(
  employeeCode: string,
  dates: string[],
  applications: LeaveApplicationRecord[],
): string[] {
  const employeeKey = normalizeEmployeeCode(employeeCode);
  return dates.filter((date) => !applications.some((application) =>
    normalizeEmployeeCode(application.EmployeeId) === employeeKey &&
    normalizeLeaveType(application.LeaveType) !== normalizeLeaveType(UNANNOUNCED_LEAVE_TYPE) &&
    !/reject|deny|cancel|void|deleted/i.test(application.RequestStatus) &&
    leaveApplicationCoversDate(application, date),
  ));
}

function isRosterDateBeforeToday(date: string, today: Date): boolean {
  const dateParts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateParts) {
    return false;
  }
  const rosterDate = new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]));
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return rosterDate < todayDate;
}
