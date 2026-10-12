import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { ApplicationFormRecord, EmployeeRosterListRecord } from '../../../services/application-form.service';
import {
  findUnassignedEmployees,
  rosterDayIndexForMonth,
  rosterPeriodForDate,
  rosterShiftInitial,
  rosterShiftsForEmployeeMonth,
  rosterShiftOptions,
} from './employee-roster';
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

describe('rosterShiftInitial', () => {
  const workstations: WorkstationRecord[] = [
    { id: 1, name: 'Morning East', code: 'ME', officeInTime: '', officeOutTime: '', inGraceMinutes: 0, outGraceMinutes: 0, shift: 'M', description: '', status: 1 },
    { id: 2, name: 'Evening West', code: 'EW', officeInTime: '', officeOutTime: '', inGraceMinutes: 0, outGraceMinutes: 0, shift: 'E', description: '', status: 1 },
  ];

  it('shows the first letter of the assigned workstation and preserves special roster values', () => {
    expect(rosterShiftInitial('ME', workstations)).toBe('M');
    expect(rosterShiftInitial('E', workstations)).toBe('E');
    expect(rosterShiftInitial('OFF', workstations)).toBe('OFF');
    expect(rosterShiftInitial('HOL', workstations)).toBe('HOL');
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

describe('rosterShiftsForEmployeeMonth', () => {
  const records = [
    { employee_id: 'Emp-00000002', shift_date: '2026-10-05T00:00:00.000Z', shift: '1' },
    { employee_id: 'Emp-00000002', shift_date: '2026-11-05T00:00:00.000Z', shift: '2' },
    { employee_id: 'Emp-00000002', shift_date: '2027-10-05T00:00:00.000Z', shift: '3' },
  ] as EmployeeRosterListRecord[];

  it('returns shifts only for the requested month and year', () => {
    expect(rosterShiftsForEmployeeMonth(records, 'EMP-00000002', 'October 2026')[4]).toBe('1');
    expect(rosterShiftsForEmployeeMonth(records, 'EMP-00000002', 'October 2026')[5]).toBe('+');
    expect(rosterShiftsForEmployeeMonth(records, 'EMP-00000002', 'November 2026')[4]).toBe('2');
    expect(rosterShiftsForEmployeeMonth(records, 'EMP-00000002', 'October 2027')[4]).toBe('3');
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
