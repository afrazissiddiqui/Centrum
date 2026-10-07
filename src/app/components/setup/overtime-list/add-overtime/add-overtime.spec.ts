import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AlertService } from '../../../../services/alert.service';
import {
  ApplicationFormDetail,
  ApplicationFormRecord,
  ApplicationFormService,
} from '../../../../services/application-form.service';
import { OvertimeListService } from '../../../../services/overtime-list.service';
import { AddOvertimeComponent } from './add-overtime';

describe('AddOvertimeComponent', () => {
  let fixture: ComponentFixture<AddOvertimeComponent>;
  let applicationFormService: jasmine.SpyObj<ApplicationFormService>;
  let overtimeListService: jasmine.SpyObj<OvertimeListService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    applicationFormService = jasmine.createSpyObj<ApplicationFormService>('ApplicationFormService', ['fetchEmployeeProfiles']);
    applicationFormService.fetchEmployeeProfiles.and.returnValue(of([
      {
        EmployeeCode: 'EMP-001',
        EmployeeName: 'Ayesha Khan',
        Department: 'Finance',
        EmployeeNature: '',
        Designation: 'Analyst',
        ReportingManager: '',
        EmploymentType: '',
        EmploymentStatus: '',
        EmploymentCategory: '',
        status: '',
        detail: {
          hrSettings: { attendanceShiftManagement: 'Yes' },
          remuneration: { overTimeApplicable: 'Yes' },
        } as ApplicationFormDetail,
      },
      {
        EmployeeCode: 'EMP-002',
        EmployeeName: 'Bilal Ahmed',
        Department: 'Operations',
        EmployeeNature: '',
        Designation: 'Operator',
        ReportingManager: '',
        EmploymentType: '',
        EmploymentStatus: '',
        EmploymentCategory: '',
        status: '',
        detail: {
          hrSettings: { attendanceShiftManagement: 'No' },
          remuneration: { overTimeApplicable: 'Yes' },
        } as ApplicationFormDetail,
      },
      {
        EmployeeCode: 'EMP-003',
        EmployeeName: 'Sara Ali',
        Department: 'HR',
        EmployeeNature: '',
        Designation: 'Coordinator',
        ReportingManager: '',
        EmploymentType: '',
        EmploymentStatus: '',
        EmploymentCategory: '',
        status: '',
        detail: {
          hrSettings: { attendanceShiftManagement: 'Yes' },
          remuneration: { overTimeApplicable: 'No' },
        } as ApplicationFormDetail,
      },
    ]));
    overtimeListService = jasmine.createSpyObj<OvertimeListService>(
      'OvertimeListService',
      ['fetchOvertimeList', 'postOvertimeEmployee'],
    );
    overtimeListService.fetchOvertimeList.and.returnValue(of([]));
    overtimeListService.postOvertimeEmployee.and.returnValue(of({}));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [AddOvertimeComponent],
      providers: [
        { provide: ApplicationFormService, useValue: applicationFormService },
        { provide: OvertimeListService, useValue: overtimeListService },
        { provide: AlertService, useValue: { error: jasmine.createSpy('error') } },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddOvertimeComponent);
    fixture.detectChanges();
  });

  it('displays only employees with shift and overtime applicability set to Yes', () => {
    expect(applicationFormService.fetchEmployeeProfiles).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Ayesha Khan');
    expect(fixture.nativeElement.textContent).not.toContain('Bilal Ahmed');
    expect(fixture.nativeElement.textContent).not.toContain('Sara Ali');
    expect(fixture.nativeElement.querySelectorAll('tbody input[type="checkbox"]').length).toBe(1);
  });

  it('tracks employee checkbox selections while filtering the list', () => {
    const checkbox = fixture.nativeElement.querySelector('tbody input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedEmployeeKeys().has('EMP-001')).toBe(true);

    fixture.componentInstance.onSearchChange('missing');
    fixture.detectChanges();
    fixture.componentInstance.onSearchChange('ayesha');
    fixture.detectChanges();

    const filteredCheckbox = fixture.nativeElement.querySelector('tbody input[type="checkbox"]') as HTMLInputElement;
    expect(filteredCheckbox.checked).toBe(true);
  });

  it('posts selected employees with hidden posted flag and marks successes Approved', () => {
    const checkbox = fixture.nativeElement.querySelector('tbody input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    fixture.componentInstance.postSelectedEmployees();
    fixture.detectChanges();

    expect(overtimeListService.postOvertimeEmployee).toHaveBeenCalledWith({
      employee_code: 'EMP-001',
      employee_name: 'Ayesha Khan',
      overtime_date: '2026-10-01',
      shift_id: '1',
      working_hours: 8,
      shift_hours: 8,
      overtime_hours: 0,
      overtime_rate: 0,
      exceptional_ot: 0,
      flag: '1',
    }]);
    expect(fixture.componentInstance.employees()[0].flag).toBe('1');
    expect(fixture.componentInstance.employees()[0].overtimeStatus).toBe('Approved');
    expect(fixture.componentInstance.filteredEmployees()).toHaveSize(0);
    expect(fixture.nativeElement.textContent).not.toContain('Ayesha Khan');
    expect(fixture.nativeElement.textContent).not.toContain('flag');
  });

  it('does not show employees already present in the overtime list', () => {
    overtimeListService.fetchOvertimeList.and.returnValue(of([
      { id: 'overtime-1', values: { employee_code: 'EMP-001', status: 'Pending' } },
    ]));

    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.componentInstance.employees()[0].overtimeStatus).toBe('Approved');
    expect(fixture.componentInstance.employees()[0].flag).toBe('1');
    expect(fixture.componentInstance.filteredEmployees()).toHaveSize(0);
    expect(fixture.nativeElement.textContent).not.toContain('Ayesha Khan');
  });

  it('keeps a failed employee unposted and selected for retry', () => {
    overtimeListService.postOvertimeEmployee.and.returnValue(throwError(() => new Error('Network error')));
    const checkbox = fixture.nativeElement.querySelector('tbody input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    fixture.componentInstance.postSelectedEmployees();
    fixture.detectChanges();

    expect(fixture.componentInstance.employees()[0].flag).toBe('0');
    expect(fixture.componentInstance.employees()[0].overtimeStatus).toBe('Not Posted');
    expect(fixture.componentInstance.selectedEmployeeKeys().has('EMP-001')).toBe(true);
  });

  it('filters the eligible employees by search text', () => {
    fixture.componentInstance.onSearchChange('finance');

    expect(fixture.componentInstance.filteredEmployees().length).toBe(1);
    fixture.componentInstance.onSearchChange('missing');
    expect(fixture.componentInstance.filteredEmployees().length).toBe(0);
  });

  it('returns to the overtime list', () => {
    fixture.componentInstance.goToList();

    expect(router.navigate).toHaveBeenCalledWith(['/setup/overtime-list']);
  });
});
