import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { ApplicationFormRecord, EmployeeRosterListRecord } from '../../../services/application-form.service';
import {
  filterUnassignedEmployees,
  findUnassignedEmployees,
  matchesRosterBranch,
  matchesRosterEmployeeSearch,
  rosterDayIndexForMonth,
  rosterBranchName,
  rosterApplicationRecord,
  rosterPeriodForDate,
  rosterShiftInitial,
  rosterShiftsForEmployeeMonth,
  rosterShiftOptions,
} from './employee-roster';
import { WorkstationRecord } from '../../../services/workstation.service';

describe('rosterBranchName', () => {
  it('normalizes branch codes and legacy head office labels', () => {
    expect(rosterBranchName('1')).toBe('AHCP_Peshawar');
    expect(rosterBranchName('2')).toBe('AHCP_HO');
    expect(rosterBranchName('Lahore HO')).toBe('AHCP_HO');
    expect(rosterBranchName('AHCP_Faisalabad')).toBe('AHCP_Faisalabad');
  });
});

describe('matchesRosterBranch', () => {
  it('matches employees by branch and allows all branches', () => {
    expect(matchesRosterBranch('1', 'AHCP_Peshawar')).toBe(true);
    expect(matchesRosterBranch('AHCP_Faisalabad', 'AHCP_Peshawar')).toBe(false);
    expect(matchesRosterBranch('2', 'All Branches')).toBe(true);
  });
});

describe('matchesRosterEmployeeSearch', () => {
  const employee = {
    EmployeeCode: 'E002',
    EmployeeName: 'Sara Ahmed',
    userId: 'sara.ahmed',
    ExtEmpNo: '00002222',
    Department: 'Finance',
    Designation: 'Officer',
    detail: { loginDetails: { legacyCode: 'LEG-0022' } },
  } as ApplicationFormRecord;

  it('matches employee username, ID, and legacy codes', () => {
    expect(matchesRosterEmployeeSearch(employee, 'sara.ahmed')).toBe(true);
    expect(matchesRosterEmployeeSearch(employee, 'E002')).toBe(true);
    expect(matchesRosterEmployeeSearch(employee, 'LEG-0022')).toBe(true);
    expect(matchesRosterEmployeeSearch(employee, '00002222')).toBe(true);
  });

  it('matches legacy codes without case sensitivity or surrounding whitespace', () => {
    expect(matchesRosterEmployeeSearch(employee, '  leg-0022 ')).toBe(true);
  });

  it('can limit search results to legacy codes only', () => {
    expect(matchesRosterEmployeeSearch(employee, 'LEG-0022', true)).toBe(true);
    expect(matchesRosterEmployeeSearch(employee, '00002222', true)).toBe(true);
    expect(matchesRosterEmployeeSearch(employee, 'Sara Ahmed', true)).toBe(false);
    expect(matchesRosterEmployeeSearch(employee, 'E002', true)).toBe(false);
    expect(matchesRosterEmployeeSearch(employee, 'sara.ahmed', true)).toBe(false);
  });
});

describe('rosterApplicationRecord', () => {
  it('preserves profile legacy code data when adapting a roster record', () => {
    const rosterRecord: EmployeeRosterListRecord = {
      employee_id: 'E002',
      employee_name: 'Sara Ahmed',
      department: 'Finance',
      designation: 'Officer',
      employment_status: 'Active',
      shift_date: '2026-10-01',
      shift: 'M',
      role: 'Officer',
      hub: '',
      note: null,
    };
    const profile = {
      EmployeeCode: 'E002',
      EmployeeName: 'Sara Ahmed',
      ExtEmpNo: '00002222',
      Department: 'Finance',
      EmployeeNature: '',
      Designation: 'Officer',
      ReportingManager: '',
      EmploymentType: '',
      EmploymentStatus: 'Active',
      EmploymentCategory: '',
      status: '',
      userId: 'sara.ahmed',
      detail: { loginDetails: { legacyCode: 'LEG-0022' } },
    } as ApplicationFormRecord;

    const employee = rosterApplicationRecord(rosterRecord, profile);

    expect(employee.ExtEmpNo).toBe('00002222');
    expect(employee.detail?.loginDetails.legacyCode).toBe('LEG-0022');
    expect(matchesRosterEmployeeSearch(employee, 'LEG-0022', true)).toBe(true);
  });
});

describe('filterUnassignedEmployees', () => {
  const employees = [
    {
      EmployeeCode: 'E001',
      EmployeeName: 'Ali Khan',
      ExtEmpNo: '00001161',
      Department: 'Operations',
      Designation: 'Officer',
      detail: { personalInfo: { branchLocation: '1' } },
    },
    {
      EmployeeCode: 'E002',
      EmployeeName: 'Sara Ahmed',
      Department: 'Finance',
      Designation: 'Officer',
      detail: {
        requisition: { location: 'AHCP_Faisalabad' },
        loginDetails: { legacyCode: '00002222' },
      },
    },
    { EmployeeCode: 'E003', EmployeeName: 'No Dept', Department: '', Designation: 'Officer' },
  ] as ApplicationFormRecord[];

  it('filters by department while retaining matching text search results', () => {
    expect(filterUnassignedEmployees(employees, 'ali', 'Operations').map((employee) => employee.EmployeeCode))
      .toEqual(['E001']);
    expect(filterUnassignedEmployees(employees, 'ali', 'Finance')).toEqual([]);
  });

  it('searches by the employee profile or login legacy code', () => {
    expect(filterUnassignedEmployees(employees, '00001161', '').map((employee) => employee.EmployeeCode))
      .toEqual(['E001']);
    expect(filterUnassignedEmployees(employees, '00002222', '').map((employee) => employee.EmployeeCode))
      .toEqual(['E002']);
  });

  it('supports showing all departments and employees without a department', () => {
    expect(filterUnassignedEmployees(employees, '', '').length).toBe(3);
    expect(filterUnassignedEmployees(employees, '', '__no_department__').map((employee) => employee.EmployeeCode))
      .toEqual(['E003']);
  });

  it('filters by branch using the employee profile branch code or requisition location', () => {
    expect(filterUnassignedEmployees(employees, '', '', 'AHCP_Peshawar').map((employee) => employee.EmployeeCode))
      .toEqual(['E001']);
    expect(filterUnassignedEmployees(employees, '', '', 'AHCP_Faisalabad').map((employee) => employee.EmployeeCode))
      .toEqual(['E002']);
    expect(filterUnassignedEmployees(employees, '', '', 'AHCP_HO')).toEqual([]);
    expect(filterUnassignedEmployees(employees, '', '', 'All Branches').length).toBe(3);
  });
});

describe('rosterShiftOptions', () => {
  it('keeps distinct workstations when their shift labels are the same', () => {
    const workstations: WorkstationRecord[] = [
      { id: 1, name: 'Morning East', code: 'ME', officeInTime: '', officeOutTime: '', inGraceMinutes: 0, outGraceMinutes: 0, shift: 'M', description: '', status: 1 },
      { id: 2, name: 'Morning West', code: 'MW', officeInTime: '', officeOutTime: '', inGraceMinutes: 0, outGraceMinutes: 0, shift: 'M', description: '', status: 1 },
    ];

    expect(rosterShiftOptions(workstations).slice(0, 2).map((option) => option.code)).toEqual(['ME', 'MW']);
  });

  it('keeps workstations with duplicate codes selectable by their workstation IDs', () => {
    const workstations: WorkstationRecord[] = [17, 18, 19, 20, 21].map((id) => ({
      id,
      name: `Shift ${id}`,
      code: '1',
      officeInTime: '',
      officeOutTime: '',
      inGraceMinutes: 0,
      outGraceMinutes: 0,
      shift: 'Shift',
      description: `Shift ${id}`,
      status: 1,
    }));

    expect(rosterShiftOptions(workstations).slice(0, 5).map((option) => option.code))
      .toEqual(['17', '18', '19', '20', '21']);
  });
});

describe('rosterShiftInitial', () => {
  const workstations: WorkstationRecord[] = [
    { id: 1, name: 'Morning East', code: 'ME', officeInTime: '', officeOutTime: '', inGraceMinutes: 0, outGraceMinutes: 0, shift: 'M', description: '', status: 1 },
    { id: 2, name: 'Evening West', code: 'EW', officeInTime: '', officeOutTime: '', inGraceMinutes: 0, outGraceMinutes: 0, shift: 'E', description: '', status: 1 },
    { id: 3, name: 'Night South', code: 'NS', officeInTime: '', officeOutTime: '', inGraceMinutes: 0, outGraceMinutes: 0, shift: 'N', description: '', status: 1 },
  ];

  it('shows an alphabetic label in workstation order and preserves special roster values', () => {
    expect(rosterShiftInitial('ME', workstations)).toBe('A');
    expect(rosterShiftInitial('EW', workstations)).toBe('B');
    expect(rosterShiftInitial('E', workstations)).toBe('B');
    expect(rosterShiftInitial('NS', workstations)).toBe('C');
    expect(rosterShiftInitial('N', workstations)).toBe('C');
    expect(rosterShiftInitial('OFF', workstations)).toBe('OFF');
    expect(rosterShiftInitial('HOL', workstations)).toBe('HOL');
  });

  it('continues alphabetically past Z for larger workstation lists', () => {
    const manyWorkstations: WorkstationRecord[] = Array.from({ length: 28 }, (_, index) => ({
      id: index + 1,
      name: `Shift ${index + 1}`,
      code: `S${index + 1}`,
      officeInTime: '',
      officeOutTime: '',
      inGraceMinutes: 0,
      outGraceMinutes: 0,
      shift: `Shift ${index + 1}`,
      description: '',
      status: 1,
    }));

    expect(rosterShiftInitial('S26', manyWorkstations)).toBe('Z');
    expect(rosterShiftInitial('S27', manyWorkstations)).toBe('AA');
    expect(rosterShiftInitial('S28', manyWorkstations)).toBe('AB');
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

  it('uses the newest roster row when the API returns duplicate employee dates newest-first', () => {
    const duplicateRecords = [
      { id: '24', employee_id: 'Emp-00000002', shift_date: '2026-10-05', shift: 'new' },
      { id: '12', employee_id: 'Emp-00000002', shift_date: '2026-10-05', shift: 'old' },
    ] as EmployeeRosterListRecord[];

    expect(rosterShiftsForEmployeeMonth(duplicateRecords, 'EMP-00000002', 'October 2026')[4])
      .toBe('new');
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
