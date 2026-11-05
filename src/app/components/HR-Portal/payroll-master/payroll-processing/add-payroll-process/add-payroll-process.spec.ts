import { describe, expect, it } from 'vitest';
import {
  computeBasicSalary,
  computeGratuity,
  computeGrossSalaryPayable,
  computeGrossSalaryBreakdown,
  computeAdvanceBalance,
  computeMedicalAllowance,
  computeNetPaid,
  computeNetPayable,
  computeOvertimeAmount,
  computeOvertimeRate,
  computePayableAmount,
  computeRatePerDay,
} from '../../payroll-setup/payroll-setup.service';
import { sumSubmittedOvertimeHours } from '../payroll-overtime.util';
import { selectPayrollEmployeesForSubmission } from '../payroll-employee-selection.util';

describe('computeOvertimeRate', () => {
  it('calculates the hourly rate by dividing gross salary by 26 days and 8 hours', () => {
    expect(computeOvertimeRate(30000)).toBe(144.23);
  });

  it('returns zero for non-positive gross salary', () => {
    expect(computeOvertimeRate(0)).toBe(0);
    expect(computeOvertimeRate(-30000)).toBe(0);
  });

  it('calculates overtime pay from the hourly rate and overtime hours', () => {
    expect(computeOvertimeAmount(computeOvertimeRate(30000), 5)).toBe(721.15);
  });
});

describe('computeRatePerDay', () => {
  it('divides gross salary by 30', () => {
    expect(computeRatePerDay(90000)).toBe(3000);
  });
});

describe('sumSubmittedOvertimeHours', () => {
  it('sums only submitted hours for the selected employee and payroll month', () => {
    const records = [
      {
        id: '1',
        values: {
          employee_code: 'EMP-001',
          overtime_date: '2026-10-01',
          overtime_hours: 2.5,
          flag: '1',
        },
      },
      {
        id: '2',
        values: {
          employeeCode: 'emp-001',
          overtimeDate: '2026-10-15',
          overtimeHours: '1.5',
          flag: 1,
        },
      },
      {
        id: '3',
        values: {
          employee_code: 'EMP-001',
          overtime_date: '2026-09-30',
          overtime_hours: 8,
          flag: '1',
        },
      },
      {
        id: '4',
        values: {
          employee_code: 'EMP-001',
          overtime_date: '2026-10-20',
          overtime_hours: 4,
          flag: '0',
        },
      },
      {
        id: '5',
        values: {
          employee_code: 'EMP-002',
          overtime_date: '2026-10-20',
          overtime_hours: 7,
          flag: '1',
        },
      },
    ];

    expect(sumSubmittedOvertimeHours(records, ['EMP-001'], '2026-10')).toBe(4);
  });
});

describe('selectPayrollEmployeesForSubmission', () => {
  it('submits all employees when none are approved', () => {
    const employees = [
      { id: 1, approved: false },
      { id: 2, approved: false },
    ];

    expect(selectPayrollEmployeesForSubmission(employees, (employee) => employee.approved))
      .toEqual(employees);
  });

  it('submits only approved employees when at least one is approved', () => {
    const employees = [
      { id: 1, approved: true },
      { id: 2, approved: false },
    ];

    expect(selectPayrollEmployeesForSubmission(employees, (employee) => employee.approved))
      .toEqual([employees[0]]);
  });
});

describe('computeGrossSalaryBreakdown', () => {
  it('splits hybrid salary between cash and bank based on percentages', () => {
    const result = computeGrossSalaryBreakdown(100000, 'Hybrid', 40, 60);

    expect(result.grossSalaryInCash).toBe(40000);
    expect(result.grossSalaryInBank).toBe(60000);
  });

  it('treats cash-only and bank-only payroll as full allocation to one side', () => {
    expect(computeGrossSalaryBreakdown(100000, 'Cash', '', '')).toEqual({
      grossSalaryInCash: 100000,
      grossSalaryInBank: 0,
    });

    expect(computeGrossSalaryBreakdown(100000, 'Bank', '', '')).toEqual({
      grossSalaryInCash: 0,
      grossSalaryInBank: 100000,
    });

    expect(computeGrossSalaryBreakdown(100000, 'Bank Salary', '', '')).toEqual({
      grossSalaryInCash: 0,
      grossSalaryInBank: 100000,
    });

    expect(computeGrossSalaryBreakdown(100000, 'Cash Salary', '', '')).toEqual({
      grossSalaryInCash: 100000,
      grossSalaryInBank: 0,
    });
  });

  it('derives basic salary as gross salary in bank divided by 110 times 100', () => {
    const bankGross = computeGrossSalaryBreakdown(15000, 'Bank', '', '').grossSalaryInBank;
    expect(computeBasicSalary(bankGross)).toBeCloseTo((bankGross / 110) * 100, 2);
  });

  it('derives medical allowance as gross salary in bank divided by 110 times 10', () => {
    const bankGross = computeGrossSalaryBreakdown(15000, 'Bank', '', '').grossSalaryInBank;
    const medicalAllowance = computeMedicalAllowance(bankGross);

    expect(medicalAllowance).toBeCloseTo(1363.64, 2);
  });

  it('uses bank gross rather than total hybrid gross for medical allowance', () => {
    const breakdown = computeGrossSalaryBreakdown(1092000, 'Hybrid', 50, 50);

    expect(breakdown.grossSalaryInBank).toBe(546000);
    expect(computeMedicalAllowance(breakdown.grossSalaryInBank)).toBeCloseTo(49636.36, 2);
    expect(computeMedicalAllowance(1092000)).toBeCloseTo(99272.73, 2);
  });

  it('uses the bank gross for basic salary regardless of the payment mode', () => {
    for (const [mode, cashPercentage, bankPercentage] of [
      ['Bank', '', ''],
      ['Cash', '', ''],
      ['Hybrid', 40, 60],
    ] as const) {
      const breakdown = computeGrossSalaryBreakdown(
        100000,
        mode,
        cashPercentage,
        bankPercentage,
      );

      expect(computeBasicSalary(breakdown.grossSalaryInBank)).toBeCloseTo(
        (breakdown.grossSalaryInBank / 110) * 100,
        2,
      );
    }
  });

  it('uses bank gross as the gratuity calculation base', () => {
    const breakdown = computeGrossSalaryBreakdown(1092000, 'Hybrid', 50, 50);
    const asOf = new Date('2025-01-01T00:00:00');

    expect(computeGratuity(breakdown.grossSalaryInBank, '2024-01-01', asOf)).toBeCloseTo(45500, 2);
    expect(computeGratuity(1092000, '2024-01-01', asOf)).toBeCloseTo(91000, 2);
  });
});

describe('computeNetPayable', () => {
  it('calculates gross payable without medical allowance in earnings', () => {
    expect(
      computeNetPayable({
        basicSalary: 100000,
        medicalAllowance: 10000,
        fuelAllowance: 5000,
        mobileAllowance: 2000,
        carAllowance: 3000,
        otherAllowances: 1000,
        bonus: 4000,
        overtime: 6000,
        providentFund: 8000,
        eobi: 1000,
        arrears: 7000,
        gratuity: 2500,
        loanInstallment: 3000,
        otherDeductions: 1500,
      }),
    ).toBe(117000);
  });
});

describe('computeGrossSalaryPayable', () => {
  it('adds the requested earnings and deducts employee contributions and adjustments', () => {
    expect(
      computeGrossSalaryPayable({
        grossSalaryInBank: 100000,
        childBenefits: 0,
        fuelAllowance: 5000,
        mobileAllowance: 2000,
        carAllowance: 3000,
        otherAllowances: 1000,
        bonus: 4000,
        overtime: 6000,
        arrears: 7000,
        providentFund: 8000,
        eobiEmployee: 1000,
        loanDeduction: 3000,
        advanceDeduction: 1500,
        lateAttendanceDeduction: 500,
      }),
    ).toBe(114000);
  });

  it('rounds to two decimals and does not return a negative payable', () => {
    const amounts = {
      grossSalaryInBank: 100.127,
      childBenefits: 0,
      fuelAllowance: 0,
      mobileAllowance: 0,
      carAllowance: 0,
      otherAllowances: 0,
      bonus: 0,
      overtime: 0,
      arrears: 0,
      providentFund: 0,
      eobiEmployee: 0,
      loanDeduction: 0,
      advanceDeduction: 0,
      lateAttendanceDeduction: 0,
    };
    expect(computeGrossSalaryPayable(amounts)).toBe(100.13);
    expect(computeGrossSalaryPayable({ ...amounts, providentFund: 200 })).toBe(0);
  });

  it('includes child benefits in payable earnings', () => {
    expect(
      computeGrossSalaryPayable({
        grossSalaryInBank: 1000,
        childBenefits: 250,
        fuelAllowance: 0,
        mobileAllowance: 0,
        carAllowance: 0,
        otherAllowances: 0,
        bonus: 0,
        overtime: 0,
        arrears: 0,
        providentFund: 0,
        eobiEmployee: 0,
        loanDeduction: 0,
        advanceDeduction: 0,
        lateAttendanceDeduction: 0,
      }),
    ).toBe(1250);
  });
});

describe('computePayableAmount', () => {
  it('subtracts the absent amount from gross salary', () => {
    expect(computePayableAmount(80000, 5000)).toBe(75000);
  });
});

describe('computeNetPaid', () => {
  it('subtracts deductions and adds EWD payment and child benefits to payable amount', () => {
    expect(computeNetPaid(75000, 5000, 1200, 250)).toBe(71450);
  });

  it('rounds net paid to two decimal places', () => {
    expect(computeNetPaid(1000.125, 10.001, 25.555, 5.005)).toBe(1020.68);
  });
});

describe('computeAdvanceBalance', () => {
  it('subtracts the entered deduction from the advance and allows a negative balance', () => {
    expect(computeAdvanceBalance(10000, 2500)).toBe(7500);
    expect(computeAdvanceBalance(1000, 1500)).toBe(-500);
  });

  it('does not return a negative payable amount', () => {
    expect(computePayableAmount(5000, 8000)).toBe(0);
  });
});
