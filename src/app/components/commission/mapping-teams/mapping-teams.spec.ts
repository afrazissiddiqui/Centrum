import { TestBed } from '@angular/core/testing';
import { MappingTeamsComponent } from './mapping-teams';

describe('MappingTeamsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MappingTeamsComponent],
    }).compileComponents();
  });

  it('updates mapping status and mapped total when a payroll employee is assigned', () => {
    const fixture = TestBed.createComponent(MappingTeamsComponent);
    const component = fixture.componentInstance;

    component.updateAssignment('slp-14', 'EMP-1017 · Sana Iqbal');

    expect(component.rowsByTab().sap[0].status).toBe('Mapped');
    expect(component.mappedSalespeople()).toBe(19);
  });

  it('switches mapping tables with the selected category', () => {
    const fixture = TestBed.createComponent(MappingTeamsComponent);
    const component = fixture.componentInstance;

    component.selectTab('assembly');

    expect(component.activeTab().title).toBe('Assembly Teams');
    expect(component.visibleRows()).toHaveSize(3);
  });
});
