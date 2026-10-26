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
import { EmployeeShiftAllocationService } from '../../../../services/employee-shift-allocation.service';
import { OvertimeListService } from '../../../../services/overtime-list.service';
import { WorkstationService } from '../../../../services/workstation.service';
import { AddOvertimeComponent } from './add-overtime';

describe('AddOvertimeComponent', () => {
  let fixture: ComponentFixture<AddOvertimeComponent>;
  let applicationFormService: jasmine.SpyObj<ApplicationFormService>;
  let employeeShiftAllocationService: jasmine.SpyObj<EmployeeShiftAllocationService>;
  let overtimeListService: jasmine.SpyObj<OvertimeListService>;
  let attendanceService: jasmine.SpyObj<AttendanceManagementService>;
  let workstationService: jasmine.SpyObj<WorkstationService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    applicationFormService = jasmine.createSpyObj<ApplicationFormService>(
      'ApplicationFormService',
      ['fetchEmployeeProfiles', 'fetchEmployeeProfileDetailsInBatches', 'fetchEmployeeRosterList'],
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
          remuneration: { overTimeApplicable: 'Yes', basicSalary: '30,000' },
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
    applicationFormService.fetchEmployeeProfileDetailsInBatches.and.returnValue(of([]));
    applicationFormService.fetchEmployeeRosterList.and.returnValue(of([]));
    employeeShiftAllocationService = jasmine.createSpyObj<EmployeeShiftAllocationService>(
      'EmployeeShiftAllocationService',
      ['fetchShiftAllocations'],
    );
    employeeShiftAllocationService.fetchShiftAllocations.and.returnValue(of([]));
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
        { provide: EmployeeShiftAllocationService, useValue: employeeShiftAllocationService },
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

  it('paginates eligible employees and resets to the first page when searching', () => {
    const component = fixture.componentInstance;
    const employee = component.employees()[0];
    component.employees.set(Array.from({ length: 26 }, (_, index) => ({
      ...employee,
      EmployeeCode: `EMP-${String(index + 1).padStart(3, '0')}`,
      EmployeeName: `Employee ${index + 1}`,
    })));
    fixture.detectChanges();

    expect(component.totalPages()).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.add-overtime-table tbody tr')).toHaveSize(25);

    const nextButton = [...fixture.nativeElement.querySelectorAll('.add-overtime-pagination__controls > button')]
      .find((button: HTMLButtonElement) => button.textContent.trim() === 'Next') as HTMLButtonElement;
    nextButton.click();
    fixture.detectChanges();

    expect(component.activePage()).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.add-overtime-table tbody tr')).toHaveSize(1);
    expect(fixture.nativeElement.textContent).toContain('Showing 26 to 26 of 26 employees');
    expect(fixture.nativeElement.textContent).toContain('Employee 26');

    component.onSearchChange('Employee');
    fixture.detectChanges();
    expect(component.activePage()).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.add-overtime-table tbody tr')).toHaveSize(25);
  });

  it('still displays eligible employees when roster or workstation data cannot be loaded', () => {
    applicationFormService.fetchEmployeeRosterList.and.returnValue(
      throwError(() => new Error('Roster endpoint unavailable')),
    );
    workstationService.fetchWorkstations.and.returnValue(
      throwError(() => new Error('Workstations endpoint unavailable')),
    );

    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.componentInstance.filteredEmployees().map((employee) => employee.EmployeeCode))
      .toContain('EMP-001');
    expect(fixture.nativeElement.textContent).toContain('Ayesha Khan');
    expect(fixture.componentInstance.employees()[0].shiftHours).toBeNull();
    expect(fixture.componentInstance.employees()[0].calculatedOvertimeHours).toBeNull();
  });

  it('filters eligible employees by department and combines the selection with search', () => {
    const component = fixture.componentInstance;
    const employee = {
      ...component.employees()[0],
      EmployeeCode: 'EMP-004',
      EmployeeName: 'Mariam Noor',
      Department: 'Operations',
    };
    component.employees.update((employees) => [...employees, employee]);
    fixture.detectChanges();

    const departmentFilter = fixture.nativeElement.querySelector(
      '[name="department-filter"]',
    ) as HTMLSelectElement;
    expect([...departmentFilter.options].map((option) => option.textContent?.trim())).toEqual([
      'All departments',
      'Finance',
      'Operations',
    ]);

    component.onDepartmentChange('Operations');
    fixture.detectChanges();
    expect(component.filteredEmployees().map((item) => item.EmployeeCode)).toEqual(['EMP-004']);
    expect(fixture.nativeElement.textContent).toContain('Mariam Noor');
    expect(fixture.nativeElement.textContent).not.toContain('Ayesha Khan');

    component.onSearchChange('Ayesha');
    fixture.detectChanges();
    expect(component.filteredEmployees()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('No employees match your filters.');
  });

  it('uses the selected month for attendance hours', () => {
    fixture.componentInstance.onMonthChange('2026-10');

    expect(fixture.componentInstance.selectedMonth()).toBe('2026-10');
    expect(attendanceService.fetchCalculatedWorkingHoursByDate).toHaveBeenCalledWith(
      { mode: 'dateRange', fromDate: '2026-10-24', toDate: '2026-11-23' },
      '4023',
    );

    fixture.componentInstance.onMonthChange('2026-12');
    expect(attendanceService.fetchCalculatedWorkingHoursByDate).toHaveBeenCalledWith(
      { mode: 'dateRange', fromDate: '2026-12-24', toDate: '2027-01-23' },
      '4023',
    );
  });

  it('displays a month filter without overtime range date filters or the range overtime column', () => {
    const monthFilter = fixture.nativeElement.querySelector('[name="hours-month"]') as HTMLInputElement;
    expect(monthFilter.type).toBe('month');
    expect(fixture.nativeElement.textContent).toContain('Overtime Hours (24th-23rd Total)');
    expect(fixture.nativeElement.querySelector('[name="overtime-from-date"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[name="overtime-to-date"]')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Overtime in Range');
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

  it('selects all visible eligible employees with the header checkbox', () => {
    const component = fixture.componentInstance;
    component.employees.set([
      { ...component.employees()[0], EmployeeCode: 'EMP-004', EmployeeName: 'Mariam Noor', Department: 'Finance' },
      { ...component.employees()[0], EmployeeCode: 'EMP-005', EmployeeName: 'Nadia Ali', Department: 'Finance' },
      { ...component.employees()[0], EmployeeCode: 'EMP-006', EmployeeName: 'Farhan Khan', Department: 'Finance', flag: '1' },
    ]);
    fixture.detectChanges();

    const selectAllCheckbox = fixture.nativeElement.querySelector(
      '.add-overtime-table__selection-heading input',
    ) as HTMLInputElement;
    selectAllCheckbox.checked = true;
    selectAllCheckbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.selectedEmployeeKeys().has('EMP-004')).toBeTrue();
    expect(component.selectedEmployeeKeys().has('EMP-005')).toBeTrue();
    expect(component.selectedEmployeeKeys().has('EMP-006')).toBeFalse();
  });

  it('loads monthly working hours using the employee legacy code', () => {
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
    const beforePeriodDate = '2026-10-23';
    const periodStartDate = '2026-10-24';
    const periodEndDate = '2026-11-23';
    const afterPeriodDate = '2026-11-24';
    applicationFormService.fetchEmployeeRosterList.and.returnValue(of([{
      employee_id: 'EMP-001',
      employee_name: 'Ayesha Khan',
      department: 'Finance',
      designation: 'Analyst',
      employment_status: 'Active',
      shift_date: beforePeriodDate,
      shift: '1',
      role: '',
      hub: '',
      note: null,
    }, {
      employee_id: 'EMP-001',
      employee_name: 'Ayesha Khan',
      department: 'Finance',
      designation: 'Analyst',
      employment_status: 'Active',
      shift_date: periodStartDate,
      shift: '1',
      role: '',
      hub: '',
      note: null,
    }, {
      employee_id: 'EMP-001',
      employee_name: 'Ayesha Khan',
      department: 'Finance',
      designation: 'Analyst',
      employment_status: 'Active',
      shift_date: periodEndDate,
      shift: '2',
      role: '',
      hub: '',
      note: null,
    }, {
      employee_id: 'EMP-001',
      employee_name: 'Ayesha Khan',
      department: 'Finance',
      designation: 'Analyst',
      employment_status: 'Active',
      shift_date: afterPeriodDate,
      shift: '1',
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
    employeeShiftAllocationService.fetchShiftAllocations.and.returnValue(of([
      {
        id: '1',
        name: 'Morning',
        code: '',
        shift: '',
        startTime: '09:00',
        endTime: '17:30',
      },
      {
        id: '2',
        name: 'Evening',
        code: '',
        shift: '',
        startTime: '10:00',
        endTime: '18:00',
      },
    ]));
    attendanceService.fetchCalculatedWorkingHoursByDate.and.returnValue(of([
      { date: beforePeriodDate, hoursWorked: '50h' },
      { date: periodStartDate, hoursWorked: '10h' },
      { date: periodEndDate, hoursWorked: '7h' },
      { date: afterPeriodDate, hoursWorked: '20h' },
    ]));

    fixture.componentInstance.onMonthChange('2026-10');
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(attendanceService.fetchCalculatedWorkingHoursByDate).toHaveBeenCalledWith(
      { mode: 'dateRange', fromDate: '2026-10-24', toDate: '2026-11-23' },
      '4023',
    );
    expect(fixture.nativeElement.textContent).toContain('17h');
    expect(fixture.nativeElement.textContent).toContain('16h 30m');
    expect(fixture.nativeElement.textContent).toContain('30m');
  });

  it('shows no overtime when working hours do not exceed shift hours', () => {
    expect(fixture.componentInstance.overtimeHours({
      ...fixture.componentInstance.employees()[0],
      workingHours: '7h 45m',
      shiftHours: '8h 30m',
    })).toBe('0h');
  });

  it('posts selected employees with hidden posted flag and marks successes Approved', () => {
    const month = fixture.componentInstance.selectedMonth();
    applicationFormService.fetchEmployeeRosterList.and.returnValue(of([{
      employee_id: 'EMP-001',
      employee_name: 'Ayesha Khan',
      department: 'Finance',
      designation: 'Analyst',
      employment_status: 'Active',
      shift_date: `${month}-01`,
      shift: '7',
      role: '',
      hub: '',
      note: null,
    }]));
    fixture.componentInstance.ngOnInit();
    fixture.componentInstance.employees.update((employees) => employees.map((employee) => ({
      ...employee,
      workingHours: '10h 30m',
      shiftHours: '8h',
      calculatedOvertimeHours: '2h 30m',
    })));
    fixture.detectChanges();

    const checkbox = fixture.nativeElement.querySelector('tbody input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    fixture.componentInstance.postSelectedEmployees();
    fixture.detectChanges();

    const payload = overtimeListService.postOvertimeEmployee.calls.mostRecent().args[0];
    expect(payload[0]).toEqual(jasmine.objectContaining({
      employee_code: 'EMP-001',
      employee_name: 'Ayesha Khan',
      overtime_date: `${month}-01`,
      shift_id: '7',
      working_hours: 10.5,
      shift_hours: 8,
      overtime_hours: 2.5,
      overtime_rate: 144.23,
      flag: '1',
    }));
    expect(fixture.componentInstance.employees()[0].flag).toBe('1');
    expect(fixture.componentInstance.employees()[0].overtimeStatus).toBe('Approved');
    expect(fixture.componentInstance.filteredEmployees()).toHaveSize(0);
    expect(fixture.nativeElement.textContent).not.toContain('Ayesha Khan');
    expect(fixture.nativeElement.textContent).not.toContain('flag');
  });

  it('skips holiday roster markers and posts using the next assigned shift ID', () => {
    const month = fixture.componentInstance.selectedMonth();
    workstationService.fetchWorkstations.and.returnValue(of([{
      id: 7,
      name: 'Morning',
      code: 'M',
      officeInTime: '08:00',
      officeOutTime: '16:00',
      inGraceMinutes: 0,
      outGraceMinutes: 0,
      shift: 'Morning',
      description: 'Morning Shift',
      status: 1,
    }]));
    applicationFormService.fetchEmployeeRosterList.and.returnValue(of([
      {
        employee_id: 'EMP-001',
        employee_name: 'Ayesha Khan',
        department: 'Finance',
        designation: 'Analyst',
        employment_status: 'Active',
        shift_date: `${month}-01`,
        shift: 'HOL',
        role: '',
        hub: '',
        note: null,
      },
      {
        employee_id: 'EMP-001',
        employee_name: 'Ayesha Khan',
        department: 'Finance',
        designation: 'Analyst',
        employment_status: 'Active',
        shift_date: `${month}-02`,
        shift: 'M',
        role: '',
        hub: '',
        note: null,
      },
    ]));
    fixture.componentInstance.ngOnInit();
    fixture.componentInstance.employees.update((employees) => employees.map((employee) => ({
      ...employee,
      workingHours: '10h 30m',
      shiftHours: '8h',
      calculatedOvertimeHours: '2h 30m',
    })));
    fixture.componentInstance.selectedEmployeeKeys.set(new Set(['EMP-001']));

    fixture.componentInstance.postSelectedEmployees();

    expect(overtimeListService.postOvertimeEmployee.calls.mostRecent().args[0][0].shift_id).toBe('7');
  });

  it('excludes employees with only holiday assignments from posting selection', () => {
    const month = fixture.componentInstance.selectedMonth();
    applicationFormService.fetchEmployeeRosterList.and.returnValue(of([{
      employee_id: 'EMP-001',
      employee_name: 'Ayesha Khan',
      department: 'Finance',
      designation: 'Analyst',
      employment_status: 'Active',
      shift_date: `${month}-01`,
      shift: 'HOL',
      role: '',
      hub: '',
      note: null,
    }]));
    fixture.componentInstance.ngOnInit();
    fixture.componentInstance.employees.update((employees) => employees.map((employee) => ({
      ...employee,
      workingHours: '10h 30m',
      shiftHours: '0h',
      calculatedOvertimeHours: '10h 30m',
    })));
    fixture.detectChanges();
    const employee = fixture.componentInstance.employees()[0];
    const checkbox = fixture.nativeElement.querySelector('tbody input[type="checkbox"]') as HTMLInputElement;
    const selectAll = fixture.nativeElement.querySelector(
      '.add-overtime-table__selection-toggle input[type="checkbox"]',
    ) as HTMLInputElement;

    expect(fixture.componentInstance.isSelectableForPosting(employee)).toBe(false);
    expect(checkbox.disabled).toBe(true);
    expect(selectAll.disabled).toBe(true);
    expect(fixture.componentInstance.postEligibilityMessage(employee)).toBe('No shift assignment found for selected month');
    fixture.componentInstance.postSelectedEmployees();
    expect(overtimeListService.postOvertimeEmployee).not.toHaveBeenCalled();
  });

  it('does not post default hour values when the selected row has no monthly hours', () => {
    const employee = fixture.componentInstance.employees()[0];
    fixture.componentInstance.selectedEmployeeKeys.set(new Set([employee.EmployeeCode]));

    fixture.componentInstance.postSelectedEmployees();

    expect(overtimeListService.postOvertimeEmployee).not.toHaveBeenCalled();
    expect(fixture.componentInstance.employees()[0].flag).toBe('0');
  });

  it('does not allow zero-overtime employees to be selected or posted', () => {
    const component = fixture.componentInstance;
    const employee = {
      ...component.employees()[0],
      workingHours: '8h',
      shiftHours: '8h',
      calculatedOvertimeHours: '0h',
    };
    component.employees.set([employee]);
    fixture.detectChanges();

    const checkbox = fixture.nativeElement.querySelector('tbody input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(component.filteredSelectableEmployees()).toHaveSize(0);
    expect(fixture.nativeElement.textContent).toContain('No overtime hours for selected month');

    component.selectedEmployeeKeys.set(new Set([employee.EmployeeCode]));
    component.postSelectedEmployees();

    expect(overtimeListService.postOvertimeEmployee).not.toHaveBeenCalled();
  });

  it('shows a failure reason beside an employee when the API rejects the post', () => {
    const component = fixture.componentInstance;
    const employee = {
      ...component.employees()[0],
      workingHours: '10h',
      shiftHours: '8h',
      calculatedOvertimeHours: '2h',
    };
    component.employees.set([employee]);
    component.postErrors.set({ [employee.EmployeeCode]: 'Post failed: Shift is closed.' });

    expect(component.postEligibilityMessage(employee)).toBe('Post failed: Shift is closed.');
  });

  it('does not post an employee when gross salary is missing', () => {
    const employee = fixture.componentInstance.employees()[0];
    fixture.componentInstance.employees.set([{
      ...employee,
      detail: {
        ...employee.detail,
        remuneration: { ...employee.detail?.remuneration, basicSalary: '' } as ApplicationFormDetail['remuneration'],
      } as ApplicationFormDetail,
    }]);
    fixture.componentInstance.selectedEmployeeKeys.set(new Set([employee.EmployeeCode]));
    applicationFormService.fetchEmployeeProfileDetailsInBatches.and.returnValue(of([{
      ...employee,
      detail: {
        ...employee.detail,
        remuneration: { ...employee.detail?.remuneration, basicSalary: '' },
      } as ApplicationFormDetail,
    }]));

    fixture.componentInstance.postSelectedEmployees();

    expect(overtimeListService.postOvertimeEmployee).not.toHaveBeenCalled();
    expect(fixture.componentInstance.employees()[0].flag).toBe('0');
  });

  it('does not show employees already present in the overtime list', () => {
    overtimeListService.fetchOvertimeList.and.returnValue(of([
      {
        id: 'overtime-1',
        values: {
          employee_code: 'EMP-001',
          overtime_date: `${fixture.componentInstance.selectedMonth()}-01`,
          status: 'Pending',
        },
      },
    ]));

    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.componentInstance.employees()[0].overtimeStatus).toBe('Approved');
    expect(fixture.componentInstance.employees()[0].flag).toBe('1');
    expect(fixture.componentInstance.filteredEmployees()).toHaveSize(0);
    expect(fixture.nativeElement.textContent).not.toContain('Ayesha Khan');
  });

  it('keeps employees eligible when the matching overtime record is unposted', () => {
    overtimeListService.fetchOvertimeList.and.returnValue(of([
      {
        id: 'overtime-unposted',
        values: {
          employee_code: 'EMP-001',
          overtime_date: `${fixture.componentInstance.selectedMonth()}-01`,
          flag: '0',
        },
      },
    ]));

    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.componentInstance.employees()[0].flag).toBe('0');
    expect(fixture.componentInstance.filteredEmployees().map((employee) => employee.EmployeeCode))
      .toContain('EMP-001');
    expect(fixture.nativeElement.textContent).toContain('Ayesha Khan');
  });

  it('keeps employees eligible when their overtime was posted in a different month', () => {
    overtimeListService.fetchOvertimeList.and.returnValue(of([
      {
        id: 'overtime-previous-month',
        values: {
          employee_code: 'EMP-001',
          overtime_date: '2026-09-30',
          status: 'Pending',
        },
      },
    ]));

    fixture.componentInstance.onMonthChange('2026-10');
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.componentInstance.employees()[0].flag).toBe('0');
    expect(fixture.componentInstance.filteredEmployees().map((employee) => employee.EmployeeCode))
      .toContain('EMP-001');
    expect(fixture.nativeElement.textContent).toContain('Ayesha Khan');
  });

  it('does not hide an employee for an overtime record without a date', () => {
    overtimeListService.fetchOvertimeList.and.returnValue(of([
      { id: 'overtime-without-date', values: { employee_code: 'EMP-001', status: 'Pending' } },
    ]));

    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();

    expect(fixture.componentInstance.filteredEmployees().map((employee) => employee.EmployeeCode))
      .toContain('EMP-001');
  });

  it('updates posted eligibility when the selected month changes', () => {
    overtimeListService.fetchOvertimeList.and.returnValue(of([
      {
        id: 'overtime-october',
        values: {
          employee_code: 'EMP-001',
          overtime_date: '2026-10-01',
          status: 'Pending',
        },
      },
    ]));

    fixture.componentInstance.onMonthChange('2026-10');
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    expect(fixture.componentInstance.filteredEmployees()).toHaveSize(0);

    fixture.componentInstance.onMonthChange('2026-11');
    fixture.detectChanges();
    expect(fixture.componentInstance.filteredEmployees().map((employee) => employee.EmployeeCode))
      .toContain('EMP-001');
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
