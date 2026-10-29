import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { attendanceSearchUserId, calculateLeaveOverlapDays, indexLeaveDatesByType } from './attendance-managment';

describe('attendanceSearchUserId', () => {
  it('uses exact numeric employee searches to scope date-range requests', () => {
    expect(attendanceSearchUserId('179', 'dateRange')).toBe('179');
    expect(attendanceSearchUserId(' Emp-00000179 ', 'dateRange')).toBe('Emp-00000179');
  });

  it('keeps partial text and non-date-range searches client-side', () => {
    expect(attendanceSearchUserId('Inam Ullah', 'dateRange')).toBe('');
    expect(attendanceSearchUserId('17', 'date')).toBe('');
  });
});

describe('calculateLeaveOverlapDays', () => {
  it('counts overlapping leave days within the selected attendance range', () => {
    expect(calculateLeaveOverlapDays('01/10/2026', '05/10/2026', '2026-10-01', '2026-10-31')).toBe(5);
    expect(calculateLeaveOverlapDays('2026-10-15', '2026-10-18', '2026-10-01', '2026-10-10')).toBe(0);
    expect(calculateLeaveOverlapDays('2026-10-28T00:00:00.000000Z', '2026-10-30T00:00:00.000000Z', '2026-10-01', '2026-10-31')).toBe(3);
  });
});

describe('indexLeaveDatesByType', () => {
  it('marks unannounced leave as unpaid and other requested leave as paid on absent days only', () => {
    const result = indexLeaveDatesByType(
      [
        { employeeKey: 'employee-3', employeeCode: 'Emp-00000003', absentDates: ['2026-10-01', '2026-10-04', '2026-10-07'] },
        { employeeKey: 'employee-4', employeeCode: 'Emp-00000004', absentDates: ['2026-10-10', '2026-10-13'] },
      ],
      [
        { EmployeeId: '3', FromDate: '2026-10-01', ToDate: '2026-10-03', LeaveType: 'Annual' },
        { EmployeeId: 'Emp-00000003', FromDate: '2026-10-03', ToDate: '2026-10-05', LeaveType: 'Annual' },
        { EmployeeId: 'Emp-00000003', FromDate: '2026-10-07', ToDate: '2026-10-07', LeaveType: 'Unannounced Leave' },
        { EmployeeId: 'Emp-00000004', FromDate: '2026-10-10', ToDate: '2026-10-12', LeaveType: 'Unannounced Leave' },
      ],
      '2026-10-01',
      '2026-10-31',
    );

    expect([...result.get('employee-3')?.paidDates ?? []]).toEqual(['2026-10-01', '2026-10-04']);
    expect([...result.get('employee-3')?.unpaidDates ?? []]).toEqual(['2026-10-07']);
    expect([...result.get('employee-4')?.paidDates ?? []]).toEqual([]);
    expect([...result.get('employee-4')?.unpaidDates ?? []]).toEqual(['2026-10-10']);
  });
});