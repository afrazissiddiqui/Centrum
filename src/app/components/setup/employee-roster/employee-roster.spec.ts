import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { ApplicationFormDetail, ApplicationFormRecord, EmployeeRosterListRecord } from '../../../services/application-form.service';
import {
  filterUnassignedEmployees,
  filterShiftApplicableRosterRecords,
  findUnassignedEmployees,
  employeeShiftIsNotApplicable,
  rosterPaidLeaveDates,
  rosterPaidLeaveDays,
  matchesRosterBranch,
  matchesRosterDepartment,
  matchesRosterEmployeeSearch,
  rosterDayIndexForMonth,
  rosterBranchName,
  rosterApplicationRecord,
  rosterDaysOffCount,
  indexRosterShifts,
  indexRequestedLeaveDates,
  isRosterDateInFuture,
  isScheduledShiftAbsent,
  applyRosterUnannouncedLeaveCount,
  rosterUnannouncedLeaveDateRange,
  reconcileRosterUnannouncedLeaveCount,
  rosterUnannouncedAbsenceDatesForYear,
  rosterUnannouncedLeaveDaysForYear,
  rosterUnannouncedLeaveApplicationBalance,
  rosterUnannouncedLeaveBalance,
  rosterUnannouncedLeaveDates,
  nonShiftUnannouncedLeaveDates,
  trackedEmployeeUnannouncedLeaveDates,
  rosterPeriodForDate,
  rosterDaysForMonthHalf,
  rosterShiftInitial,
  rosterShiftsForEmployeeMonth,
  rosterShiftOptions,
} from './employee-roster';
import { WorkstationRecord } from '../../../services/workstation.service';
import { AttendanceDailyRecord } from '../../../services/attendance-management.service';
import { LeaveApplicationRecord } from '../../../services/leave-application.service';

describe('indexRequestedLeaveDates', () => {
  it('marks requested single-day and date-range leaves in the selected month', () => {
    const applications = [
      {
        EmployeeId: 'Emp-00000042',
        FromDate: '2026-10-03',
        ToDate: '2026-10-05',
        RequestStatus: 'Submitted',
      },
      {
        EmployeeId: 'Emp-00000042',
        FromDate: '2026-10-12T00:00:00',
        ToDate: '',
        RequestStatus: 'Pending',
      },
      {
        EmployeeId: 'Emp-00000042',
        FromDate: '2026-10-15',
        ToDate: '2026-10-16',
        RequestStatus: 'Rejected',
      },
    ] as LeaveApplicationRecord[];

    const leaveDates = indexRequestedLeaveDates(applications, 'October 2026');

    expect(leaveDates.has('emp-00000042|2026-10-03')).toBe(true);
    expect(leaveDates.has('emp-00000042|2026-10-04')).toBe(true);
    expect(leaveDates.has('emp-00000042|2026-10-05')).toBe(true);
    expect(leaveDates.has('emp-00000042|2026-10-12')).toBe(true);
    expect(leaveDates.has('emp-00000042|2026-10-15')).toBe(false);
    expect(rosterPaidLeaveDays(leaveDates, 'Emp-00000042')).toBe(4);
    expect(rosterPaidLeaveDates(leaveDates, 'Emp-00000042')).toEqual([
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-12',
    ]);
    expect(rosterPaidLeaveDays(leaveDates, 'Emp-00000043')).toBe(0);
  });

  it('clips leave ranges to the selected month and ignores other employees', () => {
    const applications = [
      {
        EmployeeId: 'Emp-00000042',
        FromDate: '2026-09-29',
        ToDate: '2026-10-02',
        RequestStatus: 'Approved',
      },
    ] as LeaveApplicationRecord[];

    const leaveDates = indexRequestedLeaveDates(applications, 'October 2026');

    expect(leaveDates.size).toBe(2);
    expect(leaveDates.has('emp-00000042|2026-10-01')).toBe(true);
    expect(leaveDates.has('emp-00000042|2026-10-02')).toBe(true);
  });
});

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

  it('matches zero-padded branch IDs and alternate branch labels', () => {
    expect(matchesRosterBranch('01', 'AHCP_Peshawar')).toBe(true);
    expect(matchesRosterBranch('02', 'AHCP_HO')).toBe(true);
    expect(matchesRosterBranch('03', 'AHCP_Faisalabad')).toBe(true);
    expect(matchesRosterBranch('Lahore HO', 'AHCP_HO')).toBe(true);
  });
});

describe('matchesRosterDepartment', () => {
  it('matches departments without case or surrounding/internal spacing differences', () => {
    expect(matchesRosterDepartment('  Human   Resources ', 'Human Resources')).toBe(true);
    expect(matchesRosterDepartment('finance', 'Finance')).toBe(true);
    expect(matchesRosterDepartment('Finance', 'Operations')).toBe(false);
    expect(matchesRosterDepartment('', 'Finance')).toBe(false);
    expect(matchesRosterDepartment('', 'All Departments')).toBe(true);
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

  it('uses the roster department when the profile only has a placeholder', () => {
    const rosterRecord: EmployeeRosterListRecord = {
      employee_id: 'E003',
      employee_name: 'Ayesha Khan',
      department: 'Finance',
      designation: 'Officer',
      employment_status: 'Active',
      shift_date: '2026-10-01',
      shift: 'M',
      role: 'Officer',
      hub: '',
      note: null,
    };

    const employee = rosterApplicationRecord(rosterRecord, {
      EmployeeCode: 'E003',
      EmployeeName: 'Ayesha Khan',
      Department: '—',
    } as ApplicationFormRecord);

    expect(employee.Department).toBe('Finance');
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
  it('omits Holiday and keeps Scheduled Day Off available without workstations', () => {
    const options = rosterShiftOptions([]);

    expect(options).toEqual([
      { code: 'OFF', title: 'Scheduled Day Off', className: 'off' },
    ]);
    expect(options.some((option) => option.title === 'Holiday')).toBe(false);
  });

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
  it('includes only employees with shift applicability enabled', () => {
    const employees = [
      {
        EmployeeCode: 'Emp-00000041',
        detail: { hrSettings: { attendanceShiftManagement: 'Yes' } },
      },
      {
        EmployeeCode: 'Emp-00000042',
        detail: { hrSettings: { attendanceShiftManagement: 'No' } },
      },
    ] as ApplicationFormRecord[];

    expect(findUnassignedEmployees(employees, []).map((employee) => employee.EmployeeCode))
      .toEqual(['Emp-00000041']);
  });

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

describe('employeeShiftIsNotApplicable', () => {
  it('matches employees explicitly marked as not shift applicable', () => {
    expect(employeeShiftIsNotApplicable({
      EmployeeCode: 'EMP-00000041',
      detail: { hrSettings: { attendanceShiftManagement: 'No' } },
    } as ApplicationFormRecord)).toBe(true);
    expect(employeeShiftIsNotApplicable({
      EmployeeCode: 'EMP-00000042',
      EmployeeShiftApplicable: 'No',
    } as ApplicationFormRecord)).toBe(true);
  });

  it('excludes employees marked yes or without an explicit no value', () => {
    expect(employeeShiftIsNotApplicable({
      EmployeeCode: 'EMP-00000041',
      detail: { hrSettings: { attendanceShiftManagement: 'Yes' } },
    } as ApplicationFormRecord)).toBe(false);
    expect(employeeShiftIsNotApplicable({
      EmployeeCode: 'EMP-00000042',
    } as ApplicationFormRecord)).toBe(false);
  });
});

describe('filterShiftApplicableRosterRecords', () => {
  it('keeps roster employees whose profile has shift applicability enabled', () => {
    const applicableRecord = {
      employee_id: 'Emp-00000041',
      employee_name: 'Ali Khan',
    } as EmployeeRosterListRecord;
    const inapplicableRecord = {
      employee_id: 'Emp-00000042',
      employee_name: 'Sara Ahmed',
    } as EmployeeRosterListRecord;
    const recordsByEmployee = new Map([
      ['emp-00000041', applicableRecord],
      ['emp-00000042', inapplicableRecord],
    ]);

    expect(filterShiftApplicableRosterRecords(
      recordsByEmployee,
      new Set(['emp-00000041']),
    )).toEqual([['emp-00000041', applicableRecord]]);
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

  it('indexes employee shifts by month for constant-time month and employee lookup', () => {
    const shiftIndex = indexRosterShifts([
      ...records,
      { id: '24', employee_id: 'Emp-00000002', shift_date: '2026-10-05', shift: 'new' },
      { id: '12', employee_id: 'Emp-00000002', shift_date: '2026-10-05', shift: 'old' },
    ] as EmployeeRosterListRecord[]);

    expect(shiftIndex.get('2026-10')?.get('emp-00000002')?.[4]).toBe('new');
    expect(shiftIndex.get('2026-11')?.get('emp-00000002')?.[4]).toBe('2');
    expect(shiftIndex.get('2026-10')?.get('emp-00000003')).toBeUndefined();
  });

  it('counts each scheduled day off for the selected month without including other shifts', () => {
    const monthRecords = [
      ...records,
      { employee_id: 'Emp-00000002', shift_date: '2026-10-06', shift: 'OFF' },
      { employee_id: 'Emp-00000002', shift_date: '2026-10-07', shift: 'OFF' },
      { employee_id: 'Emp-00000002', shift_date: '2026-11-06', shift: 'OFF' },
    ] as EmployeeRosterListRecord[];
    const octoberShifts = rosterShiftsForEmployeeMonth(monthRecords, 'EMP-00000002', 'October 2026');
    const novemberShifts = rosterShiftsForEmployeeMonth(monthRecords, 'EMP-00000002', 'November 2026');

    expect(rosterDaysOffCount(['OFF', 'M', 'OFF', 'HOL', '+'])).toBe(2);
    expect(rosterDaysOffCount(octoberShifts)).toBe(2);
    expect(rosterDaysOffCount(novemberShifts)).toBe(1);
  });
});

describe('rosterDaysOffCount', () => {
  it('counts workstation assignments identified as a scheduled day off', () => {
    const workstations: WorkstationRecord[] = [
      { id: 1, name: 'Day Off', code: 'DO', officeInTime: '', officeOutTime: '', inGraceMinutes: 0, outGraceMinutes: 0, shift: 'D', description: 'Scheduled Day Off', status: 1 },
      { id: 2, name: 'Morning', code: 'M', officeInTime: '', officeOutTime: '', inGraceMinutes: 0, outGraceMinutes: 0, shift: 'M', description: '', status: 1 },
    ];

    expect(rosterDaysOffCount(['DO', 'D', 'M'], workstations)).toBe(2);
  });
});

describe('isScheduledShiftAbsent', () => {
  const today = new Date(2026, 9, 16);

  it('marks only completed non-day-off shifts without punches absent', () => {
    expect(isScheduledShiftAbsent('M', null, '2026-10-15', [], today)).toBe(true);
    expect(isScheduledShiftAbsent('M', null, '2026-10-16', [], today)).toBe(false);
    expect(isScheduledShiftAbsent('M', null, '2026-10-17', [], today)).toBe(false);
    expect(isScheduledShiftAbsent('+', null, '2026-10-15', [], today)).toBe(false);
    expect(isScheduledShiftAbsent('', null, '2026-10-15', [], today)).toBe(false);
    expect(isScheduledShiftAbsent('M', {
      PunchIn: '2026-10-16T09:00:00',
      PunchOut: '',
    } as AttendanceDailyRecord, '2026-10-16', [], today)).toBe(false);
    expect(isScheduledShiftAbsent('OFF', null, '2026-10-16', [], today)).toBe(false);
  });

  it('recognizes future dates relative to today rather than treating them as absence', () => {
    expect(isRosterDateInFuture('2026-10-17', today)).toBe(true);
    expect(isRosterDateInFuture('2026-10-16', today)).toBe(false);
  });
});

describe('rosterUnannouncedLeaveDates', () => {
  it('counts only past and current absent days with assigned working shifts', () => {
    const attendance = new Map<string, AttendanceDailyRecord>([
      ['emp-00000002|2026-10-14', { PunchIn: '', PunchOut: '' } as AttendanceDailyRecord],
      ['emp-00000002|2026-10-15', { PunchIn: '2026-10-15T09:00:00', PunchOut: '' } as AttendanceDailyRecord],
    ]);

    expect(rosterUnannouncedLeaveDates(
      'EMP-00000002',
      ['M', '+', 'OFF', 'M', 'M'],
      ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'],
      attendance,
      [],
      new Date(2026, 9, 16),
    )).toEqual(['2026-10-14']);
  });
});

describe('non-shift unannounced leave detection', () => {
  it('flags missing punches only on non-holiday weekdays for employees without shift applicability', () => {
    const attendance = new Map<string, AttendanceDailyRecord>([
      ['emp-00000099|2026-10-14', { PunchIn: '', PunchOut: '' } as AttendanceDailyRecord],
      ['emp-00000099|2026-10-15', { PunchIn: '2026-10-15T09:00:00', PunchOut: '' } as AttendanceDailyRecord],
      ['emp-00000099|2026-10-16', { PunchIn: '', PunchOut: '2026-10-16T18:00:00' } as AttendanceDailyRecord],
    ]);

    expect(nonShiftUnannouncedLeaveDates(
      'EMP-00000099',
      ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'],
      attendance,
      ['2026-10-14'],
      new Date(2026, 9, 17),
    )).toEqual([]);

    expect(trackedEmployeeUnannouncedLeaveDates(
      { EmployeeCode: 'EMP-00000099', detail: { hrSettings: { attendanceShiftManagement: 'No' } } },
      ['2026-10-14', '2026-10-17', '2026-10-18', '2026-10-11'],
      attendance,
      [],
      new Date(2026, 9, 18),
      ['2026-10-14'],
    )).toEqual(['2026-10-17']);
  });
});

describe('unannounced leave posting helpers', () => {
  it('collects all detected dates in one sorted leave application range', () => {
    expect(rosterUnannouncedLeaveDateRange([
      '2026-10-11',
      '2026-08-04',
      '2026-10-04',
      '2026-10-04',
    ])).toEqual([
      '2026-08-04',
      '2026-10-04',
      '2026-10-11',
    ]);
  });

  it('tracks the leave balance and permits negative remaining leave', () => {
    const detail = {
      unannouncedLeaves: '2',
      leaveManagement: [{
        leaveType: 'Unannounced Leave',
        leavesAllocated: '3',
        leavesAvailed: '3',
        remainingLeave: '0',
      }],
    } as ApplicationFormDetail;

    expect(rosterUnannouncedLeaveBalance(detail, 2)).toEqual({
      totalLeaves: 3,
      leavesAvailed: 5,
      remainingLeaves: -2,
    });
    expect(applyRosterUnannouncedLeaveCount(detail, 2)).toMatchObject({
      unannouncedLeaves: '4',
      leaveManagement: [{
        leaveType: 'Unannounced Leave',
        leavesAllocated: '3',
        leavesAvailed: '5',
        remainingLeave: '-2',
      }],
    });
  });

  it('does not send a negative remaining balance in leave application payloads', () => {
    const detail = {
      unannouncedLeaves: '2',
      leaveManagement: [{
        leaveType: 'Unannounced Leave',
        leavesAllocated: '0',
        leavesAvailed: '2',
        remainingLeave: '-2',
      }],
    } as ApplicationFormDetail;

    expect(rosterUnannouncedLeaveApplicationBalance(detail, 4)).toEqual({
      totalLeaves: 0,
      leavesAvailed: 6,
      remainingLeaves: 0,
    });
    expect(rosterUnannouncedLeaveApplicationBalance(detail, 0).remainingLeaves).toBe(0);
  });

  it('creates a zero-allocation leave balance row when none exists', () => {
    const detail = { unannouncedLeaves: '0', leaveManagement: [] } as ApplicationFormDetail;
    expect(applyRosterUnannouncedLeaveCount(detail, 1).leaveManagement).toContainEqual({
      leaveType: 'Unannounced Leave',
      leavesAllocated: '0',
      leavesAvailed: '1',
      remainingLeave: '-1',
    });
  });

  it('reconciles the profile count to the leave applications for the selected calendar year', () => {
    const detail = {
      unannouncedLeaves: '0',
      leaveManagement: [{
        leaveType: 'Unannounced Leave',
        leavesAllocated: '1',
        leavesAvailed: '0',
        remainingLeave: '1',
      }],
    } as ApplicationFormDetail;

    expect(reconcileRosterUnannouncedLeaveCount(detail, 2)).toMatchObject({
      unannouncedLeaves: '2',
      leaveManagement: [{
        leaveType: 'Unannounced Leave',
        leavesAllocated: '1',
        leavesAvailed: '2',
        remainingLeave: '-1',
      }],
    });
    expect(reconcileRosterUnannouncedLeaveCount(
      { ...detail, unannouncedLeaves: '3' },
      2,
    ).unannouncedLeaves).toBe('2');
    expect(reconcileRosterUnannouncedLeaveCount(
      { ...detail, unannouncedLeaves: '2' },
      0,
    )).toMatchObject({
      unannouncedLeaves: '0',
      leaveManagement: [{
        leaveType: 'Unannounced Leave',
        leavesAvailed: '0',
        remainingLeave: '1',
      }],
    });
  });

  it('sums active Unannounced Leave days across every month of the year only', () => {
    const applications = [
      { EmployeeId: 'EMP-1001', LeaveType: 'Unannounced Leave', RequestStatus: 'Submitted', RequestDate: '2026-01-10', FromDate: '2026-01-10', ToDate: '2026-01-11', TotalLeaveDaysRequested: '2' },
      { EmployeeId: 'EMP-1001', LeaveType: 'Unannounced Leave', RequestStatus: 'Approved', RequestDate: '2026-07-04', FromDate: '2026-07-04', ToDate: '2026-07-04', TotalLeaveDaysRequested: '1' },
      { EmployeeId: 'EMP-1001', LeaveType: 'Unannounced Leave', RequestStatus: 'Cancelled', RequestDate: '2026-08-01', FromDate: '2026-08-01', ToDate: '2026-08-03', TotalLeaveDaysRequested: '3' },
      { EmployeeId: 'EMP-1001', LeaveType: 'Annual Leave', RequestStatus: 'Approved', RequestDate: '2026-09-01', FromDate: '2026-09-01', ToDate: '2026-09-05', TotalLeaveDaysRequested: '5' },
      { EmployeeId: 'EMP-1001', LeaveType: 'Unannounced Leave', RequestStatus: 'Approved', RequestDate: '2025-12-31', FromDate: '2025-12-31', ToDate: '2025-12-31', TotalLeaveDaysRequested: '1' },
    ] as LeaveApplicationRecord[];

    expect(rosterUnannouncedLeaveDaysForYear(applications, 'EMP-1001', 2026)).toBe(3);
  });

  it('counts only the portion of a cross-year leave range that falls in the year', () => {
    const application = {
      EmployeeId: 'EMP-1001',
      LeaveType: 'Unannounced Leave',
      RequestStatus: 'Submitted',
      RequestDate: '2026-12-31',
      FromDate: '2026-12-31',
      ToDate: '2027-01-02',
      TotalLeaveDaysRequested: '3',
    } as LeaveApplicationRecord;

    expect(rosterUnannouncedLeaveDaysForYear(
      [application],
      'EMP-1001',
      2026,
      new Date(2027, 0, 3),
    )).toBe(1);
    expect(rosterUnannouncedLeaveDaysForYear(
      [application],
      'EMP-1001',
      2027,
      new Date(2027, 0, 3),
    )).toBe(2);
  });

  it('does not include leave dates after today in the annual total', () => {
    const applications = [
      { EmployeeId: 'EMP-1001', LeaveType: 'Unannounced Leave', RequestStatus: 'Approved', RequestDate: '2026-10-16', FromDate: '2026-10-15', ToDate: '2026-10-17', TotalLeaveDaysRequested: '3' },
      { EmployeeId: 'EMP-1001', LeaveType: 'Unannounced Leave', RequestStatus: 'Approved', RequestDate: '2026-10-20', FromDate: '2026-10-20', ToDate: '2026-10-21', TotalLeaveDaysRequested: '2' },
    ] as LeaveApplicationRecord[];

    expect(rosterUnannouncedLeaveDaysForYear(
      applications,
      'EMP-1001',
      2026,
      new Date(2026, 9, 16),
    )).toBe(2);
  });

  it('adds past unposted absences from earlier roster months through today', () => {
    const today = new Date(2026, 9, 16);
    const roster = [
      { employee_id: 'EMP-1001', shift_date: '2026-01-02', shift: 'M' },
      { employee_id: 'EMP-1001', shift_date: '2026-06-01', shift: 'M' },
      { employee_id: 'EMP-1001', shift_date: '2026-10-16', shift: 'M' },
      { employee_id: 'EMP-1001', shift_date: '2026-10-17', shift: 'M' },
    ] as EmployeeRosterListRecord[];
    const attendance = new Map<string, AttendanceDailyRecord>([
      ['emp-1001|2026-01-02', { PunchIn: '2026-01-02T09:00:00', PunchOut: '' } as AttendanceDailyRecord],
    ]);

    expect(rosterUnannouncedAbsenceDatesForYear(
      'EMP-1001',
      indexRosterShifts(roster),
      attendance,
      [],
      today,
    )).toEqual(['2026-06-01']);
  });
});

describe('rosterPeriodForDate', () => {
  it('selects the first half through the 15th', () => {
    expect(rosterPeriodForDate(new Date(2026, 8, 15))).toEqual({
      monthLabel: 'September 2026',
      monthHalf: 'First Half',
    });
  });

  describe('rosterDaysForMonthHalf', () => {
    const days = Array.from({ length: 31 }, (_, index) => ({ date: index + 1 }));

    it('returns all dates for Whole Month', () => {
      expect(rosterDaysForMonthHalf(days, 'Whole Month')).toEqual(days);
    });

    it('keeps the existing first-half and second-half ranges', () => {
      expect(rosterDaysForMonthHalf(days, 'First Half').map(({ date }) => date))
        .toEqual(Array.from({ length: 15 }, (_, index) => index + 1));
      expect(rosterDaysForMonthHalf(days, 'Second Half').map(({ date }) => date))
        .toEqual(Array.from({ length: 16 }, (_, index) => index + 16));
    });
  });

  it('selects the second half from the 16th onward', () => {
    expect(rosterPeriodForDate(new Date(2026, 8, 16))).toEqual({
      monthLabel: 'September 2026',
      monthHalf: 'Second Half',
    });
  });
});
