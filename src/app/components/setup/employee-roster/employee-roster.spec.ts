import { ApplicationFormRecord, EmployeeRosterListRecord } from '../../../services/application-form.service';
import { findUnassignedEmployees, isPastRosterDate, rosterDayIndexForMonth, rosterPeriodForDate, rosterShiftOptions } from './employee-roster';
import { WorkstationRecord } from '../../../services/workstation.service';

describe('rosterShiftOptions', () => {
  it('keeps distinct workstations when their shift labels are the same', () => {
    const workstations: WorkstationRecord[] = [
      { id: 1, name: 'Morning East', code: 'ME', officeInTime: '', officeOutTime: '', inGraceMinutes: 0, outGraceMinutes: 0, shift: 'M', description: '', status: 1 },
      { id: 2, name: 'Morning West', code: 'MW', officeInTime: '', officeOutTime: '', inGraceMinutes: 0, outGraceMinutes: 0, shift: 'M', description: '', status: 1 },
    ];

    expect(rosterShiftOptions(workstations).slice(0, 2).map((option) => option.code)).toEqual(['ME', 'MW']);
  });
});

describe('findUnassignedEmployees', () => {
  it('does not mark an employee unassigned when a roster record has no shift value', () => {
    const employee = {
      EmployeeCode: 'Emp-00000042',
      detail: { hrSettings: { attendanceShiftManagement: 'Yes' } },
    } as ApplicationFormRecord;
    const rosterEntry = {
      employee_id: 'Emp-00000042',
      shift: '',
    } as EmployeeRosterListRecord;

    expect(findUnassignedEmployees([employee], [rosterEntry])).toEqual([]);
  });

  it('matches legacy employee IDs to their canonical roster ID', () => {
    const employee = {
      EmployeeCode: 'Emp-00003283',
      detail: { hrSettings: { attendanceShiftManagement: 'Yes' } },
    } as ApplicationFormRecord;
    const rosterEntry = {
      employee_id: 'Emp-00000254',
      shift: 'M',
    } as EmployeeRosterListRecord;

    expect(findUnassignedEmployees([employee], [rosterEntry])).toEqual([]);
  });
});

describe('rosterDayIndexForMonth', () => {
  it('ignores shift records from other months', () => {
    expect(rosterDayIndexForMonth('2026-08-12', 'September 2026')).toBeNull();
    expect(rosterDayIndexForMonth('2026-10-12', 'September 2026')).toBeNull();
  });

  it('maps ISO calendar dates to their day index in the selected month', () => {
    expect(rosterDayIndexForMonth('2026-09-12T00:00:00.000Z', 'September 2026')).toBe(11);
  });
});

describe('rosterPeriodForDate', () => {
  it('selects the first half through the 15th', () => {
    expect(rosterPeriodForDate(new Date(2026, 8, 15))).toEqual({
      monthLabel: 'September 2026',
      monthHalf: 'First Half',
    });
  });

  it('selects the second half from the 16th onward', () => {
    expect(rosterPeriodForDate(new Date(2026, 8, 16))).toEqual({
      monthLabel: 'September 2026',
      monthHalf: 'Second Half',
    });
  });
});

describe('isPastRosterDate', () => {
  const today = new Date(2026, 8, 15);

  it('identifies dates before today as uneditable', () => {
    expect(isPastRosterDate(14, 'September 2026', today)).toBe(true);
  });

  it('keeps today and future dates editable', () => {
    expect(isPastRosterDate(15, 'September 2026', today)).toBe(false);
    expect(isPastRosterDate(16, 'September 2026', today)).toBe(false);
    expect(isPastRosterDate(1, 'October 2026', today)).toBe(false);
  });
});