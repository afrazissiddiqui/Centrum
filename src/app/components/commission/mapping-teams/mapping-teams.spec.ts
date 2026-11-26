import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { publicApiUrl } from '../../../config/api.config';
import { MappingTeamsComponent } from './mapping-teams';

describe('MappingTeamsComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MappingTeamsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads mapping rows and payroll employee choices from the mapping list API', () => {
    const fixture = TestBed.createComponent(MappingTeamsComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();

    const request = httpMock.expectOne(publicApiUrl('commission-mapping-list'));
    expect(request.request.method).toBe('GET');
    request.flush({
      status: true,
      data: [
        {
          id: 2,
          tab_type: 'sap',
          code: 'SLP-14',
          source_label: 'Salesperson',
          sap_slp_code: 14,
          employee_id: 1004,
          assignment_value: 'Ali Raza',
          branch: 'DHA',
          context_label: null,
          effective_from: '2026-11-01',
          status: 'Mapped',
        },
      ],
      employees: [
        { id: 1004, code: 'EMP-1004', name: 'Ali Raza', branch_id: '1', branch_name: 'DHA' },
        { id: 1011, code: 'EMP-1011', name: 'Ahmed Khan', branch_id: '1', branch_name: 'DHA' },
      ],
      summary: { total: 1, mapped: 1, unmapped: 0 },
    });

    expect(component.rowsByTab().sap).toEqual([
      {
        id: '2',
        tabType: 'sap',
        code: 'SLP-14',
        source: 'Salesperson',
        assignment: 'EMP-1004 · Ali Raza',
        assignmentValue: 'Ali Raza',
        employeeId: '1004',
        assignmentOptions: [
          { id: '1004', code: 'EMP-1004', label: 'EMP-1004 · Ali Raza' },
          { id: '1011', code: 'EMP-1011', label: 'EMP-1011 · Ahmed Khan' },
        ],
        branch: 'DHA',
        context: 'DHA',
        contextLabel: '',
        effectiveFrom: '01 Nov 2026',
        effectiveFromValue: '2026-11-01',
        status: 'Mapped',
        sapSlpCode: 14,
        sapDocEntry: null,
        splitPercentage: 100,
        meta: null,
      },
    ]);
    expect(component.branches()).toEqual(['DHA']);
    expect(component.mappingTotals()).toEqual({ total: 1, mapped: 1, unmapped: 0 });
    expect(component.isLoading()).toBe(false);
    expect(component.loadError()).toBe('');
  });

  it('reports a failed mapping list request instead of showing an empty list as successful', () => {
    const fixture = TestBed.createComponent(MappingTeamsComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();
    httpMock.expectOne(publicApiUrl('commission-mapping-list')).flush('Unavailable', {
      status: 500,
      statusText: 'Server Error',
    });

    expect(component.isLoading()).toBe(false);
    expect(component.loadError()).toBe('Unable to load mappings and teams. Please try again later.');
    expect(component.rowsByTab().sap).toEqual([]);
  });

  it('updates mapping status and mapped total when a payroll employee is assigned', () => {
    const fixture = TestBed.createComponent(MappingTeamsComponent);
    const component = fixture.componentInstance;
    component.rowsByTab.update((rowsByTab) => ({
      ...rowsByTab,
      sap: [{
        id: 'slp-14',
        tabType: 'sap',
        code: 'SLP-14',
        source: 'Salesperson',
        assignment: '',
        assignmentValue: '',
        employeeId: null,
        assignmentOptions: [
          { id: '1017', code: 'EMP-1017', label: 'EMP-1017 · Sana Iqbal' },
        ],
        branch: 'DHA',
        context: 'DHA',
        contextLabel: '',
        effectiveFrom: '01 Nov 2026',
        effectiveFromValue: '2026-11-01',
        status: 'Unmapped',
        sapSlpCode: 14,
        sapDocEntry: null,
        splitPercentage: 100,
        meta: null,
      }],
    }));

    component.updateAssignment('slp-14', 'EMP-1017 · Sana Iqbal');

    expect(component.rowsByTab().sap[0].status).toBe('Mapped');
    expect(component.mappedSalespeople()).toBe(1);
  });

  it('posts mapping edits with the selected payroll employee id', () => {
    const fixture = TestBed.createComponent(MappingTeamsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    httpMock.expectOne(publicApiUrl('commission-mapping-list')).flush({
      status: true,
      data: [{
        id: 2,
        tab_type: 'sap',
        code: 'SLP-14',
        source_label: 'Salesperson',
        sap_slp_code: 14,
        employee_id: 1004,
        assignment_value: 'Ali Raza',
        branch: 'DHA',
        effective_from: '2026-11-01',
        status: 'Mapped',
      }],
      employees: [
        { id: 1004, code: 'EMP-1004', name: 'Ali Raza' },
        { id: 1011, code: 'EMP-1011', name: 'Ahmed Khan' },
      ],
    });

    component.updateAssignment('2', 'EMP-1011 · Ahmed Khan');
    component.saveMappings();

    const request = httpMock.expectOne(publicApiUrl('commission-mapping-save'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      mappings: [{
        id: 2,
        tab_type: 'sap',
        code: 'SLP-14',
        source_label: 'Salesperson',
        employee_id: 1011,
        assignment_value: 'EMP-1011',
        branch: 'DHA',
        split_percentage: 100,
        sap_slp_code: 14,
        effective_from: '2026-11-01',
      }],
    });
    request.flush({ status: true });

    expect(component.notice()).toBe('Mapping changes saved successfully.');
    expect(component.isSaving()).toBe(false);
  });

  it('validates mappings with an empty request body and displays API warnings', () => {
    const fixture = TestBed.createComponent(MappingTeamsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    httpMock.expectOne(publicApiUrl('commission-mapping-list')).flush({
      status: true,
      data: [],
      employees: [],
    });

    component.validateMappings();

    const request = httpMock.expectOne(publicApiUrl('commission-mapping-validate'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({
      status: true,
      valid: false,
      warnings: ['Unmapped SAP salesperson mapping exists.'],
    });

    expect(component.validationResult()).toBe('invalid');
    expect(component.validationMessage()).toBe('Unmapped SAP mappings were found.');
    expect(component.validationWarnings()).toEqual(['Unmapped SAP salesperson mapping exists.']);
    expect(component.isValidating()).toBe(false);
  });

  it('switches mapping tables with the selected category', () => {
    const fixture = TestBed.createComponent(MappingTeamsComponent);
    const component = fixture.componentInstance;
    component.rowsByTab.update((rowsByTab) => ({
      ...rowsByTab,
      assembly: [{
        id: 'assembly-a',
        tabType: 'assembly',
        code: 'Team A',
        source: 'Assembly North',
        assignment: 'Bilal Siddiqui',
        assignmentValue: 'Bilal Siddiqui',
        employeeId: null,
        assignmentOptions: [{ id: '', code: 'Bilal Siddiqui', label: 'Bilal Siddiqui' }],
        branch: 'DHA',
        context: '8 members',
        contextLabel: '8 members',
        effectiveFrom: '01 Jan 2026',
        effectiveFromValue: '2026-01-01',
        status: 'Active',
        sapSlpCode: null,
        sapDocEntry: null,
        splitPercentage: 100,
        meta: null,
      }],
    }));

    component.selectTab('assembly');

    expect(component.activeTab().title).toBe('Assembly Teams');
    expect(component.visibleRows().length).toBe(1);
  });
});
