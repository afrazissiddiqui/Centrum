import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AttendanceManagementService } from '../../../../services/attendance-management.service';
import { AlertService } from '../../../../services/alert.service';
import {
  ApplicationFormDetail,
  ApplicationFormRecord,
  ApplicationFormService,
} from '../../../../services/application-form.service';
import { OvertimeListService } from '../../../../services/overtime-list.service';
import { WorkstationService } from '../../../../services/workstation.service';
import { AddOvertimeComponent } from './add-overtime';

describe('AddOvertimeComponent', () => {
  let fixture: ComponentFixture<AddOvertimeComponent>;
  let applicationFormService: jasmine.SpyObj<ApplicationFormService>;
  let overtimeListService: jasmine.SpyObj<OvertimeListService>;
  let attendanceService: jasmine.SpyObj<AttendanceManagementService>;
  let workstationService: jasmine.SpyObj<WorkstationService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    applicationFormService = jasmine.createSpyObj<ApplicationFormService>(
      'ApplicationFormService',
      ['fetchEmployeeProfiles', 'fetchEmployeeRosterList'],
    );
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
        ExtEmpNo: '4023',
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
    applicationFormService.fetchEmployeeRosterList.and.returnValue(of([]));
    overtimeListService = jasmine.createSpyObj<OvertimeListService>(
      'OvertimeListService',
      ['fetchOvertimeList', 'postOvertimeEmployee'],
    );
    overtimeListService.fetchOvertimeList.and.returnValue(of([]));
    overtimeListService.postOvertimeEmployee.and.returnValue(of({}));
    attendanceService = jasmine.createSpyObj<AttendanceManagementService>(
      'AttendanceManagementService',
      ['fetchCalculatedWorkingHoursByDate'],
    );
    attendanceService.fetchCalculatedWorkingHoursByDate.and.returnValue(of([]));
    workstationService = jasmine.createSpyObj<WorkstationService>(
      'WorkstationService',
      ['fetchWorkstations'],
    );
    workstationService.fetchWorkstations.and.returnValue(of([]));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [AddOvertimeComponent],
      providers: [
        { provide: ApplicationFormService, useValue: applicationFormService },
        { provide: OvertimeListService, useValue: overtimeListService },
        { provide: AttendanceManagementService, useValue: attendanceService },
        { provide: WorkstationService, useValue: workstationService },
        { provide: AlertService, useValue: { error: jasmine.createSpy('error') } },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddOvertimeComponent);
    fixture.detectChanges();
  });

  it('displays only employees with shift and overtime applicability set to Yes', () => {
    expect(applicationFormService.fetchEmployeeProfiles).toHaveBeenCalled();
    expect(attendanceService.fetchCalculatedWorkingHoursByDate).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Ayesha Khan');
    expect(fixture.nativeElement.textContent).not.toContain('Bilal Ahmed');
    expect(fixture.nativeElement.textContent).not.toContain('Sara Ali');
    expect(fixture.nativeElement.querySelectorAll('tbody input[type="checkbox"]').length).toBe(1);
  });

  it('uses the selected date for attendance hours', () => {
    fixture.componentInstance.onDateChange('2026-10-06');

    expect(fixture.componentInstance.selectedDate()).toBe('2026-10-06');
    expect(attendanceService.fetchCalculatedWorkingHoursByDate).toHaveBeenCalledWith(
      { mode: 'dateRange', fromDate: '2026-10-01', toDate: '2026-10-31' },
      '4023',
    );
  });

  it('provides a Today shortcut for the date filter', () => {
    fixture.componentInstance.onDateChange('2026-10-06');
    fixture.componentInstance.setTodayDate();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedDate()).toBe(fixture.componentInstance.todayDate());
    expect(fixture.nativeElement.querySelector('.add-overtime-today')).toBeTruthy();
  });

  it('shows the loading indicator in the working-hours cell only', () => {
    fixture.componentInstance.hoursLoading.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.add-overtime-hours-loader')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.add-overtime-empty')).toBeNull();
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

  it('loads working hours using the employee legacy code and displays both hour values', () => {
    applicationFormService.fetchEmployeeProfiles.and.returnValue(of([{
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
      ExtEmpNo: '9999',
      detail: {
        hrSettings: { attendanceShiftManagement: 'Yes' },
        remuneration: { overTimeApplicable: 'Yes' },
        loginDetails: { legacyCode: '4023' },
      } as ApplicationFormDetail,
    }]));
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const monthStart = `${date.slice(0, 7)}-01`;
    const monthEnd = `${date.slice(0, 7)}-${String(new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
    const secondWorkedDate = `${date.slice(0, 7)}-01`;
    applicationFormService.fetchEmployeeRosterList.and.returnValue(of([{
      employee_id: 'EMP-001',
      employee_name: 'Ayesha Khan',
      department: 'Finance',
      designation: 'Analyst',
      employment_status: 'Active',
      shift_date: date,
      shift: 'M',
      role: '',
      hub: '',
      note: null,
    }, {
      employee_id: 'EMP-001',
      employee_name: 'Ayesha Khan',
      department: 'Finance',
      designation: 'Analyst',
      employment_status: 'Active',
      shift_date: secondWorkedDate,
      shift: 'M',
      role: '',
      hub: '',
      note: null,
    }]));
    workstationService.fetchWorkstations.and.returnValue(of([{
      id: '1',
      name: 'Morning',
      code: 'M',
      officeInTime: '09:00',
      officeOutTime: '17:30',
      inGraceMinutes: 0,
      outGraceMinutes: 0,
      shift: 'Morning',
      description: '',
      status: 1,
    }]));
    attendanceService.fetchCalculatedWorkingHoursByDate.and.returnValue(of([
      { date, hoursWorked: '9h 15m' },
      { date: secondWorkedDate, hoursWorked: '10h' },
    ]));

    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(attendanceService.fetchCalculatedWorkingHoursByDate).toHaveBeenCalledWith(
      { mode: 'dateRange', fromDate: monthStart, toDate: monthEnd },
      '4023',
    );
    expect(fixture.nativeElement.textContent).toContain('9h 15m');
    expect(fixture.nativeElement.textContent).toContain('8h 30m');
    expect(fixture.nativeElement.textContent).toContain('45m');
    expect(fixture.nativeElement.textContent).toContain('Monthly Overtime');
    expect(fixture.nativeElement.textContent).toContain('2h 15m');
  });

  it('shows no overtime when working hours do not exceed shift hours', () => {
    expect(fixture.componentInstance.overtimeHours({
      ...fixture.componentInstance.employees()[0],
      workingHours: '7h 45m',
      shiftHours: '8h 30m',
    })).toBe('0h');
  });

  it('posts selected employees with hidden posted flag and marks successes Approved', () => {
    const checkbox = fixture.nativeElement.querySelector('tbody input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    fixture.componentInstance.postSelectedEmployees();
    fixture.detectChanges();

    expect(overtimeListService.postOvertimeEmployee).toHaveBeenCalledWith([{
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
