import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { publicApiUrl } from '../config/api.config';
import { ApplicationFormService } from './application-form.service';

describe('ApplicationFormService branch lookup', () => {
  let service: ApplicationFormService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ApplicationFormService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ApplicationFormService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches and normalizes branch IDs and names', () => {
    let branches: { id: string; name: string }[] | undefined;
    service.fetchCommissionBranches().subscribe((result) => {
      branches = result;
    });

    const request = httpMock.expectOne(publicApiUrl('commission-branches'));
    expect(request.request.method).toBe('GET');
    request.flush({
      status: true,
      branches: [
        { id: 1, name: 'DHA' },
        { id: 2, name: 'Johar Town' },
      ],
    });

    expect(branches).toEqual([
      { id: '1', name: 'DHA' },
      { id: '2', name: 'Johar Town' },
    ]);
  });
});
