import { Injectable, signal } from '@angular/core';

export interface PayrollSetupRecord {
  id: number;
  formNumber: string;
  employeeId: string;
  employeeName: string;
  employeeCategory: string;
  employmentNature: string;
  employmentType: string;
  workGradeLevel: string;
  department: string;
  designation: string;
  jobTitle: string;
  location: string;
  basicSalary: number;
  medicalAllowance: number;
  fuelAllowance: number;
  mobileAllowance: number;
  carAllowance: number;
  otherAllowances: number;
  overtime: number;
  bonus: number;
  arrears: number;
  providentFund: number;
  gratuity: number;
  eobi: number;
  loanInstallment: number;
  otherDeductions: number;
  netPayable: number;
  selected?: boolean;
}

export type PayrollSetupColumnKey = Exclude<keyof PayrollSetupRecord, 'id' | 'selected'>;

export const PAYROLL_SETUP_TABLE_COLUMNS: Array<{ key: PayrollSetupColumnKey; label: string }> = [
  { key: 'formNumber', label: 'Form Number' },
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'employeeName', label: 'Employee Name' },
  { key: 'employeeCategory', label: 'Employee Category' },
  { key: 'employmentNature', label: 'Employment Nature' },
  { key: 'employmentType', label: 'Employment Type' },
  { key: 'workGradeLevel', label: 'Work / Grade Level' },
  { key: 'department', label: 'Department' },
  { key: 'designation', label: 'Designation' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'location', label: 'Location' },
  { key: 'basicSalary', label: 'Basic Salary' },
  { key: 'medicalAllowance', label: 'Medical Allowance' },
  { key: 'fuelAllowance', label: 'Fuel Allowance' },
  { key: 'mobileAllowance', label: 'Mobile Allowance' },
  { key: 'carAllowance', label: 'Car Allowance' },
  { key: 'otherAllowances', label: 'Other Allowances' },
  { key: 'overtime', label: 'Overtime' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'arrears', label: 'Arrears' },
  { key: 'providentFund', label: 'Provident Fund' },
  { key: 'gratuity', label: 'Gratuity' },
  { key: 'eobi', label: 'EOBI' },
  { key: 'loanInstallment', label: 'Loan Installment' },
  { key: 'otherDeductions', label: 'Other Deductions' },
  { key: 'netPayable', label: 'Net Payable' },
];

export type PayrollSetupAmounts = Pick<
  PayrollSetupRecord,
  | 'basicSalary'
  | 'medicalAllowance'
  | 'fuelAllowance'
  | 'mobileAllowance'
  | 'carAllowance'
  | 'otherAllowances'
  | 'overtime'
  | 'bonus'
  | 'arrears'
  | 'providentFund'
  | 'gratuity'
  | 'eobi'
  | 'loanInstallment'
  | 'otherDeductions'
>;

export function computeNetPayable(amounts: PayrollSetupAmounts): number {
  const earnings =
    amounts.basicSalary +
    amounts.fuelAllowance +
    amounts.mobileAllowance +
    amounts.carAllowance +
    amounts.otherAllowances +
    amounts.bonus +
    amounts.overtime +
    amounts.arrears;
  const deductions =
    amounts.providentFund +
    amounts.eobi +
    amounts.loanInstallment +
    amounts.otherDeductions;
  return Math.max(0, earnings - deductions + amounts.gratuity);
}

export function roundPayrollAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Medical Allowance = Gross Salary / 110 × 10
 * Matches Application Form: Gross is entered; medical is derived from gross.
 */
export function computeMedicalAllowance(grossSalary: number): number {
  if (grossSalary <= 0) {
    return 0;
  }
  return roundPayrollAmount((grossSalary / 110) * 10);
}

export function computeGrossSalaryBreakdown(
  grossSalary: number,
  paymentMode: string,
  cashPercentage: number | string = 0,
  bankPercentage: number | string = 0,
): { grossSalaryInCash: number; grossSalaryInBank: number } {
  const salary = Math.max(0, Number(grossSalary) || 0);
  const normalizedMode = (paymentMode ?? '').toString().trim().toLowerCase();
  const cashRatio = Number(cashPercentage) || 0;
  const bankRatio = Number(bankPercentage) || 0;

  const isCashMode = ['cash', 'cash salary', 'salary in cash'].includes(normalizedMode);
  const isBankMode = ['bank', 'bank salary', 'salary in bank', 'bank transfer', 'banktransfer'].includes(normalizedMode);

  if (isCashMode) {
    return { grossSalaryInCash: salary, grossSalaryInBank: 0 };
  }

  if (isBankMode) {
    return { grossSalaryInCash: 0, grossSalaryInBank: salary };
  }

  const cashPercent = Number.isFinite(cashRatio) && cashRatio > 0 ? cashRatio : Math.max(0, 100 - bankRatio);
  const bankPercent = Number.isFinite(bankRatio) && bankRatio > 0 ? bankRatio : Math.max(0, 100 - cashPercent);

  const grossSalaryInCash = roundPayrollAmount((salary * cashPercent) / 100);
  const grossSalaryInBank = roundPayrollAmount((salary * bankPercent) / 100);

  return {
    grossSalaryInCash,
    grossSalaryInBank,
  };
}

/** Basic Salary = Gross Salary in Bank / 110 × 100 */
export function computeBasicSalary(grossSalary: number, medicalAllowance?: number): number {
  if (grossSalary <= 0) {
    return 0;
  }
  const medical = medicalAllowance ?? computeMedicalAllowance(grossSalary);
  return roundPayrollAmount(Math.max(0, grossSalary - medical));
}

/** Gross Salary = Basic Salary + Medical Allowance */
export function computeGrossSalary(basicSalary: number, medicalAllowance: number): number {
  return roundPayrollAmount(basicSalary + medicalAllowance);
}

/** Fuel Allowance = Allowed Liters × Monthly Fuel Rate */
export function computeFuelAllowance(allowedLiters: number, monthlyFuelRate: number): number {
  return roundPayrollAmount(allowedLiters * monthlyFuelRate);
}

/** Provident Fund = 8.33% of Basic Salary */
export function computeProvidentFund(basicSalary: number): number {
  if (basicSalary <= 0) {
    return 0;
  }
  return roundPayrollAmount(basicSalary * 0.0833);
}

/** Overtime Rate = (Gross Salary ÷ 365) ÷ 8 */
export function computeOvertimeRate(lastMonthGrossSalary: number): number {
  if (lastMonthGrossSalary <= 0) {
    return 0;
  }
  return roundPayrollAmount((lastMonthGrossSalary / 365) / 8);
}

/** Overtime Amount = Overtime Rate × Overtime Hours */
export function computeOvertimeAmount(overtimeRate: number, overtimeHours: number): number {
  return roundPayrollAmount(overtimeRate * overtimeHours);
}

/** Years of service from date of joining to today (fractional, 2 d.p.). */
export function computeYearsOfService(dateOfJoining: string, asOf: Date = new Date()): number {
  const trimmed = dateOfJoining.trim();
  if (!trimmed) {
    return 0;
  }

  const joiningDate = new Date(trimmed);
  if (Number.isNaN(joiningDate.getTime())) {
    return 0;
  }

  const elapsedMs = asOf.getTime() - joiningDate.getTime();
  if (elapsedMs <= 0) {
    return 0;
  }

  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return roundPayrollAmount(elapsedMs / msPerYear);
}

/**
 * Gratuity formula:
 * Gross Salary × (Total Months / 12) - Gross Salary × ((Total Months - 1) / 12)
 * where Total Months is calculated from date of joining through the current payroll month.
 */
export function computeGratuity(grossSalary: number, dateOfJoining: string, asOf: Date = new Date()): number {
  if (grossSalary <= 0) {
    return 0;
  }

  const trimmed = dateOfJoining?.trim() || '';
  if (!trimmed) {
    return 0;
  }

  const joiningDate = new Date(trimmed);
  if (Number.isNaN(joiningDate.getTime())) {
    return 0;
  }

  const asOfDate = asOf ?? new Date();
  const elapsedMs = asOfDate.getTime() - joiningDate.getTime();
  if (elapsedMs <= 0) {
    return 0;
  }

  const totalMonths = Math.max(0, Math.floor(elapsedMs / (30 * 24 * 60 * 60 * 1000)) + 1);
  const gratuity = grossSalary * (totalMonths / 12) - grossSalary * ((totalMonths - 1) / 12);
  return roundPayrollAmount(Math.max(0, gratuity));
}

/** EOBI employee contribution = 1% of minimum wage */
export function computeEobiEmployeeContribution(minimumWage: number): number {
  if (minimumWage <= 0) {
    return 0;
  }
  return roundPayrollAmount(minimumWage * 0.01);
}

/** EOBI employer contribution = 5% of minimum wage */
export function computeEobiEmployerContribution(minimumWage: number): number {
  if (minimumWage <= 0) {
    return 0;
  }
  return roundPayrollAmount(minimumWage * 0.05);
}

export const DEFAULT_MINIMUM_WAGE = 37000;

export type PayrollSetupInput = Omit<PayrollSetupRecord, 'id' | 'selected' | 'netPayable'> & {
  netPayable?: number;
};

@Injectable({ providedIn: 'root' })
export class PayrollSetupService {
  private readonly recordsSignal = signal<PayrollSetupRecord[]>([]);
  private readonly minimumWageSignal = signal(DEFAULT_MINIMUM_WAGE);

  readonly records = this.recordsSignal.asReadonly();
  readonly minimumWage = this.minimumWageSignal.asReadonly();

  setMinimumWage(value: number): void {
    const parsed = Number(value);
    this.minimumWageSignal.set(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
  }

  addRecord(input: PayrollSetupInput): void {
    const amounts: PayrollSetupAmounts = {
      basicSalary: input.basicSalary,
      medicalAllowance: input.medicalAllowance,
      fuelAllowance: input.fuelAllowance,
      mobileAllowance: input.mobileAllowance,
      carAllowance: input.carAllowance,
      otherAllowances: input.otherAllowances,
      overtime: input.overtime,
      bonus: input.bonus,
      arrears: input.arrears,
      providentFund: input.providentFund,
      gratuity: input.gratuity,
      eobi: input.eobi,
      loanInstallment: input.loanInstallment,
      otherDeductions: input.otherDeductions,
    };
    const nextId = Math.max(0, ...this.recordsSignal().map((r) => r.id)) + 1;
    const record: PayrollSetupRecord = {
      ...input,
      id: nextId,
      netPayable: input.netPayable ?? computeNetPayable(amounts),
      selected: false,
    };
    this.recordsSignal.update((list) => [...list, record]);
  }
}
