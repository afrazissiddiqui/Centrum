import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AlertService } from '../../../../services/alert.service';
import {
  ApplicationFormDetail,
  ApplicationFormRecord,
  ApplicationFormService,
} from '../../../../services/application-form.service';
import { AddOvertimeComponent } from './add-overtime';

describe('AddOvertimeComponent', () => {
  let fixture: ComponentFixture<AddOvertimeComponent>;
  let applicationFormService: jasmine.SpyObj<ApplicationFormService>;
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
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [AddOvertimeComponent],
      providers: [
        { provide: ApplicationFormService, useValue: applicationFormService },
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
