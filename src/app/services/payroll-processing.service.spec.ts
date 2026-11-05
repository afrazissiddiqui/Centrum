import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { publicApiUrl } from '../config/api.config';
import {
  PayrollProcessingListRecord,
  PayrollProcessingRecord,
  PayrollProcessingSubmitPayload,
  PayrollProcessingService,
} from './payroll-processing.service';

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

  it('sends advance in each payroll detail when saving', () => {
    const payload: PayrollProcessingSubmitPayload = {
      header: {
        document_name: 'Payroll_Processing',
        payrollMonth: '2026-01',
        status: 'Pending',
        branch: 'DHA',
        remarks: '',
        processedBy: 1,
        processedDate: '2026-01-31',
      },
      details: [{
        employeeCode: 'EMP-003',
        employeeName: 'Test Employee',
        designation: 'Accountant',
        branchLocation: 'DHA',
        costCenter: 'FIN',
        overTimeApplicable: 0,
        salary: 50000,
        grossSalary: 50000,
        ratePerDay: 0,
        absentDays: 0,
        absentAmount: 0,
        payableAmount: 50000,
        extraWorkingDays: 0,
        rateExtraDay: 0,
        paymentForEwd: 0,
        overtime: 0,
        advance: 5000,
        loanAdvForm: 5000,
        deductions: 0,
        balance: 50000,
        childBenefits: 0,
        netPaid: 50000,
        counting: 50000,
        grossSalaryInCash: 0,
        grossSalaryInBank: 50000,
      }],
    };

    service.addPayrollProcessing(payload).subscribe();

    const request = httpMock.expectOne(publicApiUrl('payroll-processing-add'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body.details[0].advance).toBe(5000);
    request.flush({ success: true });
  });

  it('maps the saved employee branch scope for the payroll list', () => {
    let records: PayrollProcessingListRecord[] | undefined;

    service.fetchPayrollProcessingList().subscribe((result) => {
      records = result;
    });

    const request = httpMock.expectOne(publicApiUrl('payroll-processing-list'));
    expect(request.request.method).toBe('GET');
    request.flush({
      data: [
        { id: 1, header: { branch: 'All Branches' }, details: [] },
        { id: 2, header: { branch: 'DHA' }, details: [] },
      ],
    });

    expect(records?.map((record) => record.Branch)).toEqual(['All Branches', 'DHA']);
  });

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

  it('maps the saved Advance value when the API returns it as advance', () => {
    let detail: PayrollProcessingRecord | undefined;

    service.fetchPayrollProcessingDetail(43).subscribe((result) => {
      detail = result;
    });

    const request = httpMock.expectOne(publicApiUrl('payroll-processing-detail/43'));
    request.flush({
      data: {
        id: 43,
        header: { month: 11, year: 2026 },
        details: [{ employeeCode: 'EMP-002', advance: 1250 }],
      },
    });

    expect(detail?.Details[0].advance).toBe(1250);
  });

  it('preserves a zero Advance value from a posted payroll detail response', () => {
    let detail: PayrollProcessingRecord | undefined;

    service.fetchPayrollProcessingDetail(3).subscribe((result) => {
      detail = result;
    });

    const request = httpMock.expectOne(publicApiUrl('payroll-processing-detail/3'));
    expect(request.request.method).toBe('GET');
    request.flush({
      data: {
        id: 3,
        header: { month: 1, year: 2026, status: 'Pending' },
        details: [{ employeeCode: 'EMP-003', advance: 0 }],
      },
    });

    expect(detail?.Details[0].advance).toBe(0);
  });
});
