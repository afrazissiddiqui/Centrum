import type { LeaveApplicationRecord } from '../services/leave-application.service';
import type { AttendanceDailyRecord } from '../services/attendance-management.service';
import type { EmployeeRosterListRecord } from '../services/application-form.service';
import type { WorkstationRecord } from '../services/workstation.service';

function normalizeEmployeeId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^emp[-\s]?/, '');
  return /^\d+$/.test(normalized)
    ? `emp-${normalized.padStart(8, '0')}`
    : normalized;
}

export function countUnannouncedLeaveDaysForYear(
  applications: LeaveApplicationRecord[],
  employeeId: string,
  year: number,
  today = new Date(),
): number {
  const normalizedEmployeeId = normalizeEmployeeId(employeeId);
  const yearStart = `${year}-01-01`;
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  const yearEnd = todayString < `${year}-12-31` ? todayString : `${year}-12-31`;
  if (todayString < yearStart) {
    return 0;
  }

  return applications.reduce((total, application) => {
    if (
      normalizeEmployeeId(application.EmployeeId) !== normalizedEmployeeId ||
      application.LeaveType.trim().toLowerCase().replace(/[^a-z]/g, '') !== 'unannouncedleave' ||
      /reject|cancel|void|deleted/i.test(application.RequestStatus)
    ) {
      return total;
    }

    const requestedDays = Number.parseFloat(application.TotalLeaveDaysRequested);
    if (!Number.isFinite(requestedDays) || requestedDays <= 0) {
      return total;
    }

    const fromDate = application.FromDate.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
    const toDate = application.ToDate.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
    if (!fromDate || !toDate || fromDate > toDate) {
      const requestDate = application.RequestDate.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
      return requestDate >= yearStart && requestDate <= yearEnd ? total + requestedDays : total;
    }

    if (toDate < yearStart || fromDate > yearEnd) {
      return total;
    }
    if (fromDate >= yearStart && toDate <= yearEnd) {
      return total + requestedDays;
    }

    const overlapStart = fromDate < yearStart ? yearStart : fromDate;
    const overlapEnd = toDate > yearEnd ? yearEnd : toDate;
    const dateToUtc = (date: string): number => {
      const [dateYear, month, day] = date.split('-').map(Number);
      return Date.UTC(dateYear, month - 1, day);
    };
    const inclusiveDays = (start: string, end: string): number =>
      Math.floor((dateToUtc(end) - dateToUtc(start)) / 86_400_000) + 1;
    const requestedRangeDays = inclusiveDays(fromDate, toDate);
    const overlappingRangeDays = inclusiveDays(overlapStart, overlapEnd);
    return requestedRangeDays > 0
      ? total + Math.round(requestedDays * overlappingRangeDays / requestedRangeDays)
      : total;
  }, 0);
}

export function countUnannouncedLeaveDaysIncludingRosterAbsences(
  applications: LeaveApplicationRecord[],
  roster: EmployeeRosterListRecord[],
  attendance: ReadonlyMap<string, AttendanceDailyRecord>,
  workstations: WorkstationRecord[],
  employeeId: string,
  year: number,
  today = new Date(),
): number {
  const normalizedEmployeeId = normalizeEmployeeId(employeeId);
  const yearStart = `${year}-01-01`;
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  const yearEnd = todayString < `${year}-12-31` ? todayString : `${year}-12-31`;
  if (todayString < yearStart) {
    return 0;
  }

  const matchingApplications = applications.filter((application) =>
    normalizeEmployeeId(application.EmployeeId) === normalizedEmployeeId &&
    application.LeaveType.trim().toLowerCase().replace(/[^a-z]/g, '') === 'unannouncedleave' &&
    !/reject|cancel|void|deleted/i.test(application.RequestStatus),
  );
  const applicationDays = countUnannouncedLeaveDaysForYear(
    matchingApplications,
    employeeId,
    year,
    today,
  );
  const applicationCoveredDates = new Set<string>();
  for (const application of matchingApplications) {
    const fromDate = application.FromDate.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
    const toDate = application.ToDate.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
    if (!fromDate || !toDate || fromDate > toDate) {
      continue;
    }
    const firstCoveredDate = fromDate > yearStart ? fromDate : yearStart;
    const lastCoveredDate = toDate < yearEnd ? toDate : yearEnd;
    const cursor = new Date(`${firstCoveredDate}T00:00:00`);
    const end = new Date(`${lastCoveredDate}T00:00:00`);
    while (cursor <= end) {
      applicationCoveredDates.add([
        cursor.getFullYear(),
        String(cursor.getMonth() + 1).padStart(2, '0'),
        String(cursor.getDate()).padStart(2, '0'),
      ].join('-'));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const offLabels = new Set(['off', 'day off', 'scheduled day off']);
  const dayOffShiftAliases = new Set<string>();
  for (const workstation of workstations) {
    const isDayOff = [workstation.shift, workstation.name, workstation.description]
      .some((value) => offLabels.has(value.trim().toLowerCase()));
    if (!isDayOff) {
      continue;
    }
    for (const value of [workstation.code, String(workstation.id), workstation.shift, workstation.name, workstation.description]) {
      const normalized = value.trim().toLowerCase();
      if (normalized) {
        dayOffShiftAliases.add(normalized);
      }
    }
  }

  const latestShiftByDate = new Map<string, EmployeeRosterListRecord>();
  for (const record of roster) {
    if (normalizeEmployeeId(record.employee_id) !== normalizedEmployeeId) {
      continue;
    }
    const shiftDate = record.shift_date.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
    if (shiftDate < yearStart || shiftDate > yearEnd) {
      continue;
    }
    const existing = latestShiftByDate.get(shiftDate);
    const existingVersion = Date.parse(existing?.updated_at || existing?.created_at || '') || 0;
    const recordVersion = Date.parse(record.updated_at || record.created_at || '') || 0;
    if (!existing || recordVersion >= existingVersion) {
      latestShiftByDate.set(shiftDate, record);
    }
  }

  let unpostedAbsenceDays = 0;
  for (const [date, record] of latestShiftByDate) {
    const shift = record.shift.trim();
    if (
      !shift ||
      ['+', 'null', 'undefined'].includes(shift.toLowerCase()) ||
      offLabels.has(shift.toLowerCase()) ||
      dayOffShiftAliases.has(shift.toLowerCase()) ||
      applicationCoveredDates.has(date) ||
      attendance.has(`${employeeId.toLowerCase()}|${date}`)
    ) {
      continue;
    }
    unpostedAbsenceDays += 1;
  }

  return applicationDays + unpostedAbsenceDays;
}
