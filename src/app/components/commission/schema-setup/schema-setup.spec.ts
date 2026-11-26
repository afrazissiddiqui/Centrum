import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { publicApiUrl } from '../../../config/api.config';
import { SchemaSetupComponent } from './schema-setup';

function createScheme() {
  return {
    id: '1',
    code: 'SCH-SLS-01',
    type: 'Employee Sales',
    rate: 2,
    rateMode: 'Percentage' as const,
    branch: 'All Branches',
    effectiveFrom: '2026-07-01',
    effectiveTo: '',
    status: 'Active' as const,
    basis: '% of Eligible Amount',
    employeeTeam: 'All Sales Employees',
    minTarget: 100000,
    maxCap: null,
  };
}

describe('SchemaSetupComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SchemaSetupComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches and maps configured commission schemes from the public API', () => {
    const fixture = TestBed.createComponent(SchemaSetupComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();

    const request = httpMock.expectOne(publicApiUrl('commission-scheme-list'));
    expect(request.request.method).toBe('GET');
    request.flush({
      status: true,
      data: [
        {
          id: 2,
          code: 'SCH-SLS-DHA-01',
          type: 'Employee Sales',
          basis: '% of Eligible Amount',
          rate: 3,
          rate_mode: 'Percentage',
          branch: 'DHA',
          employee_team: 'Sales Team A',
          min_target: 150000,
          max_cap: 60000,
          effective_from: '2026-11-01',
          effective_to: '2027-12-31',
          status: 'Inactive',
        },
      ],
    });

    expect(component.schemes()).toEqual([
      {
        id: '2',
        code: 'SCH-SLS-DHA-01',
        type: 'Employee Sales',
        rate: 3,
        rateMode: 'Percentage',
        branch: 'DHA',
        effectiveFrom: '2026-11-01',
        effectiveTo: '2027-12-31',
        status: 'Inactive',
        basis: '% of Eligible Amount',
        employeeTeam: 'Sales Team A',
        minTarget: 150000,
        maxCap: 60000,
      },
    ]);
    expect(component.isLoading()).toBe(false);
    expect(component.loadError()).toBe('');
  });

  it('reports an API error instead of showing an empty list as successful', () => {
    const fixture = TestBed.createComponent(SchemaSetupComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();
    httpMock.expectOne(publicApiUrl('commission-scheme-list')).flush('Unavailable', {
      status: 500,
      statusText: 'Server Error',
    });

    expect(component.isLoading()).toBe(false);
    expect(component.loadError()).toBe('Unable to load commission schemes. Please try again later.');
  });

  it('offers the configured branch values', () => {
    const fixture = TestBed.createComponent(SchemaSetupComponent);
    const component = fixture.componentInstance;

    expect(component.branches).toEqual([
      'All Branches',
      'DHA',
      'Johar Town',
      'MB',
      'SAM',
      'RUDA',
    ]);
  });

  it('updates the selected scheme without adding another row', () => {
    const fixture = TestBed.createComponent(SchemaSetupComponent);
    const component = fixture.componentInstance;
    const original = createScheme();
    component.schemes.set([original]);

    component.editScheme(original);
    component.draft.code = 'SCH-SLS-UPDATED';
    component.saveScheme();

    expect(component.schemes().length).toBe(1);
    expect(component.schemes()[0].code).toBe('SCH-SLS-UPDATED');
    expect(component.notice()).toBe('SCH-SLS-UPDATED saved successfully.');
  });

  it('blocks overlapping active schemes when prevention is enabled', () => {
    const fixture = TestBed.createComponent(SchemaSetupComponent);
    const component = fixture.componentInstance;
    component.schemes.set([createScheme()]);
    component.draft.code = 'SCH-SLS-02';
    component.draft.effectiveFrom = '2026-07-01';
    component.draft.rate = 2.5;

    component.saveScheme();

    expect(component.schemes().length).toBe(1);
    expect(component.notice()).toContain('overlaps this branch and date range');
  });
});
