import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { publicApiUrl } from '../../../config/api.config';
import { AlertService } from '../../../services/alert.service';
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

  it('posts the scheme editor fields to the add API before updating the list', () => {
    const fixture = TestBed.createComponent(SchemaSetupComponent);
    const component = fixture.componentInstance;
    component.draft.code = 'SCH-SLS-DHA-01';
    component.draft.rate = 2;
    component.draft.branch = 'DHA';
    component.draft.effectiveFrom = '2026-07-01';
    component.saveScheme();

    const request = httpMock.expectOne(publicApiUrl('commission-scheme-add'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      code: 'SCH-SLS-DHA-01',
      type: 'Employee Sales',
      basis: '% of Eligible Amount',
      rate: 2,
      rate_mode: 'Percentage',
      branch: 'DHA',
      employee_team: 'All Sales Employees',
      min_target: 0,
      max_cap: null,
      effective_from: '2026-07-01',
      effective_to: null,
      prevent_overlap: true,
      status: 'Active',
    });
    expect(component.schemes()).toEqual([]);
    request.flush({ status: true, data: { id: 1 } });

    expect(component.schemes().length).toBe(1);
    expect(component.schemes()[0].code).toBe('SCH-SLS-DHA-01');
    expect(component.schemes()[0].id).toBe('1');
    expect(component.notice()).toBe('SCH-SLS-DHA-01 saved successfully.');
  });

  it('posts edits to the update API using the selected scheme id', () => {
    const fixture = TestBed.createComponent(SchemaSetupComponent);
    const component = fixture.componentInstance;
    const original = { ...createScheme(), id: '2' };
    component.schemes.set([original]);
    component.editScheme(original);
    component.draft.code = 'SCH-SLS-DHA-UPDATED';
    component.draft.rate = 3;
    component.draft.branch = 'DHA';

    component.saveScheme();

    const request = httpMock.expectOne(publicApiUrl('commission-scheme-update') + '/2');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      code: 'SCH-SLS-DHA-UPDATED',
      type: 'Employee Sales',
      basis: '% of Eligible Amount',
      rate: 3,
      rate_mode: 'Percentage',
      branch: 'DHA',
      employee_team: 'All Sales Employees',
      min_target: 100000,
      max_cap: null,
      effective_from: '2026-07-01',
      effective_to: null,
      prevent_overlap: true,
      status: 'Active',
    });
    request.flush({ status: true, data: { id: 2 } });

    expect(component.schemes().length).toBe(1);
    expect(component.schemes()[0].id).toBe('2');
    expect(component.schemes()[0].code).toBe('SCH-SLS-DHA-UPDATED');
  });

  it('shows the API validation error when saving an overlapping scheme', () => {
    const fixture = TestBed.createComponent(SchemaSetupComponent);
    const component = fixture.componentInstance;
    component.draft.code = 'SCH-SLS-DHA-01';
    component.draft.effectiveFrom = '2026-11-01';
    component.draft.rate = 2.5;

    component.saveScheme();
    httpMock.expectOne(publicApiUrl('commission-scheme-add')).flush(
      { message: 'An overlapping active scheme exists.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(component.schemes()).toEqual([]);
    expect(component.notice()).toBe('An overlapping active scheme exists.');
    expect(component.isSaving()).toBe(false);
  });

  it('deletes the selected scheme using its id after confirmation', async () => {
    const fixture = TestBed.createComponent(SchemaSetupComponent);
    const component = fixture.componentInstance;
    const scheme = { ...createScheme(), id: '2' };
    const alertService = TestBed.inject(AlertService);
    vi.spyOn(alertService, 'confirm').mockResolvedValue({ isConfirmed: true });
    const successAlert = vi.spyOn(alertService, 'success').mockImplementation(() => undefined);
    component.schemes.set([scheme]);
    component.editScheme(scheme);

    await component.deleteScheme(scheme);

    const request = httpMock.expectOne(publicApiUrl('commission-scheme-delete') + '/2');
    expect(request.request.method).toBe('DELETE');
    request.flush({ status: true });

    expect(component.schemes()).toEqual([]);
    expect(component.selectedSchemeId()).toBeNull();
    expect(successAlert).toHaveBeenCalledWith('Deleted', 'SCH-SLS-01 removed successfully.');
  });

  it('keeps the scheme in the list when the delete API fails', async () => {
    const fixture = TestBed.createComponent(SchemaSetupComponent);
    const component = fixture.componentInstance;
    const scheme = createScheme();
    const alertService = TestBed.inject(AlertService);
    vi.spyOn(alertService, 'confirm').mockResolvedValue({ isConfirmed: true });
    const errorAlert = vi.spyOn(alertService, 'error').mockImplementation(() => undefined);
    component.schemes.set([scheme]);

    await component.deleteScheme(scheme);

    httpMock.expectOne(publicApiUrl('commission-scheme-delete') + '/1').flush(
      { message: 'Delete was rejected.' },
      { status: 500, statusText: 'Server Error' },
    );

    expect(component.schemes()).toEqual([scheme]);
    expect(errorAlert).toHaveBeenCalledWith('Delete Failed', 'Delete was rejected.');
    expect(component.deletingSchemeId()).toBeNull();
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
