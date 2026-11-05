// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JobSpecificationService } from './job-specification.service';

describe('JobSpecificationService', () => {
  let service: JobSpecificationService;
  let httpMock: HttpTestingController;

  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [JobSpecificationService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(JobSpecificationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  afterAll(() => {
    TestBed.resetTestEnvironment();
  });

  it('maps advancePercentAllowed from the job specification API response', () => {
    let advancePercentAllowed = '';
    service.fetchJobSpecificationsForApplication().subscribe((records) => {
      advancePercentAllowed = records[0]?.advancePercentAllowed ?? '';
    });

    const request = httpMock.expectOne((req) =>
      req.url.endsWith('/job-specification-list') && req.params.get('status') === '2',
    );
    request.flush([{
      id: 1,
      jobTitle: 'Developer',
      advancePercentAllowed: '10000.00',
    }]);

    expect(advancePercentAllowed).toBe('10000.00');
  });
});
