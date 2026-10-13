import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apiUrl } from '../../../config/api.config';
import { AgpAddPayload, AgpService } from './agp.service';

describe('AgpService', () => {
  let service: AgpService;
  let httpMock: HttpTestingController;

  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AgpService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AgpService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('omits the immutable base document number when updating an AGP', () => {
    const payload: AgpAddPayload = {
      type: 'Purchase Order',
      baseDocNo: 'PO-1001',
      documentDate: '2026-10-13',
      referenceNo: 'AGP-1001',
      businessPartnerCode: 'BP-01',
      businessPartnerName: 'Test Partner',
      vehicleNo: '',
      location: '',
      reasonForMovement: '',
      requestingEmployee: '',
      requestingDepartment: '',
      requestedBy: '',
      issuedTo: '',
      articleOutDate: '',
      articleReturnedDate: null,
      issueResolved: 'No',
      transporterName: '',
      transporterCnic: '',
      transporterPhone: '',
      biltyNo: '',
      freightAmount: 0,
      attachmentFileName: '',
      headOfSupplyChainApproval: false,
      remarks: '',
      lines: [],
      totalQtySent: 0,
      totalQtyReceived: 0,
    };

    service.updateArticleGatePass(12, payload).subscribe();

    const req = httpMock.expectOne(`${apiUrl('article-gate-pass-update')}/12`);
    expect(req.request.method).toBe('POST');
    const body = JSON.parse(req.request.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('baseDocNo');
    expect(body['referenceNo']).toBe(payload.referenceNo);
    req.flush({ success: true });
  });
});
