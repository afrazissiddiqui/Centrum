import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { countPayrollLeaveDays, payrollLeaveSearchEmployeeCode } from './payroll-leave.util';

describe('payrollLeaveSearchEmployeeCode', () => {
  it('formats numeric employee codes for the leave search API', () => {
    expect(payrollLeaveSearchEmployeeCode('EMP-00000033')).toBe('emp-00000033');
    expect(payrollLeaveSearchEmployeeCode('Emp-00000115')).toBe('emp-00000115');
  });
});

describe('countPayrollLeaveDays', () => {
  it('counts unique paid and unpaid leave days overlapping the payroll month', () => {
    const result = countPayrollLeaveDays(
      [
        {
          EmployeeId: 'Emp-00000011',
          FromDate: '2026-09-29',
          ToDate: '2026-10-02',
          LeaveType: 'Annual',
        },
        {
          EmployeeId: 'emp-00000011',
          FromDate: '2026-10-02',
          ToDate: '2026-10-03',
          LeaveType: 'Unannounced Leave',
        },
        {
          EmployeeId: 'Emp-00000011',
          FromDate: '2026-10-03',
          ToDate: '2026-10-04',
          LeaveType: 'Sick',
        },
        {
          EmployeeId: 'Emp-00000012',
          FromDate: '2026-11-01',
          ToDate: '2026-11-03',
          LeaveType: 'Annual',
        },
      ],
      '2026-10',
    );

    expect(result.get('00000011')).toEqual({ paid: 2, unpaid: 2 });
    expect(result.has('00000012')).toBe(false);
  });

  it('accepts slash-formatted dates and returns no counts for invalid payroll months', () => {
    const result = countPayrollLeaveDays(
      [{
        EmployeeId: 'Emp-00000011',
        FromDate: '31/10/2026',
        ToDate: '01/11/2026',
        LeaveType: 'Annual',
      }],
      '2026-10',
    );

    expect(result.get('00000011')).toEqual({ paid: 1, unpaid: 0 });
    expect(countPayrollLeaveDays([], '2026-13', new Map())).toEqual(new Map());
  });

  it('counts leave request dates even when attendance has no matching absence slots', () => {
    const result = countPayrollLeaveDays(
      [{
        EmployeeId: 'Emp-00000011',
        FromDate: '2026-10-01',
        ToDate: '2026-10-03',
        LeaveType: 'Annual',
      }],
      '2026-10',
    );

    expect(result.get('00000011')).toEqual({ paid: 3, unpaid: 0 });
  });

  it('counts the leave application shown in the September payroll period', () => {
    const result = countPayrollLeaveDays(
      [{
        EmployeeId: 'Emp-00000033',
        FromDate: '29/09/2026',
        ToDate: '30/09/2026',
        LeaveType: 'Causal',
      }],
      '2026-09',
    );

    expect(result.get('00000033')).toEqual({ paid: 2, unpaid: 0 });
  });
});
