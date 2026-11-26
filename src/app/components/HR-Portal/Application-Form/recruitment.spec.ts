import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApplicationFormRecord, ApplicationFormService } from '../../../services/application-form.service';
import { AlertService } from '../../../services/alert.service';
import { PermissionService } from '../../../services/permission.service';
import { TableFilterService } from '../../table-filter';
import { RecruitmentComponent } from './recruitment';

function applicationRecord(employeeCode: string, branchLocation: string): ApplicationFormRecord {
  return {
    EmployeeCode: employeeCode,
    EmployeeName: employeeCode,
    Department: 'Operations',
    EmployeeNature: 'Permanent',
    Designation: 'Officer',
    ReportingManager: 'Manager',
    EmploymentType: 'Full time',
    EmploymentStatus: 'Active',
    EmploymentCategory: 'Staff',
    status: 'Active',
    detail: { personalInfo: { branchLocation } } as ApplicationFormRecord['detail'],
  };
}

describe('RecruitmentComponent', () => {
  let records: ApplicationFormRecord[];

  beforeEach(async () => {
    records = [
      applicationRecord('EMP-001', '1'),
      applicationRecord('EMP-002', 'DHA'),
      applicationRecord('EMP-003', '2'),
    ];

    await TestBed.configureTestingModule({
      imports: [RecruitmentComponent],
      providers: [
        provideRouter([]),
        {
          provide: ApplicationFormService,
          useValue: {
            fetchEmployeeProfiles: () => of([]),
            getApplicationRecords: () => records,
          },
        },
        { provide: AlertService, useValue: { error: () => undefined } },
        {
          provide: PermissionService,
          useValue: { can: () => true, assertCan: () => true },
        },
        {
          provide: TableFilterService,
          useValue: { filterItems: (items: ApplicationFormRecord[]) => items, hasActive: () => false },
        },
      ],
    }).compileComponents();
  });

  it('filters submitted applications by branch and resets pagination', () => {
    const fixture = TestBed.createComponent(RecruitmentComponent);
    const component = fixture.componentInstance;
    component.currentPage = 3;

    component.onBranchChange('1');

    expect(component.filteredList.map((record) => record.EmployeeCode)).toEqual([
      'EMP-001',
      'EMP-002',
    ]);
    expect(component.currentPage).toBe(1);
    expect(component.hasActiveListFilters()).toBe(true);
  });

  it('shows all submitted applications when the branch filter is cleared', () => {
    const fixture = TestBed.createComponent(RecruitmentComponent);
    const component = fixture.componentInstance;

    component.onBranchChange('1');
    component.onBranchChange('');

    expect(component.filteredList.length).toBe(3);
    expect(component.hasActiveListFilters()).toBe(false);
  });
});
