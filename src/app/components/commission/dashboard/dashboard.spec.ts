import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CommissionDashboardComponent } from './dashboard';

describe('CommissionDashboardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommissionDashboardComponent],
      providers: [{ provide: Router, useValue: { navigateByUrl: jasmine.createSpy('navigateByUrl') } }],
    }).compileComponents();
  });

  it('derives payable and pending totals from the commission batches', () => {
    const fixture = TestBed.createComponent(CommissionDashboardComponent);
    const component = fixture.componentInstance;

    expect(component.totalPayable()).toBe(1482500);
    expect(component.pendingApprovalTotal()).toBe(342000);
    expect(component.transferredTotal()).toBe(965500);
  });

  it('filters pending batches by status', () => {
    const fixture = TestBed.createComponent(CommissionDashboardComponent);
    const component = fixture.componentInstance;
    component.selectTab('Pending Approval');

    expect(component.visibleBatches().map((batch) => batch.id)).toEqual([
      'COM-2611-KHI-02',
      'COM-2611-FSD-04',
    ]);
  });
});
