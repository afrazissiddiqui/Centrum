import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { apiUrl, publicApiUrl } from '../config/api.config';

export interface PayrollProcessingHeaderPayload {
  month: number;
  year: number;
  remarks: string;
  currency: string;
  status: string;
  processedBy: number;
  processedDate: string;
  fuelPriceAdjust?: number;
  minimumWageAdjust?: number;
}

export interface PayrollProcessingDetailPayload {
  employeeId: string;
  employeeCode: string;
  personName: string;
  username: string;
  designation: string;
  department: string;
  employeeCategory: string;
  employmentNature: string;
  employmentType: string;
  jobTitle: string;
  branch: string;
  location: string;
  workGradeLevel: string;
  dateOfJoining: string;
  yearsOfService: number;
  overtimeApplicable: boolean;
  allowancesApplicable: boolean;
  eobiApplicable: boolean;
  providentApplicable: boolean;
  basicSalary: number;
  grossSalary: number;
  grossSalaryInCash: number;
  grossSalaryInBank: number;
  childBenefits: number;
  paymentMode: string;
  medicalAllowance: number;
  allowedLiters: number;
  monthlyFuelRate: number;
  fuelAllowance: number;
  mobileAllowance: number;
  carAllowance: number;
  otherAllowances: number;
  bonus: number;
  lastMonthGrossSalary: number;
  overtimeHours: number;
  overtime: number;
  providentFund: number;
  providentFundEmployer: number;
  socialSecurityPunjab: number;
  socialSecurityKpk: number;
  gratuity: number;
  eobiEmployee: number;
  eobiEmployer: number;
  arrears: number;
  loanAdjustment: number;
  loanAdvForm: number;
  lateAttendDeduction: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  costToCompany: number;
  taxDeduction: number;
  totalEarnings: number;
  netPayable: number;
  netPayableAfterTax: number;
  netPayableManagement: number;
  finalGrossSalary: number;
  approved: boolean;
}

export interface PayrollProcessingSubmitPayload {
  header: PayrollProcessingHeaderPayload;
  details: PayrollProcessingDetailPayload[];
}

export interface PayrollProcessingListRecord {
  Id: number;
  Month: number;
  Year: number;
  Remarks: string;
  Currency: string;
  Status: string;
  ProcessedBy: number;
  ProcessedDate: string;
  EmployeeCount: number;
}

export interface PayrollProcessingRecord {
  Id: number;
  Header: PayrollProcessingHeaderPayload;
  Details: PayrollProcessingDetailPayload[];
}

const PAYROLL_PROCESSING_LIST_URL = publicApiUrl('payroll-processing-list');
const PAYROLL_PROCESSING_ADD_URL = apiUrl('payroll-processing-add');
const PAYROLL_PROCESSING_DETAIL_URL = apiUrl('payroll-processing-detail');

@Injectable({
  providedIn: 'root',
})
export class PayrollProcessingService {
  private readonly http = inject(HttpClient);
  private readonly recordList = signal<PayrollProcessingListRecord[]>([]);

  readonly records = this.recordList.asReadonly();

  fetchPayrollProcessingList(): Observable<PayrollProcessingListRecord[]> {
    return this.http.get<unknown>(PAYROLL_PROCESSING_LIST_URL).pipe(
      map((response) => this.extractApiItems(response).map((item) => this.mapApiItemToListRecord(item))),
      tap((records) => this.recordList.set(records)),
    );
  }

  fetchPayrollProcessingDetail(id: string | number): Observable<PayrollProcessingRecord> {
    const identifier = encodeURIComponent(String(id));
    const numericId = Number.parseInt(String(id), 10) || 0;

    return this.http.get<unknown>(`${PAYROLL_PROCESSING_DETAIL_URL}/${identifier}`).pipe(
      map((response) => {
        const record = this.mapDetailResponse(response);
        if (!record.Id && numericId) {
          return { ...record, Id: numericId };
        }
        return record;
      }),
    );
  }

  addPayrollProcessing(payload: PayrollProcessingSubmitPayload): Observable<unknown> {
    return this.http.post(PAYROLL_PROCESSING_ADD_URL, payload);
  }

  private mapDetailResponse(response: unknown): PayrollProcessingRecord {
    const root = this.unwrapRecord(response);
    const headerSource = this.pickNestedRecord(root['header']) ?? root;
    const detailsSource = this.extractDetailItems(root);

    return {
      Id: this.pickNumber([root, headerSource], ['Id', 'id', 'ID']),
      Header: this.mapHeader(headerSource),
      Details: detailsSource.map((item) => this.mapDetailItem(item)),
    };
  }

  private mapApiItemToListRecord(item: Record<string, unknown>): PayrollProcessingListRecord {
    const header = this.pickNestedRecord(item['header']) ?? item;
    const details = this.extractDetailItems(item);
    const sources = [item, header];

    return {
      Id: this.pickNumber(sources, ['Id', 'id', 'ID']),
      Month: this.pickNumber(sources, ['month', 'Month']),
      Year: this.pickNumber(sources, ['year', 'Year']),
      Remarks: this.pickString(sources, ['remarks', 'Remarks']),
      Currency: this.pickString(sources, ['currency', 'Currency']) || 'PKR',
      Status: this.pickString(sources, ['status', 'Status']),
      ProcessedBy: this.pickNumber(sources, ['processedBy', 'processed_by', 'ProcessedBy']),
      ProcessedDate: this.pickString(sources, ['processedDate', 'processed_date', 'ProcessedDate']),
      EmployeeCount:
        details.length ||
        this.pickNumber(sources, ['employeeCount', 'employee_count', 'EmployeeCount', 'detailsCount', 'details_count']),
    };
  }

  private mapHeader(source: Record<string, unknown>): PayrollProcessingHeaderPayload {
    return {
      month: this.pickNumber([source], ['month', 'Month']),
      year: this.pickNumber([source], ['year', 'Year']),
      remarks: this.pickString([source], ['remarks', 'Remarks']),
      currency: this.pickString([source], ['currency', 'Currency']) || 'PKR',
      status: this.pickString([source], ['status', 'Status']) || 'Draft',
      processedBy: this.pickNumber([source], ['processedBy', 'processed_by', 'ProcessedBy']),
      processedDate: this.pickString([source], ['processedDate', 'processed_date', 'ProcessedDate']),
      fuelPriceAdjust: this.pickAmount(source, ['fuelPriceAdjust', 'fuel_price_adjust', 'FuelPriceAdjust']),
      minimumWageAdjust: this.pickAmount(source, ['minimumWageAdjust', 'minimum_wage_adjust', 'MinimumWageAdjust']),
    };
  }

  private mapDetailItem(item: Record<string, unknown>): PayrollProcessingDetailPayload {
    return {
      employeeId: this.pickString([item], ['employeeId', 'employee_id', 'EmployeeId']),
      employeeCode: this.pickString([item], ['employeeCode', 'employee_code', 'EmployeeCode']),
      personName: this.pickString([item], ['personName', 'person_name', 'PersonName', 'employeeName', 'employee_name']),
      username: this.pickString([item], ['username', 'userName', 'user_name', 'Username']),
      designation: this.pickString([item], ['designation', 'Designation']),
      department: this.pickString([item], ['department', 'Department']),
      employeeCategory: this.pickString([item], ['employeeCategory', 'employee_category', 'EmployeeCategory']),
      employmentNature: this.pickString([item], ['employmentNature', 'employment_nature', 'EmploymentNature']),
      employmentType: this.pickString([item], ['employmentType', 'employment_type', 'EmploymentType']),
      jobTitle: this.pickString([item], ['jobTitle', 'job_title', 'JobTitle']),
      branch: this.pickString([item], ['branch', 'Branch', 'location', 'Location']),
      location: this.pickString([item], ['location', 'Location', 'branch', 'Branch']),
      workGradeLevel: this.pickString([item], ['workGradeLevel', 'work_grade_level', 'WorkGradeLevel']),
      dateOfJoining: this.pickString([item], ['dateOfJoining', 'date_of_joining', 'DateOfJoining']),
      yearsOfService: this.pickAmount(item, ['yearsOfService', 'years_of_service', 'YearsOfService']),
      overtimeApplicable: this.pickBoolean(item, ['overtimeApplicable', 'overtime_applicable', 'OvertimeApplicable']),
      allowancesApplicable: this.pickBoolean(item, ['allowancesApplicable', 'allowances_applicable', 'AllowancesApplicable']),
      eobiApplicable: this.pickBoolean(item, ['eobiApplicable', 'eobi_applicable', 'EobiApplicable']),
      providentApplicable: this.pickBoolean(item, ['providentApplicable', 'provident_applicable', 'ProvidentApplicable']),
      basicSalary: this.pickAmount(item, ['basicSalary', 'basic_salary', 'BasicSalary']),
      grossSalary: this.pickAmount(item, ['grossSalary', 'gross_salary', 'GrossSalary']),
      grossSalaryInCash: this.pickAmount(item, ['grossSalaryInCash', 'gross_salary_in_cash', 'GrossSalaryInCash']),
      grossSalaryInBank: this.pickAmount(item, ['grossSalaryInBank', 'gross_salary_in_bank', 'GrossSalaryInBank']),
      childBenefits: this.pickAmount(item, ['childBenefits', 'child_benefits', 'ChildBenefits']),
      paymentMode: this.pickString([item], ['paymentMode', 'payment_mode', 'PaymentMode']),
      medicalAllowance: this.pickAmount(item, ['medicalAllowance', 'medical_allowance', 'MedicalAllowance']),
      allowedLiters: this.pickAmount(item, ['allowedLiters', 'allowed_liters', 'AllowedLiters']),
      monthlyFuelRate: this.pickAmount(item, ['monthlyFuelRate', 'monthly_fuel_rate', 'MonthlyFuelRate']),
      fuelAllowance: this.pickAmount(item, ['fuelAllowance', 'fuel_allowance', 'FuelAllowance']),
      mobileAllowance: this.pickAmount(item, ['mobileAllowance', 'mobile_allowance', 'MobileAllowance']),
      carAllowance: this.pickAmount(item, ['carAllowance', 'car_allowance', 'CarAllowance']),
      otherAllowances: this.pickAmount(item, ['otherAllowances', 'other_allowances', 'OtherAllowances']),
      bonus: this.pickAmount(item, ['bonus', 'Bonus']),
      lastMonthGrossSalary: this.pickAmount(item, ['lastMonthGrossSalary', 'last_month_gross_salary', 'LastMonthGrossSalary']),
      overtimeHours: this.pickAmount(item, ['overtimeHours', 'overtime_hours', 'OvertimeHours']),
      overtime: this.pickAmount(item, ['overtime', 'Overtime']),
      providentFund: this.pickAmount(item, ['providentFund', 'provident_fund', 'ProvidentFund']),
      providentFundEmployer: this.pickAmount(item, ['providentFundEmployer', 'provident_fund_employer', 'ProvidentFundEmployer']),
      socialSecurityPunjab: this.pickAmount(item, ['socialSecurityPunjab', 'social_security_punjab', 'SocialSecurityPunjab']),
      socialSecurityKpk: this.pickAmount(item, ['socialSecurityKpk', 'social_security_kpk', 'SocialSecurityKpk']),
      gratuity: this.pickAmount(item, ['gratuity', 'Gratuity']),
      eobiEmployee: this.pickAmount(item, ['eobiEmployee', 'eobi_employee', 'EobiEmployee', 'eobi', 'EOBI']),
      eobiEmployer: this.pickAmount(item, ['eobiEmployer', 'eobi_employer', 'EobiEmployer']),
      arrears: this.pickAmount(item, ['arrears', 'Arrears']),
      loanAdjustment: this.pickAmount(item, ['loanAdjustment', 'loan_adjustment', 'LoanAdjustment', 'loanInstallment', 'loan_installment']),
      loanAdvForm: this.pickAmount(item, ['loanAdvForm', 'loan_adv_form', 'LoanAdvForm', 'otherDeductions', 'other_deductions']),
      lateAttendDeduction: this.pickAmount(item, ['lateAttendDeduction', 'late_attend_deduction', 'LateAttendDeduction']),
      paidLeaveDays: this.pickAmount(item, ['paidLeaveDays', 'paid_leave_days', 'PaidLeaveDays']),
      unpaidLeaveDays: this.pickAmount(item, ['unpaidLeaveDays', 'unpaid_leave_days', 'UnpaidLeaveDays']),
      costToCompany: this.pickAmount(item, ['costToCompany', 'cost_to_company', 'CostToCompany']),
      taxDeduction: this.pickAmount(item, ['taxDeduction', 'tax_deduction', 'TaxDeduction']),
      totalEarnings: this.pickAmount(item, ['totalEarnings', 'total_earnings', 'TotalEarnings']),
      netPayable: this.pickAmount(item, ['netPayable', 'net_payable', 'NetPayable']),
      netPayableAfterTax: this.pickAmount(item, ['netPayableAfterTax', 'net_payable_after_tax', 'NetPayableAfterTax']),
      netPayableManagement: this.pickAmount(item, ['netPayableManagement', 'net_payable_management', 'NetPayableManagement']),
      finalGrossSalary: this.pickAmount(item, ['finalGrossSalary', 'final_gross_salary', 'FinalGrossSalary']),
      approved: this.pickBoolean(item, ['approved', 'Approved']),
    };
  }

  private extractDetailItems(source: Record<string, unknown>): Array<Record<string, unknown>> {
    const details = source['details'] ?? source['Details'] ?? source['payrollDetails'] ?? source['payroll_details'];
    if (Array.isArray(details)) {
      return details.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }
    return [];
  }

  private unwrapRecord(response: unknown): Record<string, unknown> {
    if (!response || typeof response !== 'object') {
      return {};
    }

    const obj = response as Record<string, unknown>;
    const nested = obj['data'] ?? obj['record'] ?? obj['result'];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }

    return obj;
  }

  private pickNestedRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private extractApiItems(response: unknown): Array<Record<string, unknown>> {
    if (!response) {
      return [];
    }

    if (Array.isArray(response)) {
      return response.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }

    if (typeof response !== 'object') {
      return [];
    }

    const obj = response as Record<string, unknown>;
    const arrayKeys = [
      'data',
      'items',
      'results',
      'records',
      'list',
      'payrollProcessingList',
      'payroll_processing_list',
      'payrollProcessings',
      'payroll_processings',
    ];

    for (const key of arrayKeys) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
      }
    }

    const nestedData = obj['data'];
    if (nestedData && typeof nestedData === 'object') {
      const nestedItems = this.extractApiItems(nestedData);
      if (nestedItems.length > 0) {
        return nestedItems;
      }
    }

    if (obj['header'] || obj['month'] || obj['year'] || obj['remarks']) {
      return [obj];
    }

    return [];
  }

  private pickString(sources: Array<Record<string, unknown>>, keys: string[]): string {
    for (const source of sources) {
      for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          return String(value).trim();
        }
      }
    }
    return '';
  }

  private pickNumber(sources: Array<Record<string, unknown>>, keys: string[]): number {
    const text = this.pickString(sources, keys);
    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private pickAmount(source: Record<string, unknown>, keys: string[]): number {
    return this.pickNumber([source], keys);
  }

  private pickBoolean(source: Record<string, unknown>, keys: string[]): boolean {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'boolean') {
        return value;
      }
      if (value === 1 || value === '1' || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'yes') {
        return true;
      }
      if (value === 0 || value === '0' || String(value).toLowerCase() === 'false' || String(value).toLowerCase() === 'no') {
        return false;
      }
    }
    return false;
  }
}
