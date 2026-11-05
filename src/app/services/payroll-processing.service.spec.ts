import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { expect } from 'vitest';
import { publicApiUrl } from '../config/api.config';
import { PayrollProcessingRecord, PayrollProcessingService } from './payroll-processing.service';

describe('PayrollProcessingService', () => {
  let service: PayrollProcessingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PayrollProcessingService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(PayrollProcessingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('maps all saved payroll line fields from the detail response', () => {
    let detail: PayrollProcessingRecord | undefined;

    service.fetchPayrollProcessingDetail(42).subscribe((result) => {
      detail = result;
    });

    const request = httpMock.expectOne(publicApiUrl('payroll-processing-detail/42'));
    expect(request.request.method).toBe('GET');
    request.flush({
      data: {
        id: 42,
        header: { month: 11, year: 2026, status: 'Posted' },
        details: [
          {
            employeeCode: 'EMP-001',
            employeeName: 'Example Employee',
            designation: 'Accountant',
            branchLocation: 'Main Branch',
            costCenter: 'FIN-01',
            overTimeApplicable: 1,
            salary: 50000,
            grossSalary: 52000,
            ratePerDay: 1733.33,
            absentDays: 2,
            absentAmount: 3466.66,
            payableAmount: 48533.34,
            extraWorkingDays: 1,
            rateExtraDay: 1733.33,
            paymentForEwd: 1733.33,
            overtime: 1200,
            advance: 500,
            loanAdvForm: 250,
            deductions: 750,
            balance: 47783.34,
            childBenefits: 1000,
            netPaid: 48783.34,
            counting: 48783.34,
            grossSalaryInCash: 10000,
            grossSalaryInBank: 42000,
          },
        ],
      },
    });

    const line = detail!.Details[0];
    expect(line).toMatchObject({
      employeeCode: 'EMP-001',
      personName: 'Example Employee',
      designation: 'Accountant',
      branch: 'Main Branch',
      location: 'Main Branch',
      costCenter: 'FIN-01',
      overtimeApplicable: true,
      salary: 50000,
      grossSalary: 52000,
      ratePerDay: 1733.33,
      absentDays: 2,
      absentAmount: 3466.66,
      payableAmount: 48533.34,
      extraWorkingDays: 1,
      rateExtraDay: 1733.33,
      paymentForEwd: 1733.33,
      overtime: 1200,
      advance: 500,
      loanAdjustment: 500,
      loanAdvForm: 250,
      deductions: 750,
      balance: 47783.34,
      netPayableAfterTax: 47783.34,
      childBenefits: 1000,
      netPaid: 48783.34,
      counting: 48783.34,
      netPayableManagement: 48783.34,
      grossSalaryInCash: 10000,
      grossSalaryInBank: 42000,
    });
  });
});
