import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { IgpService } from './igp.service';
import { AuthService } from '../../../services/auth.service';

describe('IgpService', () => {
  let service: IgpService;
  let httpMock: HttpTestingController;
  let authService: { getSessionUser: jasmine.Spy };

  beforeEach(() => {
    authService = {
      getSessionUser: jasmine.createSpy('getSessionUser'),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        IgpService,
        { provide: AuthService, useValue: authService },
      ],
    });

    service = TestBed.inject(IgpService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('keeps records when the API exposes branch values through alternate fields', (done) => {
    authService.getSessionUser.and.returnValue({ is_admin: false, branch: '1' } as any);

    service.fetchInwardGatePasses().subscribe({
      next: (records) => {
        expect(records.length).toBe(1);
        expect(records[0].referenceNo).toBe('IGP-100');
        done();
      },
      error: done.fail,
    });

    const req = httpMock.expectOne((request) => request.method === 'GET');
    req.flush([
      {
        referenceNo: 'IGP-100',
        businessPartnerName: 'ABC Traders',
        branchName: 'Peshawar',
      },
    ]);
  });

  it('maps SAP document type and branch fields for the listing columns', (done) => {
    authService.getSessionUser.and.returnValue({ is_admin: true } as any);

    service.fetchInwardGatePasses().subscribe({
      next: (records) => {
        expect(records[0].type).toBe('Purchase Order');
        expect(records[0].location).toBe('DHA');
        done();
      },
      error: done.fail,
    });

    const req = httpMock.expectOne((request) => request.method === 'GET');
    req.flush([
      {
        referenceNo: 'IGP-600',
        DocType: 'Purchase Order',
        BPLNAME: 'DHA',
      },
    ]);
  });

  it('filters records to the current user branch access', (done) => {
    authService.getSessionUser.and.returnValue({ is_admin: false, branch: '3' } as any);

    service.fetchInwardGatePasses().subscribe({
      next: (records) => {
        expect(records.length).toBe(1);
        expect(records[0].referenceNo).toBe('IGP-400');
        done();
      },
      error: done.fail,
    });

    const req = httpMock.expectOne((request) => request.method === 'GET');
    req.flush([
      {
        referenceNo: 'IGP-400',
        businessPartnerName: 'ABC Traders',
        location: 'FSD',
      },
      {
        referenceNo: 'IGP-500',
        businessPartnerName: 'XYZ Traders',
        location: 'Peshawar',
      },
    ]);
  });

  it('extracts records from wrapped response envelopes', (done) => {
    authService.getSessionUser.and.returnValue({ is_admin: true } as any);

    service.fetchInwardGatePasses().subscribe({
      next: (records) => {
        expect(records.length).toBe(1);
        expect(records[0].referenceNo).toBe('IGP-200');
        done();
      },
      error: done.fail,
    });

    const req = httpMock.expectOne((request) => request.method === 'GET');
    req.flush({
      status: true,
      data: {
        value: [
          {
            referenceNo: 'IGP-200',
            businessPartnerName: 'XYZ Traders',
            location: 'HO',
          },
        ],
      },
    });
  });

  it('keeps records for users whose branch access is provided as a comma-separated string', (done) => {
    authService.getSessionUser.and.returnValue({ is_admin: false, branch: '1,3' } as any);

    service.fetchInwardGatePasses().subscribe({
      next: (records) => {
        expect(records.length).toBe(1);
        expect(records[0].referenceNo).toBe('IGP-300');
        done();
      },
      error: done.fail,
    });

    const req = httpMock.expectOne((request) => request.method === 'GET');
    req.flush([
      {
        referenceNo: 'IGP-300',
        businessPartnerName: 'ABC Traders',
        location: 'Peshawar',
      },
    ]);
  });
});
