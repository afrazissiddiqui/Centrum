import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiUrl } from '../config/api.config';
import { GatePassBusinessPartnerService } from '../components/gate-pass/gate-pass-business-partner.service';
import { DepartmentsPrService } from './departments-pr.service';
import { TaxCodesService } from './tax-codes.service';

describe('Purchase Request catalog loading', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        GatePassBusinessPartnerService,
        DepartmentsPrService,
        TaxCodesService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('shares an in-flight tax-code request and retries after failure', () => {
    const service = TestBed.inject(TaxCodesService);
    const responses: string[][] = [];
    service.ensureLoaded().subscribe((codes) => responses.push(codes.map((code) => code.code)));
    service.ensureLoaded().subscribe((codes) => responses.push(codes.map((code) => code.code)));

    const failedRequest = httpMock.expectOne(apiUrl('tax_codes'));
    failedRequest.flush('Requested reload not found', { status: 404, statusText: 'Not Found' });
    expect(responses).toEqual([[], []]);

    service.ensureLoaded().subscribe((codes) => responses.push(codes.map((code) => code.code)));
    httpMock.expectOne(apiUrl('tax_codes')).flush([{ code: 'PT05', name: 'Tax' }]);
    expect(responses).toEqual([[], [], ['PT05']]);
  });

  it('shares an in-flight department request and retries after failure', () => {
    const service = TestBed.inject(DepartmentsPrService);
    const responses: string[][] = [];
    service.ensureLoaded().subscribe((departments) => responses.push(departments.map((department) => department.code)));
    service.ensureLoaded().subscribe((departments) => responses.push(departments.map((department) => department.code)));

    const failedRequest = httpMock.expectOne(apiUrl('departments_PR'));
    failedRequest.flush('Requested reload not found', { status: 404, statusText: 'Not Found' });
    expect(responses).toEqual([[], []]);

    service.ensureLoaded().subscribe((departments) => responses.push(departments.map((department) => department.code)));
    httpMock.expectOne(apiUrl('departments_PR')).flush([{ code: 'PD-F-001', name: 'Finance' }]);
    expect(responses).toEqual([[], [], ['PD-F-001']]);
  });

  it('shares an in-flight business-partner request and retries after failure', () => {
    const service = TestBed.inject(GatePassBusinessPartnerService);
    const responses: string[][] = [];
    service.ensureLoaded().subscribe((partners) => responses.push(partners.map((partner) => partner.code)));
    service.ensureLoaded().subscribe((partners) => responses.push(partners.map((partner) => partner.code)));

    const failedRequest = httpMock.expectOne(apiUrl('business_partners'));
    failedRequest.flush('Requested reload not found', { status: 404, statusText: 'Not Found' });
    expect(responses).toEqual([[], []]);

    service.ensureLoaded().subscribe((partners) => responses.push(partners.map((partner) => partner.code)));
    httpMock.expectOne(apiUrl('business_partners')).flush([
      { CardCode: 'FV-000001', CardName: 'Supplier', CardType: 'S' },
    ]);
    expect(responses).toEqual([[], [], ['FV-000001']]);
  });
});
