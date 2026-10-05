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
      { id: '1', values: { employee_code: 'EMP-001', employee_name: 'Ayesha Khan' } },
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
    expect(fixture.nativeElement.textContent).toContain('Overtime (1)');
    expect(fixture.nativeElement.textContent).toContain('Ayesha Khan');
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

  it('formats created and updated timestamps as day/month/year', () => {
    const component = fixture.componentInstance;

    expect(component.formatCellValue('created_at', '2026-10-01T09:51:36.000000Z')).toBe('01/10/2026');
    expect(component.formatCellValue('updated_at', '2026-10-02 09:54:07')).toBe('02/10/2026');
    expect(component.formatCellValue('overtime_date', '2026-10-01')).toBe('2026-10-01');
  });
});
