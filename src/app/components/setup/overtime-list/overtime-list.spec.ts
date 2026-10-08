import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AlertService } from '../../../services/alert.service';
import { OvertimeListRecord, OvertimeListService } from '../../../services/overtime-list.service';
import { OvertimeListComponent } from './overtime-list';

describe('OvertimeListComponent', () => {
  let fixture: ComponentFixture<OvertimeListComponent>;
  let service: jasmine.SpyObj<OvertimeListService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<OvertimeListService>('OvertimeListService', ['fetchOvertimeList']);
    service.fetchOvertimeList.and.returnValue(of([
      {
        id: '1',
        values: {
          employee_code: 'EMP-001',
          employee_name: 'Ayesha Khan',
          overtime_date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
        },
      },
    ]));
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    await TestBed.configureTestingModule({
      imports: [OvertimeListComponent],
      providers: [
        { provide: OvertimeListService, useValue: service },
        { provide: AlertService, useValue: { error: jasmine.createSpy('error') } },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OvertimeListComponent);
    fixture.detectChanges();
  });

  it('loads and displays rows returned by the overtime list API', () => {
    expect(service.fetchOvertimeList).toHaveBeenCalled();
    expect(fixture.componentInstance.dateFilterMode()).toBe('all');
    expect(fixture.nativeElement.textContent).toContain('Overtime (1)');
    expect(fixture.nativeElement.textContent).toContain('Ayesha Khan');
    expect(fixture.nativeElement.textContent).toContain('Monthly Overtime');
    expect(fixture.componentInstance.columns().some((column) => column.key === 'monthlyOvertime')).toBe(true);
  });

  it('shows an employee and month total from the daily overtime records', () => {
    const component = fixture.componentInstance;
    component.records.set([
      {
        id: '1',
        values: {
          employee_code: 'EMP-001',
          employee_name: 'Ayesha Khan',
          overtime_date: '2026-10-01',
          overtime_hours: 1.5,
        },
      },
      {
        id: '2',
        values: {
          employee_code: 'EMP-001',
          employee_name: 'Ayesha Khan',
          overtime_date: '2026-10-02',
          overtime_hours: '45m',
        },
      },
      {
        id: '3',
        values: {
          employee_code: 'EMP-001',
          employee_name: 'Ayesha Khan',
          overtime_date: '2026-09-30',
          overtime_hours: 8,
        },
      },
      {
        id: '4',
        values: {
          employee_code: 'EMP-002',
          employee_name: 'Bilal Ahmed',
          overtime_date: '2026-10-02',
          overtime_hours: 6,
        },
      },
    ]);

    expect(component.formatRecordCell('monthlyOvertime', component.records()[0])).toBe('2h 15m');
    expect(component.formatRecordCell('monthlyOvertime', component.records()[1])).toBe('2h 15m');
    expect(component.formatRecordCell('monthlyOvertime', component.records()[2])).toBe('8h');
    expect(component.formatRecordCell('monthlyOvertime', component.records()[3])).toBe('6h');
  });

  it('does not display or search overtime flag fields', () => {
    service.fetchOvertimeList.and.returnValue(of([
      {
        id: '1',
        values: {
          employee_code: 'EMP-001',
          employee_name: 'Ayesha Khan',
          overtime_date: fixture.componentInstance.todayDate,
          flag: '1',
        },
      },
    ]));
    fixture.componentInstance.loadRecords();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Flag');
    expect(fixture.componentInstance.columns().some((column) => column.key === 'flag')).toBe(false);

    fixture.componentInstance.onSearchChange('1');
    expect(fixture.componentInstance.filteredRecords().length).toBe(0);
  });

  it('navigates to the add page from the Add button', () => {
    const button = fixture.nativeElement.querySelector('.overtime-add') as HTMLButtonElement;

    button.click();

    expect(router.navigate).toHaveBeenCalledWith(['/setup/overtime-list/add']);
  });

  it('filters loaded rows by the search text', () => {
    const component = fixture.componentInstance;

    component.onSearchChange('ayesha');

    expect(component.filteredRecords().length).toBe(1);
    component.onSearchChange('missing');
    expect(component.filteredRecords().length).toBe(0);
  });

  it('hides the API ID field while keeping employee code visible', () => {
    service.fetchOvertimeList.and.returnValue(of([
      {
        id: 'record-1',
        values: {
          ID: 42,
          employee_code: 'EMP-042',
          employee_name: 'Samira Ali',
          overtime_date: fixture.componentInstance.todayDate,
        },
      },
    ]));
    fixture.componentInstance.loadRecords();
    fixture.detectChanges();

    expect(fixture.componentInstance.columns().some((column) => column.key.toLowerCase() === 'id')).toBe(false);
    expect(fixture.componentInstance.columns().some((column) => column.key === 'employee_code')).toBe(true);
    expect(fixture.nativeElement.querySelector('.overtime-table thead').textContent).not.toContain('ID');
    expect(fixture.nativeElement.textContent).not.toContain('Marcus Vance');
    expect(fixture.nativeElement.textContent).toContain('EMP-042');
  });

  it('filters records by a specific overtime date', () => {
    const component = fixture.componentInstance;
    component.records.set([
      { id: '1', values: { employee_code: 'EMP-001', overtime_date: '2026-10-01' } },
      { id: '2', values: { employee_code: 'EMP-002', overtime_date: '2026-10-02' } },
    ]);

    component.onDateFilterModeChange('specific');
    component.onSpecificDateChange('2026-10-01');

    expect(component.filteredRecords().map((record) => record.id)).toEqual(['1']);
  });

  it('filters records inclusively within a date range', () => {
    const component = fixture.componentInstance;
    component.records.set([
      { id: '1', values: { employee_code: 'EMP-001', overtime_date: '2026-10-01' } },
      { id: '2', values: { employee_code: 'EMP-002', overtime_date: '2026-10-02' } },
      { id: '3', values: { employee_code: 'EMP-003', overtime_date: '2026-10-03' } },
    ]);

    component.onDateFilterModeChange('range');
    component.onDateFromChange('2026-10-01');
    component.onDateToChange('2026-10-02');

    expect(component.filteredRecords().map((record) => record.id)).toEqual(['1', '2']);
  });

  it('filters records by employee name or code and shows all when the filter is blank', () => {
    const component = fixture.componentInstance;
    component.onDateFilterModeChange('all');
    component.records.set([
      { id: '1', values: { employee_code: 'EMP-001', employee_name: 'Ayesha Khan' } },
      { id: '2', values: { employee_code: 'EMP-002', employee_name: 'Bilal Ahmed' } },
    ]);

    component.onEmployeeSearchChange('bilal');

    expect(component.filteredRecords().map((record) => record.id)).toEqual(['2']);

    component.onEmployeeSearchChange('EMP-001');
    expect(component.filteredRecords().map((record) => record.id)).toEqual(['1']);

    component.onEmployeeSearchChange('');
    expect(component.filteredRecords().map((record) => record.id)).toEqual(['1', '2']);
  });

  it('updates visible columns immutably', () => {
    const component = fixture.componentInstance;
    const column = component.columns()[0];
    const event = new Event('change');
    Object.defineProperty(event, 'target', {
      value: { checked: false } as HTMLInputElement,
    });

    component.setColumnVisibility(column.key, event);

    expect(component.columns()[0].visible).toBeFalse();
    expect(component.visibleColumns().some((item) => item.key === column.key)).toBeFalse();
  });

  it('formats overtime date from its own field, independently of created and updated timestamps', () => {
    const component = fixture.componentInstance;

    expect(component.formatCellValue('created_at', '2026-10-01T09:51:36.000000Z')).toBe('01/10/2026');
    expect(component.formatCellValue('updated_at', '2026-10-02 09:54:07')).toBe('02/10/2026');
    expect(component.formatCellValue('overtime_date', '2026-10-03')).toBe('03/10/2026');
  });

  it('displays posted and pending overtime statuses as Approved', () => {
    expect(fixture.componentInstance.formatCellValue('status', 'Posted')).toBe('Approved');
    expect(fixture.componentInstance.formatCellValue('Status', 'posted')).toBe('Approved');
    expect(fixture.componentInstance.formatCellValue('status', 'Pending')).toBe('Approved');
    expect(fixture.componentInstance.formatCellValue('status', 'pending')).toBe('Approved');
    expect(fixture.componentInstance.formatCellValue('status', 'Rejected')).toBe('Rejected');
  });
});
