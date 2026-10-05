import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiUrl } from '../config/api.config';
import {
  GlAccountDeterminationAddPayload,
  GlAccountDeterminationService,
} from './gl-account-determination.service';

describe('GlAccountDeterminationService', () => {
  let service: GlAccountDeterminationService;
  let httpMock: HttpTestingController;

  const payload: GlAccountDeterminationAddPayload = {
    form: 'Job Specification Form',
    type: 'Salary',
    code: '1000',
    name: 'Cash',
    branch: '2',
    debit_credit_type: 'DEBIT',
    business_partner: 'BP-01',
    costCenterType: 'COS',
    CctCode: 'COS',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        GlAccountDeterminationService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(GlAccountDeterminationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('reports an API-level failure instead of treating HTTP 200 as a saved row', () => {
    let error: unknown;
    service.addGlAccountDetermination(payload).subscribe({
      error: (responseError: unknown) => {
        error = responseError;
      },
    });

    const request = httpMock.expectOne(apiUrl('gl-account-determination-add'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({ status: false, message: 'Duplicate mapping rejected.' });

    expect(error).toEqual(jasmine.any(Error));
    expect((error as Error).message).toBe('Duplicate mapping rejected.');
  });

  it('includes debit_credit_type in the add request payload', () => {
    service.addGlAccountDetermination({ ...payload, debit_credit_type: 'DEBIT' }).subscribe();

    const request = httpMock.expectOne(apiUrl('gl-account-determination-add'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    expect(request.request.body.debit_credit_type).toBe('DEBIT');
    request.flush({ status: true, message: 'Saved' });
  });

  it('posts debit_credit_type when updating an existing row', () => {
    service.updateGlAccountDetermination(13, payload).subscribe();

    const request = httpMock.expectOne(`${apiUrl('gl-account-determination-update')}/13`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    expect(request.request.body.debit_credit_type).toBe('DEBIT');
    request.flush({ status: true, message: 'Updated' });
  });

  it('accepts an explicit successful API response', () => {
    let response: unknown;
    service.addGlAccountDetermination(payload).subscribe((result) => {
      response = result;
    });

    const request = httpMock.expectOne(apiUrl('gl-account-determination-add'));
    request.flush({ status: true, message: 'Saved' });

    expect(response).toEqual({ status: true, message: 'Saved' });
  });

  it('maps the debit/credit value from the list response for saved lines', () => {
    let records: unknown;
    service.fetchGlAccountDeterminations().subscribe((result) => {
      records = result;
    });

    const request = httpMock.expectOne(apiUrl('gl-account-determination-list'));
    request.flush({
      status: true,
      data: [
        {
          id: 1,
          type: 'Salary',
          code: '1000',
          name: 'Cash',
          branch: '2',
          form: 'Job Specification Form',
          debitCreditType: 'CREDIT',
        },
      ],
    });

    expect(records).toEqual(
      jasmine.arrayContaining([
        jasmine.objectContaining({ DebitCreditType: 'CREDIT' }),
      ]),
    );
  });
});
