import { describe, expect, it } from 'vitest';
import {
  computeBasicSalary,
  computeGratuity,
  computeGrossSalaryBreakdown,
  computeMedicalAllowance,
  computeNetPayable,
} from '../../payroll-setup/payroll-setup.service';

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
