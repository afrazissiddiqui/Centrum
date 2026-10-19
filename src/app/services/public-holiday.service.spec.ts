import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiUrl } from '../config/api.config';
import { PublicHolidayRecord, PublicHolidayService } from './public-holiday.service';

describe('PublicHolidayService', () => {
  let service: PublicHolidayService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PublicHolidayService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(PublicHolidayService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('posts a public holiday with its date and description', () => {
    let response: unknown;
    service.addPublicHoliday({
      date: '2026-10-10',
      description: 'Pakistan Day',
    }).subscribe((result) => {
      response = result;
    });

    const request = httpMock.expectOne(apiUrl('public-holiday-add'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      date: '2026-10-10',
      description: 'Pakistan Day',
    });
    request.flush({ status: true, message: 'Public Holiday Added' });

    expect(response).toEqual({ status: true, message: 'Public Holiday Added' });
  });

  it('loads company public holidays and removes duplicate date and description entries', () => {
    let holidays: PublicHolidayRecord[] | undefined;
    service.fetchPublicHolidays().subscribe((records) => {
      holidays = records;
    });

    httpMock.expectOne(apiUrl('public-holiday-list')).flush({
      status: true,
      message: 'Public Holiday List',
      data: [
        { id: 1, date: '2026-03-23', description: 'Pakistan Day' },
        { id: 2, date: '2026-03-23', description: 'Pakistan Day' },
        { id: 3, date: '2026-05-01', description: 'Labour Day', company_name: 'Al Hafiz' },
      ],
    });

    expect(holidays).toEqual([
      {
        id: '1',
        date: '2026-03-23',
        description: 'Pakistan Day',
        company: undefined,
      },
      {
        id: '3',
        date: '2026-05-01',
        description: 'Labour Day',
        company: 'Al Hafiz',
      },
    ]);
  });
});
