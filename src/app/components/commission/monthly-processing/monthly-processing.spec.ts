import { TestBed } from '@angular/core/testing';
import { MonthlyProcessingComponent } from './monthly-processing';

describe('MonthlyProcessingComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonthlyProcessingComponent],
    }).compileComponents();
  });

  it('updates the approval decision when a submitted batch is approved', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;

    component.approveSelectedBatch();

    expect(component.selectedBatch()?.status).toBe('Approved');
    expect(component.notice()).toContain('approved');
  });

  it('only recalculates selected draft batches', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;

    component.calculateCommission();

    expect(component.batches()[0].status).toBe('Submitted');
    expect(component.notice()).toBe('Only draft batches may be recalculated.');
  });
});
