import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { publicApiUrl } from '../../../config/api.config';
import { MonthlyProcessingComponent } from './monthly-processing';

function createBatch(status: 'Submitted' | 'Draft' | 'Calculated' | 'Rejected' | 'Approved') {
  return {
    id: '5',
    code: 'COM-2611-DHA-01',
    category: 'Employee Sales',
    branch: 'DHA',
    documents: 10,
    amount: 25000,
    status,
    duplicateCheck: 'Passed' as const,
  };
}

describe('MonthlyProcessingComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonthlyProcessingComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads batches for the current period from the batch list API', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();

    const request = httpMock.expectOne(
      publicApiUrl('commission-batch-list?period=2026-11'),
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      status: true,
      period: '2026-11',
      periodClosed: false,
      periodInfo: null,
      data: [{
        id: 5,
        batch_code: 'COM-2611-DHA-01',
        category: 'Employee Sales',
        branch: 'DHA',
        documents_count: 10,
        total_amount: 25000,
        status: 'Submitted',
        duplicate_check: 'Passed',
      }],
      summary: { total_batches: 1, total_documents: 10, total_amount: 25000 },
    });

    expect(component.batches()).toEqual([createBatch('Submitted')]);
    expect(component.branches()).toEqual(['DHA']);
    expect(component.selectedBatchId()).toBe('5');
    expect(component.selectedBatchIds()).toEqual(['5']);
    expect(component.periodClosed()).toBe(false);
    expect(component.isLoading()).toBe(false);
  });

  it('approves a submitted batch with remarks and refreshes the batch list', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Submitted')]);
    component.approverComments.set('  Verified against SAP OINV & ORIN.  ');

    component.approveSelectedBatch();

    const request = httpMock.expectOne(publicApiUrl('commission-batch/5/approve'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ remarks: 'Verified against SAP OINV & ORIN.' });
    expect(component.isApproving()).toBe(true);

    request.flush({ status: true, message: 'Batch approved.' });

    const refreshRequest = httpMock.expectOne(
      publicApiUrl('commission-batch-list?period=2026-11'),
    );
    refreshRequest.flush({
      status: true,
      period: '2026-11',
      periodClosed: false,
      data: [{
        id: 5,
        batch_code: 'COM-2611-DHA-01',
        category: 'Employee Sales',
        branch: 'DHA',
        documents_count: 10,
        total_amount: 25000,
        status: 'Approved',
        duplicate_check: 'Passed',
      }],
    });

    expect(component.isApproving()).toBe(false);
    expect(component.selectedBatch()?.status).toBe('Approved');
    expect(component.notice()).toBe('Batch approved.');
  });

  it('allows calculated batches to be approved', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Calculated')]);

    component.approveSelectedBatch();

    const request = httpMock.expectOne(publicApiUrl('commission-batch/5/approve'));
    expect(request.request.body).toEqual({ remarks: '' });
    request.flush({ status: true });

    httpMock.expectOne(publicApiUrl('commission-batch-list?period=2026-11')).flush({
      status: true,
      period: '2026-11',
      periodClosed: false,
      data: [{
        id: 5,
        batch_code: 'COM-2611-DHA-01',
        category: 'Employee Sales',
        branch: 'DHA',
        documents_count: 10,
        total_amount: 25000,
        status: 'Approved',
        duplicate_check: 'Passed',
      }],
    });

    expect(component.selectedBatch()?.status).toBe('Approved');
  });

  it('surfaces errors from the batch approval API', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Submitted')]);

    component.approveSelectedBatch();
    httpMock.expectOne(publicApiUrl('commission-batch/5/approve')).flush(
      { message: 'The period is closed.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(component.isApproving()).toBe(false);
    expect(component.notice()).toBe('The period is closed.');
    expect(component.noticeIsError()).toBe(true);
  });

  it('rejects a calculated batch with remarks and refreshes the batch list', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Calculated')]);
    component.approverComments.set('Unmapped salesperson line found, please map and recalculate.');

    component.rejectSelectedBatch();

    const request = httpMock.expectOne(publicApiUrl('commission-batch/5/reject'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      remarks: 'Unmapped salesperson line found, please map and recalculate.',
    });
    expect(component.isRejecting()).toBe(true);

    request.flush({ status: true, message: 'Batch rejected.' });

    const refreshRequest = httpMock.expectOne(
      publicApiUrl('commission-batch-list?period=2026-11'),
    );
    refreshRequest.flush({
      status: true,
      period: '2026-11',
      periodClosed: false,
      data: [{
        id: 5,
        batch_code: 'COM-2611-DHA-01',
        category: 'Employee Sales',
        branch: 'DHA',
        documents_count: 10,
        total_amount: 25000,
        status: 'Rejected',
        duplicate_check: 'Passed',
      }],
    });

    expect(component.isRejecting()).toBe(false);
    expect(component.selectedBatch()?.status).toBe('Rejected');
    expect(component.notice()).toBe('Batch rejected.');
  });

  it('surfaces errors from the batch rejection API', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Submitted')]);

    component.rejectSelectedBatch();
    httpMock.expectOne(publicApiUrl('commission-batch/5/reject')).flush(
      { message: 'The period is closed.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(component.isRejecting()).toBe(false);
    expect(component.notice()).toBe('The period is closed.');
    expect(component.noticeIsError()).toBe(true);
  });

  it('closes the configured period through the API and refreshes the period state', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.isLoading.set(false);

    component.closePeriod();

    const request = httpMock.expectOne(publicApiUrl('commission-period-close'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ period: '2026-11' });
    expect(component.isClosingPeriod()).toBe(true);

    request.flush({ status: true, message: 'Period closed.' });

    const refreshRequest = httpMock.expectOne(
      publicApiUrl('commission-batch-list?period=2026-11'),
    );
    refreshRequest.flush({
      status: true,
      period: '2026-11',
      periodClosed: true,
      data: [],
    });

    expect(component.isClosingPeriod()).toBe(false);
    expect(component.periodClosed()).toBe(true);
    expect(component.notice()).toBe('Period closed.');
  });

  it('does not mark the period closed when the close API fails', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.isLoading.set(false);

    component.closePeriod();
    httpMock.expectOne(publicApiUrl('commission-period-close')).flush(
      { message: 'The period cannot be closed yet.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(component.isClosingPeriod()).toBe(false);
    expect(component.periodClosed()).toBe(false);
    expect(component.notice()).toBe('The period cannot be closed yet.');
    expect(component.noticeIsError()).toBe(true);
  });

  it('does not send ineligible batches to calculation', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Submitted')]);
    component.selectedBatchIds.set(['5']);

    component.calculateCommission();

    httpMock.expectNone(publicApiUrl('commission-batch-calculate'));
    expect(component.batches()[0].status).toBe('Submitted');
    expect(component.notice()).toBe('Only draft, calculated, or rejected batches can be recalculated.');
  });

  it('transfers selected approved batches and refreshes the batch list', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.isLoading.set(false);
    component.batches.set([createBatch('Approved')]);
    component.selectedBatchIds.set(['5']);

    component.transferToPayroll();

    const request = httpMock.expectOne(publicApiUrl('commission-transfer-to-payroll'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ period: '2026-11', batch_ids: [5] });
    expect(component.isTransferring()).toBe(true);

    request.flush({ status: true, message: 'Batches transferred.' });

    const refreshRequest = httpMock.expectOne(
      publicApiUrl('commission-batch-list?period=2026-11'),
    );
    refreshRequest.flush({
      status: true,
      period: '2026-11',
      periodClosed: false,
      data: [{
        id: 5,
        batch_code: 'COM-2611-DHA-01',
        category: 'Employee Sales',
        branch: 'DHA',
        documents_count: 10,
        total_amount: 25000,
        status: 'Transferred',
        duplicate_check: 'Passed',
      }],
    });

    expect(component.isTransferring()).toBe(false);
    expect(component.batches()[0].status).toBe('Transferred');
    expect(component.notice()).toBe('Batches transferred.');
  });

  it('does not transfer selected batches with ineligible statuses', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.isLoading.set(false);
    component.batches.set([createBatch('Submitted')]);
    component.selectedBatchIds.set(['5']);

    component.transferToPayroll();

    httpMock.expectNone(publicApiUrl('commission-transfer-to-payroll'));
    expect(component.notice()).toBe('Only approved or calculated batches can be transferred to payroll.');
  });

  it('surfaces errors from the payroll transfer API', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.isLoading.set(false);
    component.batches.set([createBatch('Calculated')]);
    component.selectedBatchIds.set(['5']);

    component.transferToPayroll();
    httpMock.expectOne(publicApiUrl('commission-transfer-to-payroll')).flush(
      { message: 'The period is closed.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(component.isTransferring()).toBe(false);
    expect(component.notice()).toBe('The period is closed.');
    expect(component.noticeIsError()).toBe(true);
  });

  it('calculates selected batches through the API and refreshes the batch list', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Draft')]);
    component.selectedBatchIds.set(['5']);

    component.calculateCommission();

    const request = httpMock.expectOne(publicApiUrl('commission-batch-calculate'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ period: '2026-11', batch_ids: [5] });
    expect(component.isCalculating()).toBe(true);

    request.flush({ status: true, message: 'Calculation completed.' });

    const refreshRequest = httpMock.expectOne(
      publicApiUrl('commission-batch-list?period=2026-11'),
    );
    expect(refreshRequest.request.method).toBe('GET');
    refreshRequest.flush({
      status: true,
      period: '2026-11',
      periodClosed: false,
      data: [{
        id: 5,
        batch_code: 'COM-2611-DHA-01',
        category: 'Employee Sales',
        branch: 'DHA',
        documents_count: 12,
        total_amount: 30000,
        status: 'Calculated',
        duplicate_check: 'Passed',
      }],
    });

    expect(component.isCalculating()).toBe(false);
    expect(component.batches()[0].status).toBe('Calculated');
    expect(component.batches()[0].documents).toBe(12);
    expect(component.notice()).toBe('Calculation completed.');
  });

  it('surfaces errors from the commission calculation API', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Rejected')]);
    component.selectedBatchIds.set(['5']);

    component.calculateCommission();
    httpMock.expectOne(publicApiUrl('commission-batch-calculate')).flush(
      { message: 'The period is closed.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(component.isCalculating()).toBe(false);
    expect(component.notice()).toBe('The period is closed.');
    expect(component.noticeIsError()).toBe(true);
  });

  it('submits calculated batches for approval and refreshes the batch list', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Calculated')]);
    component.selectedBatchIds.set(['5']);

    component.submitBatchesForApproval();

    const request = httpMock.expectOne(publicApiUrl('commission-batch-submit'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ batch_ids: [5] });
    expect(component.isSubmitting()).toBe(true);

    request.flush({ status: true, message: 'Submitted for approval.' });

    const refreshRequest = httpMock.expectOne(
      publicApiUrl('commission-batch-list?period=2026-11'),
    );
    refreshRequest.flush({
      status: true,
      period: '2026-11',
      periodClosed: false,
      data: [{
        id: 5,
        batch_code: 'COM-2611-DHA-01',
        category: 'Employee Sales',
        branch: 'DHA',
        documents_count: 10,
        total_amount: 25000,
        status: 'Submitted',
        duplicate_check: 'Passed',
      }],
    });

    expect(component.isSubmitting()).toBe(false);
    expect(component.batches()[0].status).toBe('Submitted');
    expect(component.notice()).toBe('Submitted for approval.');
  });

  it('does not submit batches that are not calculated', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Draft')]);
    component.selectedBatchIds.set(['5']);

    component.submitBatchesForApproval();

    httpMock.expectNone(publicApiUrl('commission-batch-submit'));
    expect(component.notice()).toBe('Only calculated batches can be submitted for approval.');
    expect(component.isSubmitting()).toBe(false);
  });

  it('surfaces errors from the batch submission API', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Calculated')]);
    component.selectedBatchIds.set(['5']);

    component.submitBatchesForApproval();
    httpMock.expectOne(publicApiUrl('commission-batch-submit')).flush(
      { message: 'The period is closed.' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(component.isSubmitting()).toBe(false);
    expect(component.notice()).toBe('The period is closed.');
    expect(component.noticeIsError()).toBe(true);
  });

  it('sends the selected period and batch IDs to pre-calculation validation', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Draft')]);
    component.selectedBatchIds.set(['5']);

    component.validateBatches();

    const request = httpMock.expectOne(publicApiUrl('commission-batch-validate'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ period: '2026-11', batch_ids: [5] });
    expect(component.isValidating()).toBe(true);

    request.flush({ status: true, message: 'Batches validated.' });

    expect(component.isValidating()).toBe(false);
    expect(component.notice()).toBe('Batches validated.');
    expect(component.noticeIsError()).toBe(false);
  });

  it('surfaces batch validation failures returned by the API', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Draft')]);
    component.selectedBatchIds.set(['5']);

    component.validateBatches();
    httpMock.expectOne(publicApiUrl('commission-batch-validate')).flush({
      status: false,
      message: 'Batch has unresolved issues.',
    });

    expect(component.isValidating()).toBe(false);
    expect(component.notice()).toBe('Batch has unresolved issues.');
    expect(component.noticeIsError()).toBe(true);
  });

  it('does not call validation when no batches are selected', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;
    component.batches.set([createBatch('Draft')]);

    component.validateBatches();

    httpMock.expectNone(publicApiUrl('commission-batch-validate'));
    expect(component.notice()).toBe('Select one or more batches to validate.');
    expect(component.isValidating()).toBe(false);
  });

  it('reports an API error instead of showing an empty batch list as successful', () => {
    const fixture = TestBed.createComponent(MonthlyProcessingComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();
    httpMock.expectOne(publicApiUrl('commission-batch-list?period=2026-11')).flush(
      'Unavailable',
      { status: 500, statusText: 'Server Error' },
    );

    expect(component.isLoading()).toBe(false);
    expect(component.loadError()).toBe('Unable to load commission batches. Please try again later.');
    expect(component.batches()).toEqual([]);
  });
});
