import { TestBed } from '@angular/core/testing';
import { CommissionRegisterComponent } from './register';

describe('CommissionRegisterComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommissionRegisterComponent],
    }).compileComponents();
  });

  it('calculates the register totals from employee rows', () => {
    const fixture = TestBed.createComponent(CommissionRegisterComponent);
    const component = fixture.componentInstance;

    expect(component.registerTotal()).toBe(62500);
    expect(component.totals()).toEqual({
      sales: 20000,
      executive: 25000,
      production: 12000,
      assembly: 5500,
      total: 62500,
    });
  });

  it('filters employees by status and selects matching drill-down details', () => {
    const fixture = TestBed.createComponent(CommissionRegisterComponent);
    const component = fixture.componentInstance;
    component.statusFilter.set('Pending');

    expect(component.filteredEmployees().map((record) => record.employee)).toEqual(['Usman Tariq']);
    expect(component.selectedEmployee()?.employee).toBe('Usman Tariq');
    expect(component.selectedDetails()).toHaveLength(3);
  });
});
