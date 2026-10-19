import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, concatMap, finalize, forkJoin, from, map, Observable, of, Subscription, switchMap, toArray } from 'rxjs';
import { ApplicationFormDetail, ApplicationFormRecord, ApplicationFormService, canonicalizeEmployeeCodeValue, EmployeeProfileAddPayload, EmployeeRosterAddPayload, EmployeeRosterListRecord } from '../../../services/application-form.service';
import { AlertService } from '../../../services/alert.service';
import {
  AttendanceDailyRecord,
  AttendanceManagementService,
  formatPunchTime as formatAttendancePunchTime,
} from '../../../services/attendance-management.service';
import {
  LeaveApplicationAddPayload,
  LeaveApplicationRecord,
  LeaveApplicationService,
} from '../../../services/leave-application.service';
import { LeaveTypeService } from '../../../services/leave-type.service';
import { formatApiErrorMessage } from '../../../utils/api-error.util';
import { countUnannouncedLeaveDaysForYear } from '../../../utils/unannounced-leave-count.util';
import { PageToolbarComponent } from '../../page-toolbar/page-toolbar';
import { GatePassDepartmentService } from '../../gate-pass/gate-pass-department.service';
import { WorkstationRecord, WorkstationService } from '../../../services/workstation.service';
import { glAccountBranchLabel, resolveBranchCode } from '../gl-account-determination/gl-account-branch.options';

type ShiftCode = string;
type MonthHalf = 'First Half' | 'Second Half';
const UNANNOUNCED_LEAVE_TYPE = 'Unannounced Leave';
const UNANNOUNCED_LEAVE_DESCRIPTION = 'Unannounced-Leave For (S.A.Y)';
const ROSTER_BRANCH_OPTIONS = ['AHCP_Peshawar', 'AHCP_HO', 'AHCP_Faisalabad'];

interface RosterDay {
  date: number;
  weekday: string;
  isToday: boolean;
  isHoliday: boolean;
}

interface BranchHoliday {
  date: number;
  weekday: string;
  label: string;
}

interface RosterEmployee extends ApplicationFormRecord {
  hub: string;
  role: string;
  shifts: ShiftCode[];
}

interface ShiftDetailDialog {
  employee: RosterEmployee;
  dayIndex: number;
  dayDate: number;
  shift: ShiftCode;
  attendance: AttendanceDailyRecord | null;
  loading: boolean;
  error: string | null;
}

interface UnannouncedLeavePostResult {
  results: Array<{ dateRange: string[]; error: unknown | null }>;
  successfulDates: string[];
}

interface UnannouncedLeaveProfileUpdateResult {
  profileUpdated: boolean;
  profileError: unknown | null;
}

interface UnannouncedLeaveProfileSyncResult {
  updatedEmployee: RosterEmployee | null;
  postResult: UnannouncedLeavePostResult;
  profileError: unknown | null;
}

interface EmployeeRosterProfileFlagUpdateResult {
  profileFlagUpdated: boolean;
  profileFlagError: unknown | null;
}

interface EmployeeRosterLoadIndex {
  recordsByEmployee: Map<string, EmployeeRosterListRecord>;
  assignedEmployeeCodes: Set<string>;
  shiftsByMonth: Map<string, Map<string, ShiftCode[]>>;
}

interface EmployeeRosterProfileIndex {
  profilesByCode: Map<string, ApplicationFormRecord>;
  shiftApplicableEmployeeCodes: Set<string>;
  unassignedEmployees: ApplicationFormRecord[];
}

export function findUnassignedEmployees(
  employees: ApplicationFormRecord[],
  roster: EmployeeRosterListRecord[],
): ApplicationFormRecord[] {
  const assignedEmployeeCodes = new Set<string>();
  for (const rosterEntry of roster) {
    const employeeCode = normalizeEmployeeCodeForRoster(rosterEntry.employee_id);
    if (employeeCode) {
      assignedEmployeeCodes.add(employeeCode);
    }
  }

  return findUnassignedEmployeesForCodes(employees, assignedEmployeeCodes);
}

function findUnassignedEmployeesForCodes(
  employees: ApplicationFormRecord[],
  assignedEmployeeCodes: Set<string>,
): ApplicationFormRecord[] {
  const seenEmployeeCodes = new Set<string>();
  const unassignedEmployees: ApplicationFormRecord[] = [];
  for (const employee of employees) {
    const employeeCode = normalizeEmployeeCodeForRoster(employee.EmployeeCode);
    if (
      employeeShiftIsApplicable(employee) &&
      employeeCode &&
      !assignedEmployeeCodes.has(employeeCode) &&
      !seenEmployeeCodes.has(employeeCode)
    ) {
      seenEmployeeCodes.add(employeeCode);
      unassignedEmployees.push(employee);
    }
  }
  return unassignedEmployees;
}

function employeeShiftIsApplicable(employee: ApplicationFormRecord): boolean {
  const rawApplicability = (employee as ApplicationFormRecord & { EmployeeShiftApplicable?: unknown }).EmployeeShiftApplicable;
  const explicitlyApplicable = rawApplicability === true || ['true', 'yes', '1'].includes(String(rawApplicability ?? '').trim().toLowerCase())
    ? true
    : rawApplicability === false || ['false', 'no', '0'].includes(String(rawApplicability ?? '').trim().toLowerCase())
      ? false
      : undefined;
  return explicitlyApplicable ?? employee.detail?.hrSettings.attendanceShiftManagement.trim().toLowerCase() === 'yes';
}

function buildEmployeeRosterProfileIndex(
  profiles: ApplicationFormRecord[],
  assignedEmployeeCodes: Set<string>,
): EmployeeRosterProfileIndex {
  const profilesByCode = new Map<string, ApplicationFormRecord>();
  const shiftApplicableEmployeeCodes = new Set<string>();
  const seenUnassignedCodes = new Set<string>();
  const unassignedEmployees: ApplicationFormRecord[] = [];
  for (const profile of profiles) {
    const employeeCode = normalizeEmployeeCodeForRoster(profile.EmployeeCode);
    const shiftApplicable = employeeShiftIsApplicable(profile);
    profilesByCode.set(employeeCode, profile);
    if (shiftApplicable && employeeCode) {
      shiftApplicableEmployeeCodes.add(employeeCode);
    } else {
      shiftApplicableEmployeeCodes.delete(employeeCode);
    }
    if (
      shiftApplicable &&
      employeeCode &&
      !assignedEmployeeCodes.has(employeeCode) &&
      !seenUnassignedCodes.has(employeeCode)
    ) {
      seenUnassignedCodes.add(employeeCode);
      unassignedEmployees.push(profile);
    }
  }
  return { profilesByCode, shiftApplicableEmployeeCodes, unassignedEmployees };
}

export function filterShiftApplicableRosterRecords(
  recordsByEmployee: Map<string, EmployeeRosterListRecord>,
  shiftApplicableEmployeeCodes: Set<string>,
): Array<[string, EmployeeRosterListRecord]> {
  return Array.from(recordsByEmployee).filter(([employeeCode]) =>
    shiftApplicableEmployeeCodes.has(employeeCode),
  );
}

function normalizeEmployeeCodeForRoster(value: string | null | undefined): string {
  const normalized = canonicalizeEmployeeCodeValue(String(value ?? '')).trim().toLowerCase();
  const numericCode = normalized.match(/^(?:emp[-\s]?)?(\d+)$/)?.[1];
  return numericCode ? `emp-${numericCode.padStart(8, '0')}` : normalized;
}

export function rosterBranchName(value: string | null | undefined): string {
  const branch = String(value ?? '').trim();
  if (!branch) {
    return '';
  }
  if (branch.toLowerCase() === 'lahore ho') {
    return 'AHCP_HO';
  }
  return glAccountBranchLabel(resolveBranchCode(branch));
}

export function matchesRosterBranch(employeeBranch: string, selectedBranch: string): boolean {
  return selectedBranch === 'All Branches' ||
    rosterBranchName(employeeBranch).toLowerCase() === rosterBranchName(selectedBranch).toLowerCase();
}

export function matchesRosterEmployeeSearch(
  employee: ApplicationFormRecord,
  searchText: string,
  legacyCodeOnly = false,
): boolean {
  const query = searchText.trim().toLowerCase();
  const searchableValues = legacyCodeOnly
    ? [employee.ExtEmpNo, employee.detail?.loginDetails?.legacyCode]
    : [
    employee.EmployeeName,
    employee.EmployeeCode,
    employee.userId,
    employee.ExtEmpNo,
    employee.detail?.loginDetails?.legacyCode,
    employee.Designation,
    employee.Department,
  ];
  return !query || searchableValues.some((value) => String(value ?? '').toLowerCase().includes(query));
}

export function rosterApplicationRecord(
  record: EmployeeRosterListRecord,
  profile?: ApplicationFormRecord,
): ApplicationFormRecord {
  return {
    ...profile,
    EmployeeCode: profile?.EmployeeCode || record.employee_id,
    EmployeeName: profile?.EmployeeName || record.employee_name || record.employee_id,
    Department: profile?.Department || record.department,
    EmployeeNature: profile?.EmployeeNature || '',
    Designation: profile?.Designation || record.designation || record.role,
    ReportingManager: profile?.ReportingManager || '',
    EmploymentType: profile?.EmploymentType || '',
    EmploymentStatus: record.employment_status,
    EmploymentCategory: profile?.EmploymentCategory || '',
    status: profile?.status || '',
  };
}

const NO_DEPARTMENT_FILTER = '__no_department__';
const ALL_BRANCHES_FILTER = 'All Branches';

export function filterUnassignedEmployees(
  employees: ApplicationFormRecord[],
  searchText: string,
  departmentFilter: string,
  branchFilter = ALL_BRANCHES_FILTER,
): ApplicationFormRecord[] {
  const query = searchText.trim().toLowerCase();
  return employees.filter((employee) => {
    const department = String(employee.Department ?? '').trim();
    const branch = rosterBranchName(
      employee.detail?.personalInfo?.branchLocation || employee.detail?.requisition?.location,
    );
    const matchesDepartment = !departmentFilter ||
      (departmentFilter === NO_DEPARTMENT_FILTER
        ? !department
        : department.toLowerCase() === departmentFilter.toLowerCase());
    const matchesBranch = matchesRosterBranch(branch, branchFilter);
    const matchesSearch = !query ||
      [
        employee.EmployeeName,
        employee.EmployeeCode,
        employee.ExtEmpNo,
        employee.detail?.loginDetails?.legacyCode,
        employee.Designation,
        department,
      ]
        .some((value) => String(value ?? '').toLowerCase().includes(query));
    return matchesDepartment && matchesBranch && matchesSearch;
  });
}

function isAssignedRosterShift(shift: string): boolean {
  const normalized = shift.trim().toLowerCase();
  return normalized !== '' && normalized !== '+' && normalized !== 'null' && normalized !== 'undefined';
}

interface RosterDateParts {
  year: number;
  monthIndex: number;
  dayIndex: number;
}

function rosterDateParts(shiftDate: string): RosterDateParts | null {
  const isoDate = shiftDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  const date = isoDate
    ? new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
    : new Date(shiftDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
    dayIndex: date.getDate() - 1,
  };
}

function rosterMonthKey(monthLabel: string): string {
  const [monthName, yearText] = monthLabel.split(' ');
  const year = Number(yearText);
  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function rosterMonthDayCount(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

export function rosterDayIndexForMonth(shiftDate: string, monthLabel: string): number | null {
  const [monthName, yearText] = monthLabel.split(' ');
  const targetYear = Number(yearText);
  const targetMonth = new Date(`${monthName} 1, ${targetYear}`).getMonth();
  const date = rosterDateParts(shiftDate);
  if (!date || date.year !== targetYear || date.monthIndex !== targetMonth) {
    return null;
  }

  return date.dayIndex;
}

export function indexRosterShifts(
  records: EmployeeRosterListRecord[],
): Map<string, Map<string, ShiftCode[]>> {
  return buildEmployeeRosterLoadIndex(records).shiftsByMonth;
}

function buildEmployeeRosterLoadIndex(records: EmployeeRosterListRecord[]): EmployeeRosterLoadIndex {
  const recordsByEmployee = new Map<string, EmployeeRosterListRecord>();
  const assignedEmployeeCodes = new Set<string>();
  const recordsByMonth = new Map<string, Map<string, Map<number, EmployeeRosterListRecord>>>();
  for (const record of records) {
    const employeeCode = normalizeEmployeeCodeForRoster(record.employee_id);
    if (employeeCode) {
      assignedEmployeeCodes.add(employeeCode);
      if (!recordsByEmployee.has(employeeCode)) {
        recordsByEmployee.set(employeeCode, record);
      }
    }
    if (!isAssignedRosterShift(record.shift)) {
      continue;
    }
    const date = rosterDateParts(record.shift_date);
    if (!date) {
      continue;
    }
    const monthKey = `${date.year}-${String(date.monthIndex + 1).padStart(2, '0')}`;
    let employeesByDay = recordsByMonth.get(monthKey);
    if (!employeesByDay) {
      employeesByDay = new Map();
      recordsByMonth.set(monthKey, employeesByDay);
    }
    let latestRecordByDay = employeesByDay.get(employeeCode);
    if (!latestRecordByDay) {
      latestRecordByDay = new Map();
      employeesByDay.set(employeeCode, latestRecordByDay);
    }
    const current = latestRecordByDay.get(date.dayIndex);
    if (!current || compareRosterRecordVersion(current, record) <= 0) {
      latestRecordByDay.set(date.dayIndex, record);
    }
  }

  const shiftIndex = new Map<string, Map<string, ShiftCode[]>>();
  for (const [monthKey, employeesByDay] of recordsByMonth) {
    const monthShifts = new Map<string, ShiftCode[]>();
    const daysInMonth = rosterMonthDayCount(monthKey);
    for (const [employeeCode, latestRecordByDay] of employeesByDay) {
      const shifts = Array.from({ length: daysInMonth }, () => '+');
      for (const [dayIndex, record] of latestRecordByDay) {
        shifts[dayIndex] = record.shift;
      }
      monthShifts.set(employeeCode, shifts);
    }
    shiftIndex.set(monthKey, monthShifts);
  }

  return { recordsByEmployee, assignedEmployeeCodes, shiftsByMonth: shiftIndex };
}

export function rosterShiftsForEmployeeMonth(
  records: EmployeeRosterListRecord[],
  employeeCode: string,
  monthLabel: string,
): ShiftCode[] {
  const monthKey = rosterMonthKey(monthLabel);
  const shifts = indexRosterShifts(records)
    .get(monthKey)
    ?.get(normalizeEmployeeCodeForRoster(employeeCode));
  return shifts ? [...shifts] : Array.from({ length: rosterMonthDayCount(monthKey) }, () => '+');
}

function compareRosterRecordVersion(
  left: EmployeeRosterListRecord,
  right: EmployeeRosterListRecord,
): number {
  const leftTimestamp = Date.parse(left.updated_at || left.created_at || '');
  const rightTimestamp = Date.parse(right.updated_at || right.created_at || '');
  if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp) && leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }

  const leftId = Number(left.id);
  const rightId = Number(right.id);
  if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
    return leftId - rightId;
  }

  return 0;
}

export function rosterPeriodForDate(date: Date): { monthLabel: string; monthHalf: MonthHalf } {
  return {
    monthLabel: date.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    monthHalf: date.getDate() <= 15 ? 'First Half' : 'Second Half',
  };
}

export function rosterDaysOffCount(
  shifts: ShiftCode[],
  workstations: WorkstationRecord[] = [],
): number {
  const dayOffLabels = new Set(['off', 'day off', 'scheduled day off']);
  const workstationDayOff = new Map<string, boolean>();
  for (const workstation of workstations) {
    const isDayOff = [workstation.shift, workstation.name, workstation.description]
      .some((value) => dayOffLabels.has(value.trim().toLowerCase()));
    for (const value of [workstation.code, String(workstation.id), workstation.shift, workstation.name, workstation.description]) {
      const key = value.trim().toLowerCase();
      if (key && !workstationDayOff.has(key)) {
        workstationDayOff.set(key, isDayOff);
      }
    }
  }

  return shifts.filter((shift) => {
    const normalizedShift = shift.trim().toLowerCase();
    return dayOffLabels.has(normalizedShift) || workstationDayOff.get(normalizedShift) === true;
  }).length;
}

export function isRosterDateInFuture(date: string, today = new Date()): boolean {
  const dateParts = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateParts) {
    return false;
  }
  const rosterDate = new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]));
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return rosterDate > todayDate;
}

export function isScheduledShiftAbsent(
  shift: ShiftCode,
  attendance: AttendanceDailyRecord | null | undefined,
  date: string,
  workstations: WorkstationRecord[] = [],
  today = new Date(),
): boolean {
  return isAssignedRosterShift(shift) &&
    !isRosterDateInFuture(date, today) &&
    rosterDaysOffCount([shift], workstations) === 0 &&
    !attendance?.PunchIn &&
    !attendance?.PunchOut;
}

export function rosterUnannouncedLeaveDates(
  employeeCode: string,
  shifts: ShiftCode[],
  dates: string[],
  attendance: ReadonlyMap<string, AttendanceDailyRecord>,
  workstations: WorkstationRecord[] = [],
  today = new Date(),
): string[] {
  const normalizedEmployeeCode = employeeCode.toLowerCase();
  return dates.filter((date, index) => isScheduledShiftAbsent(
    shifts[index] ?? '+',
    attendance.get(`${normalizedEmployeeCode}|${date}`),
    date,
    workstations,
    today,
  ));
}

export function rosterConsecutiveDateRanges(dates: string[]): string[][] {
  const sortedDates = [...new Set(dates)].sort();
  const ranges: string[][] = [];
  for (const date of sortedDates) {
    const currentRange = ranges[ranges.length - 1];
    const previousDate = currentRange?.[currentRange.length - 1];
    if (!previousDate || rosterDateDistance(previousDate, date) !== 1) {
      ranges.push([date]);
    } else {
      currentRange.push(date);
    }
  }
  return ranges;
}

export function rosterUnannouncedLeaveBalance(
  detail: ApplicationFormDetail | undefined,
  additionalDays = 0,
): { totalLeaves: number; leavesAvailed: number; remainingLeaves: number } {
  const normalizedType = normalizeLeaveType(UNANNOUNCED_LEAVE_TYPE);
  const leaveRow = detail?.leaveManagement.find(
    (row) => normalizeLeaveType(row.leaveType) === normalizedType,
  );
  const remunerationMatchesType =
    normalizeLeaveType(detail?.remuneration?.leaveType) === normalizedType;
  const totalLeaves = parseLeaveBalanceValue(
    leaveRow?.leavesAllocated ?? (remunerationMatchesType ? detail?.remuneration?.leaveDays : undefined),
  );
  const leavesAvailed = parseLeaveBalanceValue(
    leaveRow?.leavesAvailed ?? (remunerationMatchesType ? detail?.remuneration?.leavesAvailed : undefined),
  ) + additionalDays;
  return {
    totalLeaves,
    leavesAvailed,
    remainingLeaves: totalLeaves - leavesAvailed,
  };
}

export function applyRosterUnannouncedLeaveCount(
  detail: ApplicationFormDetail,
  additionalDays: number,
): ApplicationFormDetail {
  if (additionalDays <= 0) {
    return detail;
  }
  const balance = rosterUnannouncedLeaveBalance(detail, additionalDays);
  const leaveManagement = [...detail.leaveManagement];
  const existingIndex = leaveManagement.findIndex(
    (row) => normalizeLeaveType(row.leaveType) === normalizeLeaveType(UNANNOUNCED_LEAVE_TYPE),
  );
  const updatedRow = {
    leaveType: UNANNOUNCED_LEAVE_TYPE,
    leavesAllocated: String(balance.totalLeaves),
    leavesAvailed: String(balance.leavesAvailed),
    remainingLeave: String(balance.remainingLeaves),
  };
  if (existingIndex < 0) {
    leaveManagement.push(updatedRow);
  } else {
    leaveManagement[existingIndex] = updatedRow;
  }
  return {
    ...detail,
    unannouncedLeaves: String(
      parseLeaveBalanceValue(detail.unannouncedLeaves) + additionalDays,
    ),
    leaveManagement,
  };
}

export function reconcileRosterUnannouncedLeaveCount(
  detail: ApplicationFormDetail,
  recordedDays: number,
): ApplicationFormDetail {
  const currentCount = parseLeaveBalanceValue(detail.unannouncedLeaves);
  const targetCount = Math.max(0, recordedDays);
  const leaveManagement = [...detail.leaveManagement];
  const existingIndex = leaveManagement.findIndex(
    (row) => normalizeLeaveType(row.leaveType) === normalizeLeaveType(UNANNOUNCED_LEAVE_TYPE),
  );
  const existingRow = existingIndex >= 0 ? leaveManagement[existingIndex] : undefined;
  const remunerationMatchesType =
    normalizeLeaveType(detail.remuneration?.leaveType) === normalizeLeaveType(UNANNOUNCED_LEAVE_TYPE);
  const totalLeaves = parseLeaveBalanceValue(
    existingRow?.leavesAllocated ??
      (remunerationMatchesType ? detail.remuneration?.leaveDays : undefined),
  );
  const leavesAvailed = targetCount;
  const remainingLeave = totalLeaves - leavesAvailed;
  if (
    targetCount === currentCount &&
    existingRow &&
    parseLeaveBalanceValue(existingRow.leavesAvailed) === leavesAvailed &&
    parseLeaveBalanceValue(existingRow.remainingLeave) === remainingLeave
  ) {
    return detail;
  }

  const updatedRow = {
    leaveType: UNANNOUNCED_LEAVE_TYPE,
    leavesAllocated: String(totalLeaves),
    leavesAvailed: String(leavesAvailed),
    remainingLeave: String(remainingLeave),
  };
  if (existingIndex < 0) {
    leaveManagement.push(updatedRow);
  } else {
    leaveManagement[existingIndex] = updatedRow;
  }
  return {
    ...detail,
    unannouncedLeaves: String(targetCount),
    leaveManagement,
  };
}

export function rosterUnannouncedLeaveDaysForYear(
  applications: LeaveApplicationRecord[],
  employeeCode: string,
  year: number,
  today = new Date(),
): number {
  return countUnannouncedLeaveDaysForYear(applications, employeeCode, year, today);
}

export function rosterUnannouncedAbsenceDatesForYear(
  employeeCode: string,
  shiftsByMonth: ReadonlyMap<string, ReadonlyMap<string, ShiftCode[]>>,
  attendance: ReadonlyMap<string, AttendanceDailyRecord>,
  workstations: WorkstationRecord[],
  today = new Date(),
): string[] {
  const employeeKey = normalizeEmployeeCodeForRoster(employeeCode);
  const attendanceKey = employeeCode.toLowerCase();
  const year = today.getFullYear();
  const dates: string[] = [];
  const cursor = new Date(year, 0, 1);
  const todayDate = new Date(year, today.getMonth(), today.getDate());

  while (cursor <= todayDate) {
    const date = `${year}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const monthKey = date.slice(0, 7);
    const shifts = shiftsByMonth.get(monthKey)?.get(employeeKey);
    const shift = shifts?.[cursor.getDate() - 1] ?? '+';
    if (isScheduledShiftAbsent(
      shift,
      attendance.get(`${attendanceKey}|${date}`),
      date,
      workstations,
      today,
    )) {
      dates.push(date);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function normalizeLeaveType(value: string | undefined): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

function parseLeaveBalanceValue(value: string | number | undefined): number {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function rosterDateDistance(fromDate: string, toDate: string): number {
  const parseDate = (value: string): number => {
    const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return parts
      ? Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]))
      : Number.NaN;
  };
  return (parseDate(toDate) - parseDate(fromDate)) / 86_400_000;
}

export function rosterShiftOptions(workstations: WorkstationRecord[]) {
  const options = workstations
    .map((workstation) => {
      const code = rosterWorkstationCode(workstation, workstations);
      const description = workstation.description.trim() || workstation.name.trim() || workstation.shift.trim();
      return {
        code,
        title: `${description} (${code})`,
        className: 'dynamic',
      };
    })
    .filter((option) => option.code);
  const uniqueOptions = options.filter(
    (option, index, allOptions) => allOptions.findIndex((item) => item.code.toLowerCase() === option.code.toLowerCase()) === index,
  );

  return [
    ...uniqueOptions,
    { code: 'OFF', title: 'Scheduled Day Off', className: 'off' },
  ];
}

function rosterWorkstationCode(
  workstation: WorkstationRecord,
  workstations: WorkstationRecord[],
): string {
  const baseCode = workstation.code.trim() || String(workstation.id).trim() || workstation.shift.trim();
  const duplicateCode = workstations.some((item) =>
    item !== workstation &&
    (item.code.trim() || String(item.id).trim() || item.shift.trim()).toLowerCase() === baseCode.toLowerCase(),
  );
  return duplicateCode ? String(workstation.id).trim() || baseCode : baseCode;
}

export function rosterShiftInitial(shift: ShiftCode, workstations: WorkstationRecord[]): string {
  const normalizedShift = shift.trim();
  if (!normalizedShift || normalizedShift === '+' || ['OFF', 'HOL', 'L'].includes(normalizedShift.toUpperCase())) {
    return normalizedShift;
  }

  const lowerShift = normalizedShift.toLowerCase();
  const workstationIndex = workstations.findIndex((item) =>
    [item.code, String(item.id), item.shift, item.name, item.description]
      .some((value) => value.trim().toLowerCase() === lowerShift),
  );
  return workstationIndex >= 0
    ? rosterShiftLetter(workstationIndex)
    : normalizedShift;
}

function rosterShiftLetter(index: number): string {
  let value = index + 1;
  let label = '';

  while (value > 0) {
    value--;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }

  return label;
}

@Component({
  selector: 'app-employee-roster',
  imports: [CommonModule, FormsModule, PageToolbarComponent],
  templateUrl: './employee-roster.html',
  styleUrl: './employee-roster.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class EmployeeRosterComponent implements OnInit {
  private readonly employeeService = inject(ApplicationFormService);
  private readonly attendanceService = inject(AttendanceManagementService);
  private readonly alertService = inject(AlertService);
  private readonly departmentService = inject(GatePassDepartmentService);
  private readonly initialCalendarPeriod = rosterPeriodForDate(new Date());
  readonly workstationService = inject(WorkstationService);
  private readonly leaveApplicationService = inject(LeaveApplicationService);
  private readonly leaveTypeService = inject(LeaveTypeService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly employees = signal<RosterEmployee[]>([]);
  readonly unassignedEmployees = signal<ApplicationFormRecord[]>([]);
  readonly unassignedSearchText = signal('');
  readonly unassignedDepartmentFilter = signal('');
  readonly unassignedBranchFilter = signal(ALL_BRANCHES_FILTER);
  readonly unassignedCalendarEmployee = signal<RosterEmployee | null>(null);
  readonly unassignedSelectedShift = signal<ShiftCode | null>(null);
  readonly editingRosterCalendar = signal(false);
  private calendarOriginalShifts: ShiftCode[] = [];
  private rosterRecords: EmployeeRosterListRecord[] = [];
  private rosterShiftIndex = new Map<string, Map<string, ShiftCode[]>>();
  private originalRosterShifts = new Map<string, string[]>();
  readonly searchText = signal('');
  readonly legacyCodeSearchOnly = signal(false);
  readonly selectedHub = signal('All Branches');
  readonly rosterBranchOptions = ['All Branches', ...ROSTER_BRANCH_OPTIONS];
  readonly selectedDepartment = signal('All Departments');
  readonly selectedDepartmentCode = signal('');
  readonly departmentOptions = this.departmentService.departments;
  readonly monthLabel = signal(this.initialCalendarPeriod.monthLabel);
  readonly selectedMonthHalf = signal<MonthHalf>(this.initialCalendarPeriod.monthHalf);
  readonly selectedCell = signal<{ employeeCode: string; day: number } | null>(null);
  readonly shiftDetailDialog = signal<ShiftDetailDialog | null>(null);
  readonly employeeSummaryDialog = signal<RosterEmployee | null>(null);
  readonly syncingUnannouncedLeaveProfile = signal(false);
  readonly postingUnannouncedLeave = signal(false);
  readonly postedUnannouncedLeaveDateKeys = signal(new Set<string>());
  readonly employeeUnannouncedLeaveDates = computed(() => {
    const employee = this.employeeSummaryDialog();
    if (!employee || !this.rosterAttendanceLoaded()) {
      return [];
    }
    return rosterUnannouncedLeaveDates(
      employee.EmployeeCode,
      this.monthlyShifts(employee),
      this.fullMonthDays().map((day) => this.rosterDate(day.date)),
      this.rosterAttendance(),
      this.workstationService.workstations(),
    );
  });
  readonly pendingUnannouncedLeaveDates = computed(() => {
    const employee = this.employeeSummaryDialog();
    if (!employee) {
      return [];
    }
    const postedDates = this.postedUnannouncedLeaveDateKeys();
    const keyPrefix = `${employee.EmployeeCode.toLowerCase()}|`;
    return this.employeeUnannouncedLeaveDates().filter(
      (date) => !postedDates.has(`${keyPrefix}${date}`),
    );
  });
  readonly shiftDialog = signal<{ employee: RosterEmployee; dayIndex: number; dayDate: number; shift: ShiftCode } | null>(null);
  readonly shiftDialogPosition = signal({ top: 0, left: 0 });
  readonly shiftDialogDragging = signal(false);
  private shiftDialogDrag: { pointerId: number; startX: number; startY: number; startTop: number; startLeft: number } | null = null;
  private shiftDetailRequestId = 0;
  private unannouncedLeaveSyncRequestId = 0;
  private rosterAttendanceRequestId = 0;
  private rosterAttendanceRequest?: Subscription;
  readonly rosterAttendance = signal(new Map<string, AttendanceDailyRecord>());
  readonly rosterAttendanceLoading = signal(false);
  readonly rosterAttendanceLoaded = signal(false);
  readonly hasChanges = signal(false);
  readonly selectedEmployees = signal(new Set<string>());
  readonly conflictsVisible = signal(true);
  readonly workstationLoading = signal(false);
  readonly workstationLegendOpen = signal(false);
  readonly branchHolidaysOpen = signal(false);
  readonly unassignedDialogOpen = signal(false);
  readonly shiftOptions = computed(() => rosterShiftOptions(this.workstationService.workstations()));
  readonly unassignedBranchOptions = [ALL_BRANCHES_FILTER, ...ROSTER_BRANCH_OPTIONS];
  readonly unassignedDepartmentOptions = computed(() => {
    const departments = [...new Set(
      this.unassignedEmployees()
        .map((employee) => String(employee.Department ?? '').trim())
        .filter(Boolean),
    )].sort((left, right) => left.localeCompare(right));
    const options = [
      { value: '', label: 'All Departments' },
      ...departments.map((department) => ({ value: department, label: department })),
    ];
    if (this.unassignedEmployees().some((employee) => !String(employee.Department ?? '').trim())) {
      options.push({ value: NO_DEPARTMENT_FILTER, label: 'No department' });
    }
    return options;
  });

  readonly visibleDays = computed<RosterDay[]>(() => {
    const [monthName, yearText] = this.monthLabel().split(' ');
    const year = Number(yearText);
    const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const firstHalf = this.selectedMonthHalf() === 'First Half';
    const today = new Date();

    return Array.from({ length: daysInMonth }, (_, index) => {
      const date = index + 1;
      const day = new Date(year, monthIndex, date);
      return {
        date,
        weekday: day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        isToday:
          today.getFullYear() === year &&
          today.getMonth() === monthIndex &&
          today.getDate() === date,
        isHoliday: day.getDay() === 0 || day.getDay() === 6,
      };
    }).filter((day) => (firstHalf ? day.date <= 15 : day.date > 15));
  });

  readonly fullMonthDays = computed<RosterDay[]>(() => {
    const [monthName, yearText] = this.monthLabel().split(' ');
    const year = Number(yearText);
    const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const today = new Date();

    return Array.from({ length: daysInMonth }, (_, index) => {
      const date = index + 1;
      const day = new Date(year, monthIndex, date);
      return {
        date,
        weekday: day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        isToday:
          today.getFullYear() === year &&
          today.getMonth() === monthIndex &&
          today.getDate() === date,
        isHoliday: day.getDay() === 0 || day.getDay() === 6,
      };
    });
  });

  readonly branchHolidays = computed<BranchHoliday[]>(() => {
    const [monthName, yearText] = this.monthLabel().split(' ');
    const year = Number(yearText);
    const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    return Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(year, monthIndex, index + 1);
      const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
      return {
        date: index + 1,
        weekday,
        label: weekday === 'Sunday' ? 'Weekly holiday' : 'Weekend holiday',
      };
    }).filter((holiday) => holiday.weekday === 'Saturday' || holiday.weekday === 'Sunday');
  });

  readonly filteredEmployees = computed(() => {
    const department = this.selectedDepartment();
    return this.employees().filter((employee) => {
      const matchesBranch = matchesRosterBranch(employee.hub, this.selectedHub());
      const matchesDepartment = department === 'All Departments' || employee.Department === department;
      const matchesSearch = matchesRosterEmployeeSearch(
        employee,
        this.searchText(),
        this.legacyCodeSearchOnly(),
      );
      return matchesBranch && matchesDepartment && matchesSearch;
    });
  });

  readonly filteredUnassignedEmployees = computed(() => {
    return filterUnassignedEmployees(
      this.unassignedEmployees(),
      this.unassignedSearchText(),
      this.unassignedDepartmentFilter(),
      this.unassignedBranchFilter(),
    );
  });

  readonly totalEmployees = computed(() => this.employees().length);
  readonly morningCount = computed(() => this.employees().filter((employee) => employee.shifts.some((shift) => this.shiftName(shift) === 'Morning')).length);
  readonly eveningCount = computed(() => this.employees().filter((employee) => employee.shifts.some((shift) => this.shiftName(shift) === 'Evening')).length);
  readonly nightCount = computed(() => this.employees().filter((employee) => employee.shifts.some((shift) => this.shiftName(shift) === 'Night')).length);
  readonly unassignedCount = computed(() => this.unassignedEmployees().length);
  readonly activeCount = computed(() => this.filteredEmployees().length);
  readonly employeeDaysOff = computed(() => {
    const workstations = this.workstationService.workstations();
    return new Map(
      this.employees().map((employee) => [
        employee.EmployeeCode,
        rosterDaysOffCount(employee.shifts, workstations),
      ]),
    );
  });

  readonly allVisibleSelected = computed(() => {
    const visible = this.filteredEmployees();
    const selected = this.selectedEmployees();
    return visible.length > 0 && visible.every((employee) => selected.has(employee.EmployeeCode));
  });

  ngOnInit(): void {
    this.departmentService.ensureLoaded().subscribe();
    this.loadWorkstations();
    this.loadEmployees();
  }

  private loadWorkstations(): void {
    if (this.workstationLoading()) {
      return;
    }
    this.workstationLoading.set(true);
    this.workstationService.fetchWorkstations().pipe(finalize(() => this.workstationLoading.set(false))).subscribe({
      error: (error: unknown) => {
        this.alertService.error('Shift Load Failed', formatApiErrorMessage(error, 'Could not load workstation shifts.'));
      },
    });
  }

  onDepartmentChange(departmentName: string): void {
    this.selectedDepartment.set(departmentName);
    const department = this.departmentOptions().find((item) => item.name === departmentName);
    this.selectedDepartmentCode.set(department?.id ?? '');
  }

  openWorkstationLegend(): void {
    this.workstationLegendOpen.set(true);
  }

  closeWorkstationLegend(): void {
    this.workstationLegendOpen.set(false);
  }

  openBranchHolidays(): void {
    this.branchHolidaysOpen.set(true);
  }

  closeBranchHolidays(): void {
    this.branchHolidaysOpen.set(false);
  }

  loadEmployees(): void {
    this.loading.set(true);
    forkJoin({
      roster: this.employeeService.fetchEmployeeRosterList(),
      profiles: this.employeeService.fetchEmployeeProfiles(),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ roster, profiles }: { roster: EmployeeRosterListRecord[]; profiles: ApplicationFormRecord[] }) => {
          this.rosterRecords = roster;
          const rosterIndex = buildEmployeeRosterLoadIndex(roster);
          const profileIndex = buildEmployeeRosterProfileIndex(
            profiles,
            rosterIndex.assignedEmployeeCodes,
          );
          this.rosterShiftIndex = rosterIndex.shiftsByMonth;
          const rosterEmployees = this.toRosterEmployees(
            rosterIndex.recordsByEmployee,
            profileIndex.profilesByCode,
            profileIndex.shiftApplicableEmployeeCodes,
          );
          this.employees.set(rosterEmployees);
          this.originalRosterShifts = new Map(
            rosterEmployees.map((employee) => [employee.EmployeeCode, [...employee.shifts]]),
          );
          this.unassignedEmployees.set(profileIndex.unassignedEmployees);
          this.loadRosterAttendance();
        },
        error: (error) => {
          this.alertService.error(
            'Roster Load Failed',
            formatApiErrorMessage(error, 'Could not load roster employees and shifts.'),
          );
        },
      });
  }

  openUnassignedDialog(): void {
    this.unassignedSearchText.set('');
    this.unassignedDepartmentFilter.set('');
    this.unassignedBranchFilter.set(ALL_BRANCHES_FILTER);
    this.unassignedDialogOpen.set(true);
  }

  closeUnassignedDialog(): void {
    this.unassignedDialogOpen.set(false);
    this.unassignedSearchText.set('');
    this.unassignedDepartmentFilter.set('');
    this.unassignedBranchFilter.set(ALL_BRANCHES_FILTER);
  }

  openEmployeeSummary(employee: RosterEmployee): void {
    this.employeeSummaryDialog.set(employee);
    this.syncEmployeeProfileFromPostedUnannouncedLeave(employee);
  }

  closeEmployeeSummary(): void {
    this.employeeSummaryDialog.set(null);
  }

  updateShiftsFromEmployeeSummary(): void {
    const employee = this.employeeSummaryDialog();
    if (!employee) {
      return;
    }
    this.closeEmployeeSummary();
    this.openEmployeeCalendar(employee);
  }

  postEmployeeUnannouncedLeave(): void {
    const employee = this.employeeSummaryDialog();
    if (!employee) {
      return;
    }
    if (this.syncingUnannouncedLeaveProfile()) {
      this.alertService.warning(
        'Unannounced Leave Sync In Progress',
        'Wait for the year-to-date leave count to finish syncing before posting additional leave.',
      );
      return;
    }
    if (!this.rosterAttendanceLoaded()) {
      this.alertService.warning('Attendance Not Ready', 'Wait for the selected month attendance to load before posting leave.');
      return;
    }
    const dates = this.pendingUnannouncedLeaveDates();
    if (!dates.length) {
      this.alertService.warning('No New Leave Dates', 'There are no unposted unannounced leave dates for this employee in the selected month.');
      return;
    }
    if (!employee.apiId?.trim() || !employee.detail) {
      this.alertService.error('Employee Profile Missing', 'Could not update the employee leave balance because profile details are unavailable.');
      return;
    }

    this.postingUnannouncedLeave.set(true);
    this.submitUnannouncedLeaveDates(employee, dates).pipe(
      switchMap((postResult) =>
        this.updateProfileAfterPostedUnannouncedLeave(employee, postResult.successfulDates).pipe(
          map((profileResult) => ({ ...postResult, ...profileResult })),
        ),
      ),
      finalize(() => this.postingUnannouncedLeave.set(false)),
    ).subscribe({
      next: ({ results, successfulDates, profileUpdated, profileError }) => {
        const failedRanges = results.filter((result) => result.error !== null);
        if (!successfulDates.length) {
          const firstError = failedRanges[0]?.error;
          this.alertService.error(
            'Leave Posting Failed',
            formatApiErrorMessage(firstError, 'No unannounced leave applications could be posted.'),
          );
          return;
        }
        if (!profileUpdated) {
          this.alertService.error(
            'Leave Balance Update Failed',
            `The leave application(s) for ${successfulDates.length} day(s) were posted, but the employee profile could not be updated. ${formatApiErrorMessage(profileError, 'Retry the profile update before posting more leave.')}`,
          );
          return;
        }
        if (failedRanges.length) {
          const failedRangeLabels = failedRanges
            .map(({ dateRange }) => `${dateRange[0]} to ${dateRange[dateRange.length - 1]}`)
            .join(', ');
          this.alertService.error(
            'Some Leave Dates Were Not Posted',
            `${successfulDates.length} day(s) were posted and recorded. Failed date range(s): ${failedRangeLabels}.`,
          );
          return;
        }
        this.alertService.success(
          'Unannounced Leave Posted',
          `${successfulDates.length} day(s) were posted and recorded for ${employee.EmployeeName}.`,
        );
      },
      error: (error: unknown) => {
        this.alertService.error(
          'Unannounced Leave Setup Failed',
          formatApiErrorMessage(error, 'Could not load or create the Unannounced Leave type.'),
        );
      },
    });
  }

  private ensureUnannouncedLeaveType(): Observable<string> {
    return this.leaveTypeService.fetchLeaveTypes().pipe(
      switchMap((leaveTypes) => {
        const leaveTypeExists = leaveTypes.some((leaveType) =>
          [leaveType.name, leaveType.code]
            .some((value) => normalizeLeaveType(value) === normalizeLeaveType(UNANNOUNCED_LEAVE_TYPE)),
        );
        return leaveTypeExists
          ? of(UNANNOUNCED_LEAVE_TYPE)
          : this.leaveTypeService.addLeaveType({
              name: UNANNOUNCED_LEAVE_TYPE,
              code: UNANNOUNCED_LEAVE_TYPE,
              description: UNANNOUNCED_LEAVE_DESCRIPTION,
              status: 1,
            }).pipe(map(() => UNANNOUNCED_LEAVE_TYPE));
      }),
    );
  }

  private submitUnannouncedLeaveDates(
    employee: RosterEmployee,
    dates: string[],
  ): Observable<UnannouncedLeavePostResult> {
    const dateRanges = rosterConsecutiveDateRanges(dates);
    const suffix = Number(String(Date.now()).slice(-4));
    let successfulDays = 0;
    return this.ensureUnannouncedLeaveType().pipe(
      switchMap((leaveType) => from(dateRanges).pipe(
        concatMap((dateRange, rangeIndex) => {
          const payload = this.buildUnannouncedLeavePayload(
            employee,
            leaveType,
            dateRange,
            suffix + rangeIndex,
            successfulDays,
          );
          return this.leaveApplicationService.addLeaveApplication(payload).pipe(
            map(() => {
              successfulDays += dateRange.length;
              return { dateRange, error: null };
            }),
            catchError((error: unknown) => of({ dateRange, error })),
          );
        }),
        toArray(),
        map((results) => {
          const successfulDates = results
            .filter((result) => result.error === null)
            .flatMap((result) => result.dateRange);
          this.postedUnannouncedLeaveDateKeys.update((current) => {
            const next = new Set(current);
            for (const date of successfulDates) {
              next.add(`${employee.EmployeeCode.toLowerCase()}|${date}`);
            }
            return next;
          });
          return { results, successfulDates };
        }),
      )),
    );
  }

  private updateProfileAfterPostedUnannouncedLeave(
    employee: RosterEmployee,
    successfulDates: string[],
  ): Observable<UnannouncedLeaveProfileUpdateResult> {
    if (!successfulDates.length) {
      return of({ profileUpdated: false, profileError: null });
    }
    const updatedDetail = applyRosterUnannouncedLeaveCount(employee.detail!, successfulDates.length);
    const updatedEmployee = { ...employee, detail: updatedDetail };
    const profilePayload = this.employeeService.buildFlatEmployeeProfilePayload(updatedDetail);
    return this.employeeService.updateEmployeeProfile(employee.apiId!, profilePayload).pipe(
      map(() => {
        this.employeeService.upsertApplicationRecord(updatedEmployee);
        this.employees.update((employees) =>
          employees.map((item) =>
            item.EmployeeCode === employee.EmployeeCode ? updatedEmployee : item,
          ),
        );
        this.employeeSummaryDialog.set(updatedEmployee);
        return { profileUpdated: true, profileError: null };
      }),
      catchError((profileError: unknown) => of({
        profileUpdated: false,
        profileError,
      })),
    );
  }

  openUnassignedCalendar(employee: ApplicationFormRecord): void {
    this.closeUnassignedDialog();
    this.loadWorkstations();
    this.editingRosterCalendar.set(false);
    this.calendarOriginalShifts = [];
    this.unassignedCalendarEmployee.set({
      ...this.toRosterEmployee(employee, 0),
      hub: rosterBranchName(
        employee.detail?.personalInfo?.branchLocation || employee.detail?.requisition?.location,
      ) || this.selectedHub(),
      shifts: this.fullMonthDays().map(() => '+'),
    });
    this.unassignedSelectedShift.set(null);
  }

  openEmployeeCalendar(employee: RosterEmployee): void {
    this.loadWorkstations();
    const shifts = this.rosterShiftsForMonth(employee.EmployeeCode);
    this.editingRosterCalendar.set(true);
    this.calendarOriginalShifts = [...shifts];
    this.unassignedCalendarEmployee.set({ ...employee, shifts });
    this.unassignedSelectedShift.set(null);
  }

  closeUnassignedCalendar(): void {
    this.unassignedCalendarEmployee.set(null);
    this.unassignedSelectedShift.set(null);
    this.editingRosterCalendar.set(false);
    this.calendarOriginalShifts = [];
  }

  selectUnassignedShift(shift: ShiftCode): void {
    this.unassignedSelectedShift.set(shift);
  }

  assignUnassignedDay(dayIndex: number): void {
    const day = this.fullMonthDays()[dayIndex];
    if (!day) {
      return;
    }
    const shift = this.unassignedSelectedShift();
    if (!shift) {
      this.alertService.validation('Select a shift first.');
      return;
    }
    this.unassignedCalendarEmployee.update((employee) => {
      if (!employee) {
        return employee;
      }
      const shifts = [...employee.shifts];
      shifts[dayIndex] = shift;
      return { ...employee, shifts };
    });
  }

  async submitUnassignedCalendar(): Promise<void> {
    const employee = this.unassignedCalendarEmployee();
    const days = this.fullMonthDays()
      .map((day, index) => ({ day, index }));
    if (this.editingRosterCalendar()) {
      await this.submitExistingEmployeeCalendar(employee, days);
      return;
    }

    if (!employee) {
      return;
    }

    const profileId = employee.apiId?.trim();
    const profileDetail = employee.detail;
    if (!profileId || !profileDetail) {
      this.alertService.validation('Employee profile details are unavailable. Reload the employee list and try again.');
      return;
    }

    const assignedDays = days.filter(({ index }) =>
      this.isAssignedShift(this.shiftForFullMonth(employee, index)),
    );
    if (!assignedDays.length) {
      this.alertService.validation('Assign at least one shift before submitting.');
      return;
    }
    const unassignedCount = days.length - assignedDays.length;
    if (
      unassignedCount > 0 &&
      !(await this.alertService.confirmWarning(
        'Unassigned shifts remain',
        `${unassignedCount} day(s) have no shift. Continue to post the assigned shifts and leave the other days unassigned?`,
        'Post assigned shifts',
      ))
    ) {
      return;
    }

    const payload: EmployeeRosterAddPayload = {
      data: assignedDays.map(({ day, index }) => ({
        employee_id: this.toApiEmployeeId(employee.EmployeeCode),
        shift_date: this.rosterDate(day.date),
        shift: this.toApiShift(this.shiftForFullMonth(employee, index)),
        role: employee.role,
        hub: employee.hub,
        note: null,
      })),
    };
    const profilePayload: EmployeeProfileAddPayload = {
      ...this.employeeService.buildFlatEmployeeProfilePayload(profileDetail),
      flag: '1',
    };

    this.saving.set(true);
    this.employeeService
      .addEmployeeRoster(payload)
      .pipe(
        concatMap(() => this.employeeService.updateEmployeeProfile(profileId, profilePayload).pipe(
          map((): EmployeeRosterProfileFlagUpdateResult => ({
            profileFlagUpdated: true,
            profileFlagError: null,
          })),
          catchError((profileFlagError: unknown) => of({
            profileFlagUpdated: false,
            profileFlagError,
          })),
        )),
      )
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (result) => {
          this.employees.update((employees) => [
            ...employees.filter((item) => item.EmployeeCode !== employee.EmployeeCode),
            employee,
          ]);
          this.syncRosterRecords(payload.data);
          this.originalRosterShifts.set(employee.EmployeeCode, [...employee.shifts]);
          this.unassignedEmployees.update((employees) =>
            employees.filter((item) => item.EmployeeCode !== employee.EmployeeCode),
          );
          this.closeUnassignedCalendar();
          if (result.profileFlagUpdated) {
            this.alertService.success('Roster Submitted', `${employee.EmployeeName} was added for ${this.monthLabel()}.`);
          } else {
            this.alertService.error(
              'Roster Submitted, Profile Update Failed',
              formatApiErrorMessage(
                result.profileFlagError,
                'The roster was submitted, but the employee profile flag could not be updated.',
              ),
            );
          }
        },
        error: (error: unknown) => {
          this.alertService.error('Roster Submit Failed', formatApiErrorMessage(error, 'Could not submit employee roster.'));
        },
      });
  }

  private async submitExistingEmployeeCalendar(
    employee: RosterEmployee | null,
    days: Array<{ day: RosterDay; index: number }>,
  ): Promise<void> {
    if (!employee) {
      return Promise.resolve();
    }
    const assignedDays = days.filter(({ index }) =>
      this.isAssignedShift(this.shiftForFullMonth(employee, index)),
    );
    const changedDays = assignedDays.filter(({ index }) =>
      this.shiftForFullMonth(employee, index) !== this.calendarOriginalShifts[index],
    );
    if (!changedDays.length) {
      this.closeUnassignedCalendar();
      return Promise.resolve();
    }

    const unassignedCount = days.length - assignedDays.length;
    if (
      unassignedCount > 0 &&
      !(await this.alertService.confirmWarning(
        'Unassigned shifts remain',
        `${unassignedCount} day(s) have no shift. Continue to save the assigned shift changes and leave the other days unassigned?`,
        'Save assigned shifts',
      ))
    ) {
      return;
    }

    const payload: EmployeeRosterAddPayload = {
      data: changedDays.map(({ day, index }) => ({
        employee_id: this.toApiEmployeeId(employee.EmployeeCode),
        shift_date: this.rosterDate(day.date),
        shift: this.toApiShift(this.shiftForFullMonth(employee, index)),
        role: employee.role,
        hub: employee.hub || this.selectedHub(),
        note: null,
      })),
    };

    this.saving.set(true);
    this.employeeService
      .addEmployeeRoster(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.syncRosterRecords(payload.data);
          this.employees.update((employees) => employees.map((item) =>
            item.EmployeeCode === employee.EmployeeCode
              ? { ...item, shifts: [...employee.shifts] }
              : item,
          ));
          this.originalRosterShifts.set(employee.EmployeeCode, [...employee.shifts]);
          this.hasChanges.set(false);
          this.closeUnassignedCalendar();
          this.alertService.success('Roster Updated', `${employee.EmployeeName}'s shifts were updated.`);
        },
        error: (error: unknown) => {
          this.alertService.error(
            'Roster Update Failed',
            formatApiErrorMessage(error, 'Could not update employee shifts.'),
          );
        },
      });
  }

  private rosterShiftsForMonth(employeeCode: string): ShiftCode[] {
    const monthKey = rosterMonthKey(this.monthLabel());
    const shifts = this.rosterShiftIndex
      .get(monthKey)
      ?.get(normalizeEmployeeCodeForRoster(employeeCode));
    return shifts ? [...shifts] : Array.from({ length: rosterMonthDayCount(monthKey) }, () => '+');
  }

  private loadRosterAttendance(): void {
    this.rosterAttendanceRequest?.unsubscribe();
    const requestId = ++this.rosterAttendanceRequestId;
    const employees = this.employees();
    if (!employees.length) {
      this.rosterAttendance.set(new Map());
      this.rosterAttendanceLoaded.set(true);
      this.rosterAttendanceLoading.set(false);
      return;
    }

    const monthKey = rosterMonthKey(this.monthLabel());
    const lastDay = rosterMonthDayCount(monthKey);
    this.rosterAttendance.set(new Map());
    this.rosterAttendanceLoaded.set(false);
    this.rosterAttendanceLoading.set(true);
    this.rosterAttendanceRequest = this.attendanceService
      .fetchRosterAttendance(employees, `${monthKey}-01`, `${monthKey}-${String(lastDay).padStart(2, '0')}`)
      .pipe(finalize(() => {
        if (requestId === this.rosterAttendanceRequestId) {
          this.rosterAttendanceLoading.set(false);
        }
      }))
      .subscribe({
        next: (attendance) => {
          if (requestId !== this.rosterAttendanceRequestId) {
            return;
          }
          this.rosterAttendance.set(attendance);
          this.rosterAttendanceLoaded.set(true);
        },
        error: (error: unknown) => {
          if (requestId === this.rosterAttendanceRequestId) {
            this.alertService.error(
              'Attendance Load Failed',
              formatApiErrorMessage(error, 'Could not load attendance for the selected month.'),
            );
          }
        },
      });
  }

  isRosterDayAbsent(employee: RosterEmployee, dayDate: number, shift: ShiftCode): boolean {
    if (!this.rosterAttendanceLoaded()) {
      return false;
    }
    const date = this.rosterDate(dayDate);
    const attendance = this.rosterAttendance().get(`${employee.EmployeeCode.toLowerCase()}|${date}`);
    return isScheduledShiftAbsent(shift, attendance, date, this.workstationService.workstations());
  }

  shiftDetailAttendanceStatus(detail: ShiftDetailDialog): string {
    if (detail.loading) {
      return 'Loading…';
    }
    if (detail.error) {
      return 'Unavailable';
    }
    if (rosterDaysOffCount([detail.shift], this.workstationService.workstations()) > 0) {
      return 'Scheduled Day Off';
    }
    if (!isAssignedRosterShift(detail.shift)) {
      return 'Unassigned';
    }
    const date = this.rosterDate(detail.dayDate);
    if (isScheduledShiftAbsent(detail.shift, detail.attendance, date, this.workstationService.workstations())) {
      return 'Absent';
    }
    if (isRosterDateInFuture(date) &&
      !detail.attendance?.PunchIn && !detail.attendance?.PunchOut) {
      return 'Scheduled';
    }
    return detail.attendance?.AttendanceStatus ?? 'Present';
  }

  shiftDetailIsAbsent(detail: ShiftDetailDialog): boolean {
    return !detail.loading &&
      !detail.error &&
      isScheduledShiftAbsent(
        detail.shift,
        detail.attendance,
        this.rosterDate(detail.dayDate),
        this.workstationService.workstations(),
      );
  }

  private buildUnannouncedLeavePayload(
    employee: RosterEmployee,
    leaveType: string,
    dateRange: string[],
    sequence: number,
    previouslyPostedDays: number,
  ): LeaveApplicationAddPayload {
    const detail = employee.detail!;
    const personalInfo = detail.personalInfo;
    const requestDate = this.localDateString(new Date());
    const suffix = ((sequence % 10_000) + 10_000) % 10_000;
    const balance = rosterUnannouncedLeaveBalance(detail, previouslyPostedDays);
    const firstDate = dateRange[0];
    const lastDate = dateRange[dateRange.length - 1];
    return {
      headerInfo: {
        formNumber: `LR-${requestDate.slice(0, 4)}-${String(suffix).padStart(4, '0')}`,
        employeeId: employee.EmployeeCode,
        employeeName: employee.EmployeeName,
        employeeCategory: personalInfo.employmentCategory || employee.EmploymentCategory,
        employmentNature: personalInfo.employmentNature || employee.EmployeeNature,
        employmentType: employee.EmploymentType,
        workGradeLevel: personalInfo.workGradeLevel || personalInfo.roleSalary,
        department: employee.Department || personalInfo.departmentInAhcp,
        jobTitle: personalInfo.designation || employee.Designation,
        location: personalInfo.branchLocation || detail.requisition.location || employee.hub,
      },
      leaveRequest: {
        requestDate,
        leaveType,
        causeOfLeave: 'Unannounced absence',
        fromDate: firstDate,
        toDate: lastDate,
        totalLeaveDaysRequested: dateRange.length,
        requestStatus: 'Submitted',
        remarks: 'Automatically generated from unannounced absence recorded in Employee Roster.',
      },
      leaveBalanceInformation: balance,
    };
  }

  private localDateString(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private syncEmployeeProfileFromPostedUnannouncedLeave(employee: RosterEmployee): void {
    if (this.syncingUnannouncedLeaveProfile() || this.postingUnannouncedLeave()) {
      return;
    }
    const requestId = ++this.unannouncedLeaveSyncRequestId;
    this.syncingUnannouncedLeaveProfile.set(true);
    const today = new Date();
    const todayDate = this.localDateString(today);
    const yearStart = `${today.getFullYear()}-01-01`;
    forkJoin({
      applications: this.leaveApplicationService.fetchLeaveApplications(),
      attendance: this.attendanceService.fetchEmployeeRosterAttendance(employee, yearStart, todayDate),
    }).pipe(
      map(({ applications, attendance }) => {
        const employeeCode = normalizeEmployeeCodeForRoster(employee.EmployeeCode);
        const employeeApplications = applications
          .filter((application) =>
            normalizeEmployeeCodeForRoster(application.EmployeeId) === employeeCode &&
            normalizeLeaveType(application.LeaveType) === normalizeLeaveType(UNANNOUNCED_LEAVE_TYPE) &&
            !/reject|cancel|void|deleted/i.test(application.RequestStatus),
          );
        const selectedMonthDates = this.fullMonthDays().map((day) => this.rosterDate(day.date));
        const selectedMonthDateSet = new Set(selectedMonthDates);
        const postedDateSet = new Set<string>();
        const postedYearDateSet = new Set<string>();
        for (const application of employeeApplications) {
          const fromDate = this.rosterDateValue(application.FromDate);
          const toDate = this.rosterDateValue(application.ToDate);
          if (fromDate && toDate) {
            for (const date of selectedMonthDates) {
              if (date >= fromDate && date <= toDate) {
                postedDateSet.add(date);
              }
            }
            const firstCoveredDate = fromDate > yearStart ? fromDate : yearStart;
            const lastCoveredDate = toDate < todayDate ? toDate : todayDate;
            const dateCursor = new Date(`${firstCoveredDate}T00:00:00`);
            const rangeEnd = new Date(`${lastCoveredDate}T00:00:00`);
            while (dateCursor <= rangeEnd) {
              const date = this.localDateString(dateCursor);
              postedYearDateSet.add(date);
              dateCursor.setDate(dateCursor.getDate() + 1);
            }
          }
        }
        const applicationDays = rosterUnannouncedLeaveDaysForYear(
          employeeApplications,
          employee.EmployeeCode,
          today.getFullYear(),
          today,
        );
        const historicalAbsenceDates = rosterUnannouncedAbsenceDatesForYear(
          employee.EmployeeCode,
          this.rosterShiftIndex,
          attendance,
          this.workstationService.workstations(),
          today,
        );
        const unpostedHistoricalAbsences = historicalAbsenceDates.filter(
          (date) => !postedYearDateSet.has(date),
        ).length;
        this.postedUnannouncedLeaveDateKeys.update((current) => {
          const next = new Set(current);
          for (const date of postedDateSet) {
            if (selectedMonthDateSet.has(date)) {
              next.add(`${employee.EmployeeCode.toLowerCase()}|${date}`);
            }
          }
          return next;
        });
        return {
          recordedDays: applicationDays + unpostedHistoricalAbsences,
          unpostedHistoricalAbsenceDates: historicalAbsenceDates.filter(
            (date) => !postedYearDateSet.has(date),
          ),
        };
      }),
      switchMap(({ recordedDays, unpostedHistoricalAbsenceDates }) => {
        if (
          unpostedHistoricalAbsenceDates.length &&
          (!employee.detail || !employee.apiId?.trim())
        ) {
          throw new Error('Employee profile details are required to post detected Unannounced Leave.');
        }
        const postRequest = unpostedHistoricalAbsenceDates.length
          ? this.submitUnannouncedLeaveDates(employee, unpostedHistoricalAbsenceDates)
          : of({ results: [], successfulDates: [] });
        return postRequest.pipe(
          switchMap((postResult) =>
            this.reconcileEmployeeUnannouncedLeaveProfile(employee, recordedDays).pipe(
              map((updatedEmployee) => ({
                updatedEmployee,
                postResult,
                profileError: null,
              })),
              catchError((profileError: unknown) => of({
                updatedEmployee: null,
                postResult,
                profileError,
              })),
            ),
          ),
        );
      }),
      finalize(() => {
        if (requestId === this.unannouncedLeaveSyncRequestId) {
          this.syncingUnannouncedLeaveProfile.set(false);
        }
      }),
    ).subscribe({
      next: ({ updatedEmployee, postResult, profileError }: UnannouncedLeaveProfileSyncResult) => {
        if (updatedEmployee) {
          this.employeeService.upsertApplicationRecord(updatedEmployee);
          this.employees.update((employees) =>
            employees.map((item) =>
              item.EmployeeCode === updatedEmployee.EmployeeCode ? updatedEmployee : item,
            ),
          );
          if (this.employeeSummaryDialog()?.EmployeeCode === updatedEmployee.EmployeeCode) {
            this.employeeSummaryDialog.set(updatedEmployee);
          }
        }

        const failedRanges = postResult.results.filter((result) => result.error !== null);
        if (failedRanges.length) {
          const failedRangeLabels = failedRanges
            .map(({ dateRange }) => `${dateRange[0]} to ${dateRange[dateRange.length - 1]}`)
            .join(', ');
          this.alertService.error(
            'Some Unannounced Leave Dates Were Not Posted',
            `${postResult.successfulDates.length} day(s) were posted. Failed date range(s): ${failedRangeLabels}.`,
          );
        } else if (postResult.successfulDates.length) {
          this.alertService.success(
            'Unannounced Leave Posted',
            `${postResult.successfulDates.length} detected day(s) were automatically posted for ${employee.EmployeeName}.`,
          );
        }

        if (profileError) {
          this.alertService.error(
            'Unannounced Leave Profile Sync Failed',
            formatApiErrorMessage(profileError, 'Could not sync the employee profile from detected Unannounced Leave.'),
          );
        }
      },
      error: (error: unknown) => {
        if (requestId === this.unannouncedLeaveSyncRequestId) {
          this.alertService.error(
            'Unannounced Leave Sync Failed',
            formatApiErrorMessage(error, 'Could not detect, post, or sync the employee Unannounced Leave.'),
          );
        }
      },
    });
  }

  private reconcileEmployeeUnannouncedLeaveProfile(
    employee: RosterEmployee,
    recordedDays: number,
  ): Observable<RosterEmployee | null> {
    if (!employee.detail) {
      return of(null);
    }
    const hasUnannouncedLeaveRow = employee.detail.leaveManagement.some(
      (row) => normalizeLeaveType(row.leaveType) === normalizeLeaveType(UNANNOUNCED_LEAVE_TYPE),
    );
    if (
      recordedDays === 0 &&
      parseLeaveBalanceValue(employee.detail.unannouncedLeaves) === 0 &&
      !hasUnannouncedLeaveRow
    ) {
      return of(null);
    }
    const updatedDetail = reconcileRosterUnannouncedLeaveCount(employee.detail, recordedDays);
    if (updatedDetail === employee.detail) {
      return of(null);
    }
    if (!employee.apiId?.trim()) {
      throw new Error('Employee profile identifier is missing.');
    }
    const updatedEmployee = { ...employee, detail: updatedDetail };
    const payload = this.employeeService.buildFlatEmployeeProfilePayload(updatedDetail);
    return this.employeeService.updateEmployeeProfile(employee.apiId, payload).pipe(
      map(() => updatedEmployee),
    );
  }

  private rosterDateValue(value: string): string {
    return value.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
  }

  private syncRosterRecords(rows: EmployeeRosterAddPayload['data']): void {
    for (const row of rows) {
      const normalizedEmployeeCode = this.normalizeRosterEmployeeCode(row.employee_id);
      const existingIndex = this.rosterRecords.findIndex((record) =>
        this.normalizeRosterEmployeeCode(record.employee_id) === normalizedEmployeeCode &&
        this.rosterDateValue(record.shift_date) === row.shift_date,
      );
      if (existingIndex >= 0) {
        this.rosterRecords[existingIndex] = {
          ...this.rosterRecords[existingIndex],
          shift: row.shift,
        };
        continue;
      }

      const employee = this.employees().find((record) =>
        this.normalizeRosterEmployeeCode(record.EmployeeCode) === normalizedEmployeeCode,
      );
      this.rosterRecords.push({
        ...row,
        employee_name: employee?.EmployeeName ?? '',
        department: employee?.Department ?? '',
        designation: employee?.Designation ?? '',
        employment_status: employee?.EmploymentStatus ?? '',
      });
    }
    this.rosterShiftIndex = indexRosterShifts(this.rosterRecords);
  }

  isAssignedShift(shift: ShiftCode): boolean {
    return isAssignedRosterShift(shift);
  }

  private toApiShift(shift: ShiftCode): string {
    const normalized = shift.trim();
    const lower = normalized.toLowerCase();
    const workstations = this.workstationService.workstations();
    const workstation = workstations.find((item) =>
      rosterWorkstationCode(item, workstations).toLowerCase() === lower,
    ) ?? workstations.find((item) =>
      [item.shift, item.code, item.name, item.description]
        .some((value) => value.trim().toLowerCase() === lower),
    );
    if (workstation) {
      const workstationCode = workstation.code.trim();
      const isUniqueCode = !workstations.some((item) =>
        item !== workstation && item.code.trim().toLowerCase() === workstationCode.toLowerCase(),
      );
      if (isUniqueCode && workstationCode && workstationCode.length <= 8) {
        return workstationCode;
      }
      if (String(workstation.id).trim()) {
        return String(workstation.id).trim();
      }
    }
    if (['m', 'morning', 'morning shift'].includes(lower)) {
      return 'M';
    }
    if (['e', 'evening', 'evening shift'].includes(lower)) {
      return 'E';
    }
    if (['n', 'night', 'night shift'].includes(lower)) {
      return 'N';
    }
    if (['off', 'day off', 'scheduled day off'].includes(lower)) {
      return 'OFF';
    }
    if (['hol', 'holiday'].includes(lower)) {
      return 'HOL';
    }
    if (['l', 'leave'].includes(lower)) {
      return 'L';
    }
    const compactCode = normalized
      .split(/[^a-z0-9]+/i)
      .filter(Boolean)
      .map((word) => word[0])
      .join('')
      .slice(0, 3)
      .toUpperCase();
    return compactCode || normalized.slice(0, 3).toUpperCase();
  }

  private toApiEmployeeId(employeeCode: string): string {
    const normalized = this.employeeService.normalizeEmployeeCodeValue(employeeCode).trim();
    const numericCode = normalized.match(/^(?:emp[-\s]?)?(\d+)$/i)?.[1];
    return numericCode ? `Emp-${numericCode.padStart(8, '0')}` : normalized;
  }

  openUnassignedShiftDialog(employee: RosterEmployee, dayIndex: number): void {
    this.assignUnassignedDay(dayIndex);
  }

  shiftFor(employee: RosterEmployee, dayIndex: number): ShiftCode {
    if (!employee.shifts.length) {
      return '+';
    }
    if (employee.shifts.length === this.fullMonthDays().length) {
      const date = this.visibleDays()[dayIndex]?.date ?? dayIndex + 1;
      return employee.shifts[date - 1] ?? '+';
    }
    return employee.shifts[dayIndex % employee.shifts.length];
  }

  shiftForFullMonth(employee: RosterEmployee, dayIndex: number): ShiftCode {
    return employee.shifts[dayIndex] ?? '+';
  }

  toggleEmployee(employee: RosterEmployee, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedEmployees.update((selected) => {
      const next = new Set(selected);
      if (checked) {
        next.add(employee.EmployeeCode);
      } else {
        next.delete(employee.EmployeeCode);
      }
      return next;
    });
  }

  toggleAllVisible(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedEmployees.update((selected) => {
      const next = new Set(selected);
      this.filteredEmployees().forEach((employee) => {
        if (checked) {
          next.add(employee.EmployeeCode);
        } else {
          next.delete(employee.EmployeeCode);
        }
      });
      return next;
    });
  }

  isEmployeeSelected(employee: RosterEmployee): boolean {
    return this.selectedEmployees().has(employee.EmployeeCode);
  }

  shiftClass(shift: ShiftCode): string {
    return 'roster-shift';
  }

  shiftBackground(description: string): string {
    return `hsl(${this.descriptionHue(description)} 88% 92%)`;
  }

  shiftForeground(description: string): string {
    return `hsl(${this.descriptionHue(description)} 55% 28%)`;
  }

  shiftName(shift: ShiftCode): string {
    const lower = shift.trim().toLowerCase();
    const workstation = this.workstationService.workstations().find((item) =>
      [item.code, String(item.id)].some((value) => value.trim().toLowerCase() === lower),
    );
    const label = workstation?.shift.trim() || shift;
    return { M: 'Morning', E: 'Evening', N: 'Night', OFF: 'Day Off', L: 'Leave', HOL: 'Holiday', '+': 'Unassigned' }[label] || label;
  }

  shiftInitial(shift: ShiftCode): string {
    return rosterShiftInitial(shift, this.workstationService.workstations());
  }

  shiftDescription(shift: string): string {
    const workstation = this.workstationService
      .workstations()
      .find((item) => [item.code, String(item.id), item.shift].some((value) => value.trim().toLowerCase() === shift.trim().toLowerCase()));
    return workstation?.description.trim() || workstation?.name.trim() || this.shiftName(shift);
  }

  monthDayLabel(dayDate: number): string {
    const day = this.fullMonthDays().find((item) => item.date === dayDate);
    return day ? `${day.weekday} ${day.date}` : String(dayDate);
  }

  private descriptionHue(description: string): number {
    const normalizedDescription = description.trim().toLowerCase();
    if (normalizedDescription === 'morning') {
      return 45;
    }
    if (normalizedDescription === 'holiday') {
      return 145;
    }
    if (normalizedDescription === 'scheduled day off' || normalizedDescription === 'day off') {
      return 145;
    }

    const descriptions = this.workstationService
      .workstations()
      .map((workstation) => workstation.description.trim() || workstation.name.trim() || workstation.shift.trim())
      .filter(Boolean)
      .filter((value, index, values) => values.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);
    const index = descriptions.findIndex((value) => value.trim().toLowerCase() === normalizedDescription);
    return index >= 0 ? (28 + index * 137.508) % 360 : 215;
  }

  selectCell(employee: RosterEmployee, dayIndex: number): void {
    const dayDate = this.visibleDays()[dayIndex]?.date;
    if (dayDate === undefined) {
      this.selectedCell.set(null);
      return;
    }
    this.selectedCell.set({ employeeCode: employee.EmployeeCode, day: dayIndex });
  }

  openShiftDialog(employee: RosterEmployee, dayIndex: number, event: MouseEvent): void {
    const dayDate = this.visibleDays()[dayIndex]?.date;
    if (dayDate === undefined) {
      return;
    }
    this.selectedCell.set({ employeeCode: employee.EmployeeCode, day: dayIndex });
    this.shiftDialog.set(null);
    this.shiftDetailDialog.set({
      employee,
      dayIndex,
      dayDate,
      shift: this.shiftFor(employee, dayIndex),
      attendance: null,
      loading: true,
      error: null,
    });
    const popoverWidth = 350;
    const popoverHeight = 330;
    const gap = 10;
    const left = event.clientX + gap + popoverWidth <= window.innerWidth
      ? event.clientX + gap
      : event.clientX - popoverWidth - gap;
    const top = Math.min(Math.max(8, event.clientY - 70), Math.max(8, window.innerHeight - popoverHeight - 8));
    this.shiftDialogPosition.set({
      top,
      left: Math.max(8, left),
    });

    const requestId = ++this.shiftDetailRequestId;
    this.attendanceService
      .fetchDailyAttendance(employee, this.rosterDate(dayDate))
      .pipe(finalize(() => {
        if (requestId === this.shiftDetailRequestId) {
          this.shiftDetailDialog.update((dialog) => dialog ? { ...dialog, loading: false } : dialog);
        }
      }))
      .subscribe({
        next: (attendance) => {
          if (requestId === this.shiftDetailRequestId) {
            this.shiftDetailDialog.update((dialog) => dialog
              ? { ...dialog, attendance }
              : dialog);
          }
        },
        error: (error: unknown) => {
          if (requestId === this.shiftDetailRequestId) {
            this.shiftDetailDialog.update((dialog) => dialog
              ? {
                ...dialog,
                error: formatApiErrorMessage(error, 'Could not load punch details for this day.'),
              }
              : dialog);
          }
        },
      });
  }

  openShiftUpdateDialog(): void {
    const detail = this.shiftDetailDialog();
    if (!detail) {
      return;
    }

    this.loadWorkstations();
    this.shiftDetailDialog.set(null);
    this.shiftDialog.set({
      employee: detail.employee,
      dayIndex: detail.dayIndex,
      dayDate: detail.dayDate,
      shift: detail.shift,
    });
    const popoverHeight = Math.min(560, Math.max(220, window.innerHeight - 16));
    this.shiftDialogPosition.update((position) => ({
      ...position,
      top: Math.min(position.top, Math.max(8, window.innerHeight - popoverHeight - 8)),
    }));
  }

  closeShiftDetailDialog(): void {
    this.shiftDetailRequestId += 1;
    this.shiftDetailDialog.set(null);
  }

  formatPunchTime(value: string | null | undefined): string {
    return formatAttendancePunchTime(value ?? '');
  }

  startShiftDialogDrag(event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }

    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    const position = this.shiftDialogPosition();
    this.shiftDialogDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTop: position.top,
      startLeft: position.left,
    };
    this.shiftDialogDragging.set(true);
    event.preventDefault();
  }

  moveShiftDialog(event: PointerEvent): void {
    const drag = this.shiftDialogDrag;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const dialog = event.currentTarget as HTMLElement;
    const maxTop = Math.max(8, window.innerHeight - dialog.offsetHeight - 8);
    const maxLeft = Math.max(8, window.innerWidth - dialog.offsetWidth - 8);
    this.shiftDialogPosition.set({
      top: Math.min(Math.max(8, drag.startTop + event.clientY - drag.startY), maxTop),
      left: Math.min(Math.max(8, drag.startLeft + event.clientX - drag.startX), maxLeft),
    });
  }

  endShiftDialogDrag(event: PointerEvent): void {
    if (!this.shiftDialogDrag || this.shiftDialogDrag.pointerId !== event.pointerId) {
      return;
    }

    this.shiftDialogDrag = null;
    this.shiftDialogDragging.set(false);
  }

  chooseDialogShift(shift: ShiftCode): void {
    this.shiftDialog.update((dialog) => (dialog ? { ...dialog, shift } : dialog));
  }

  closeShiftDialog(): void {
    this.shiftDialog.set(null);
  }

  applyDialogShift(): void {
    const dialog = this.shiftDialog();
    if (!dialog) {
      return;
    }
    if (this.unassignedCalendarEmployee()?.EmployeeCode === dialog.employee.EmployeeCode) {
      const updatedEmployee = {
        ...dialog.employee,
        shifts: dialog.employee.shifts.map((shift, index) => index === dialog.dayIndex ? dialog.shift : shift),
      };
      this.unassignedCalendarEmployee.set(updatedEmployee);
    } else {
      const payload: EmployeeRosterAddPayload = {
        data: [{
          employee_id: this.toApiEmployeeId(dialog.employee.EmployeeCode),
          shift_date: this.rosterDate(dialog.dayDate),
          shift: this.toApiShift(dialog.shift),
          role: dialog.employee.role,
          hub: dialog.employee.hub || this.selectedHub(),
          note: null,
        }],
      };
      this.saving.set(true);
      this.employeeService
        .addEmployeeRoster(payload)
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => {
            this.employees.update((employees) => employees.map((employee) => {
              if (employee.EmployeeCode !== dialog.employee.EmployeeCode) {
                return employee;
              }
              const shifts = [...employee.shifts];
              shifts[dialog.dayDate - 1] = dialog.shift;
              return { ...employee, shifts };
            }));
            this.syncRosterRecords(payload.data);
            const employee = this.employees().find((item) => item.EmployeeCode === dialog.employee.EmployeeCode);
            if (employee) {
              this.originalRosterShifts.set(employee.EmployeeCode, [...employee.shifts]);
            }
            this.hasChanges.set(false);
            this.closeShiftDialog();
            this.alertService.success('Roster Updated', 'The selected shift was saved.');
          },
          error: (error: unknown) => {
            this.alertService.error('Roster Update Failed', formatApiErrorMessage(error, 'Could not save the selected shift.'));
          },
        });
      return;
    }
    this.closeShiftDialog();
  }

  assignShift(shift: ShiftCode): void {
    const selected = this.selectedCell();
    const employeeCodes = this.selectedEmployees();
    if (employeeCodes.size > 0) {
      const editableIndexes = this.visibleDays().map((day) => day.date - 1);
      this.employees.update((employees) => employees.map((employee) => {
        if (!employeeCodes.has(employee.EmployeeCode)) {
          return employee;
        }
        const shifts = this.monthlyShifts(employee);
        editableIndexes.forEach((index) => {
          shifts[index] = shift;
        });
        return { ...employee, shifts };
      }));
      this.hasChanges.set(true);
      return;
    }
    if (!selected) {
      this.alertService.validation('Select a roster cell first.');
      return;
    }
    const dayDate = this.visibleDays()[selected.day]?.date;
    if (dayDate === undefined) {
      return;
    }
    this.employees.update((employees) => employees.map((employee) => {
      if (employee.EmployeeCode !== selected.employeeCode) {
        return employee;
      }
      const shifts = this.monthlyShifts(employee);
      shifts[dayDate - 1] = shift;
      return { ...employee, shifts };
    }));
    this.hasChanges.set(true);
  }

  assignDaysOff(): void {
    this.assignShift('OFF');
  }

  applyRotation(): void {
    const selected = this.selectedEmployees();
    if (!selected.size) {
      this.alertService.validation('Select at least one employee first.');
      return;
    }
    const editableIndexes = this.visibleDays().map((day) => day.date - 1);
    this.employees.update((employees) => employees.map((employee) => {
      if (!selected.has(employee.EmployeeCode) || !employee.shifts.length) {
        return employee;
      }
      const shifts = this.monthlyShifts(employee);
      const editableShifts = editableIndexes
        .map((index) => shifts[index])
        .filter((shift): shift is ShiftCode => shift !== undefined);
      editableIndexes.forEach((index, position) => {
        if (position < editableShifts.length) {
          shifts[index] = editableShifts[(position + 1) % editableShifts.length];
        }
      });
      return { ...employee, shifts };
    }));
    this.hasChanges.set(true);
  }

  changeMonth(offset: number): void {
    if (this.hasChanges()) {
      this.alertService.validation('Save roster changes before changing the month.');
      return;
    }
    const [monthName, yearText] = this.monthLabel().split(' ');
    const date = new Date(`${monthName} 1, ${yearText}`);
    date.setMonth(date.getMonth() + offset);
    this.monthLabel.set(date.toLocaleString('en-US', { month: 'long', year: 'numeric' }));
    this.refreshEmployeeMonthShifts();
  }

  jumpToToday(): void {
    const today = new Date();
    const monthLabel = today.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    if (monthLabel === this.monthLabel()) {
      return;
    }
    if (this.hasChanges()) {
      this.alertService.validation('Save roster changes before changing the month.');
      return;
    }
    this.monthLabel.set(monthLabel);
    this.refreshEmployeeMonthShifts();
  }

  private refreshEmployeeMonthShifts(): void {
    this.employees.update((employees) => employees.map((employee) => ({
      ...employee,
      shifts: this.rosterShiftsForMonth(employee.EmployeeCode),
    })));
    this.originalRosterShifts = new Map(
      this.employees().map((employee) => [employee.EmployeeCode, [...employee.shifts]]),
    );
    this.clearSelection();
    this.loadRosterAttendance();
  }

  onMonthHalfChange(value: string): void {
    this.selectedMonthHalf.set(value as MonthHalf);
    this.clearSelection();
  }

  dismissConflicts(): void {
    this.conflictsVisible.set(false);
  }

  clearSelection(): void {
    this.selectedCell.set(null);
    this.selectedEmployees.set(new Set());
  }

  saveChanges(): void {
    if (!this.hasChanges() || this.saving()) {
      return;
    }

    const changedRows = this.employees().flatMap((employee) => {
      const originalShifts = this.originalRosterShifts.get(employee.EmployeeCode) ?? [];
      return this.visibleDays().flatMap((day) => {
        const dayIndex = day.date - 1;
        const currentShift = this.shiftForDate(employee, day.date);
        const originalShift = originalShifts[dayIndex] ?? '+';
        return currentShift === originalShift
          ? []
          : [{
              employee_id: this.toApiEmployeeId(employee.EmployeeCode),
              shift_date: this.rosterDate(day.date),
              shift: this.toApiShift(currentShift),
              role: employee.role,
              hub: employee.hub || this.selectedHub(),
              note: null,
            }];
      });
    });

    if (changedRows.length === 0) {
      this.hasChanges.set(false);
      return;
    }

    const payload: EmployeeRosterAddPayload = {
      data: changedRows,
    };

    this.saving.set(true);
    this.employeeService
      .addEmployeeRoster(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.syncRosterRecords(changedRows);
          this.originalRosterShifts = new Map(
            this.employees().map((employee) => [employee.EmployeeCode, [...employee.shifts]]),
          );
          this.hasChanges.set(false);
          this.alertService.success('Roster Updated', 'Roster changes were saved successfully.');
        },
        error: (error) => {
          this.alertService.error('Roster Save Failed', formatApiErrorMessage(error, 'Could not save roster changes.'));
        },
      });
  }

  private rosterDate(day: number): string {
    const [monthName, year] = this.monthLabel().split(' ');
    const month = new Date(`${monthName} 1, ${year}`).getMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private shiftForDate(employee: RosterEmployee, day: number): ShiftCode {
    return employee.shifts.length === this.fullMonthDays().length
      ? employee.shifts[day - 1] ?? '+'
      : this.shiftFor(employee, day - 1);
  }

  private monthlyShifts(employee: RosterEmployee): ShiftCode[] {
    const days = this.fullMonthDays();
    if (employee.shifts.length === days.length) {
      return [...employee.shifts];
    }
    if (!employee.shifts.length) {
      return days.map(() => '+');
    }
    return days.map((_, index) => employee.shifts[index % employee.shifts.length] ?? '+');
  }

  private toRosterEmployee(record: ApplicationFormRecord, index: number): RosterEmployee {
    const patterns: ShiftCode[][] = [
      ['E', 'E', 'E', 'M', 'M', 'OFF', 'OFF'],
      ['N', 'N', 'N', 'OFF', 'OFF', 'M', 'M'],
      ['M', 'M', 'M', 'OFF', 'OFF', 'N', 'N'],
      ['M', 'M', 'M', 'M', 'M', 'OFF', 'OFF'],
      ['E', 'E', 'E', 'OFF', 'E', 'E', 'E'],
    ];
    return {
      ...record,
      hub: 'Lahore HO',
      role: record.Designation || ['Ops', 'Supp', 'Logistics', 'Eng', 'Staff'][index % 5],
      shifts: patterns[index % patterns.length],
    };
  }

  private toRosterEmployees(
    recordsByEmployee: Map<string, EmployeeRosterListRecord>,
    profilesByCode: Map<string, ApplicationFormRecord>,
    shiftApplicableEmployeeCodes: Set<string>,
  ): RosterEmployee[] {
    const monthKey = rosterMonthKey(this.monthLabel());
    const monthShifts = this.rosterShiftIndex.get(monthKey);
    const emptyMonthShifts = Array.from(
      { length: rosterMonthDayCount(monthKey) },
      () => '+',
    );

    return filterShiftApplicableRosterRecords(recordsByEmployee, shiftApplicableEmployeeCodes)
      .map(([employeeCode, record], index) => {
        const profile = profilesByCode.get(employeeCode);
        const rosterEmployee = this.toRosterEmployee(rosterApplicationRecord(record, profile), index);
        return {
          ...rosterEmployee,
          hub: rosterBranchName(
            profile?.detail?.personalInfo.branchLocation ||
            profile?.detail?.requisition.location ||
            record.hub,
          ),
          role: record.role || record.designation || rosterEmployee.role,
          shifts: [...(monthShifts?.get(employeeCode) ?? emptyMonthShifts)],
        };
      });
  }

  private normalizeRosterEmployeeCode(value: string | null | undefined): string {
    const normalized = this.employeeService.normalizeEmployeeCodeValue(String(value ?? '')).trim();
    const numericCode = normalized.match(/^(?:emp[-\s]?)?(\d+)$/i)?.[1];
    return numericCode ? `emp-${numericCode.padStart(8, '0')}` : normalized.toLowerCase();
  }

}
