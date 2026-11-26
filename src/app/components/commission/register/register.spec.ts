import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { publicApiUrl } from '../../../config/api.config';
import { CommissionRegisterComponent } from './register';

describe('CommissionRegisterComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommissionRegisterComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the register, detail drill-down, and payroll payable data for the period', () => {
    const fixture = TestBed.createComponent(CommissionRegisterComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();

    const registerRequest = httpMock.expectOne(
      publicApiUrl('commission-register-list?period=2026-11'),
    );
    const payableRequest = httpMock.expectOne(
      publicApiUrl('commission-payable-for-payroll?period=2026-11'),
    );
    expect(registerRequest.request.method).toBe('GET');
    expect(payableRequest.request.method).toBe('GET');

    registerRequest.flush({
      status: true,
      period: '2026-11',
      data: [
        {
          employee_id: 5,
          employee_code: 'EMP-0005',
          employee_name: 'Employee Five',
          branch: 'DHA',
          sales: 1000,
          executive: 200,
          production: 0,
          assembly: 0,
          total: 1200,
          status: 'Approved',
        },
        {
          employee_id: 9,
          employee_code: 'EMP-0009',
          employee_name: 'Employee Nine',
          branch: 'Johar Town',
          sales: 500,
          executive: 0,
          production: 100,
          assembly: 0,
          total: 600,
          status: 'Pending',
        },
      ],
      summary: {
        posted_total: 0,
        posted_count: 0,
        approved_total: 1200,
        approved_count: 1,
        pending_total: 600,
        pending_count: 1,
        register_total: 1800,
        employees_count: 2,
      },
    });

    const detailRequest = httpMock.expectOne(
      publicApiUrl('commission-register-detail/5?period=2026-11'),
    );
    expect(detailRequest.request.method).toBe('GET');
    detailRequest.flush({
      status: true,
      period: '2026-11',
      employee: {
        employee_id: 5,
        employee_code: 'EMP-0005',
        employee_name: 'Employee Five',
        branch: 'DHA',
      },
      total: 1,
      data: [{
        id: 21,
        sap_doc_label: 'OINV #5001 · L0',
        category: 'Employee Sales',
        scheme_code: 'SCH-SLS-01',
        base_label: 'PKR 50,000',
        rate_label: '2%',
        commission_amount: 1000,
      }],
    });
    payableRequest.flush({
      status: true,
      period: '2026-11',
      data: [{
        employee_id: 5,
        employee_code: 'EMP-0005',
        employee_name: 'Employee Five',
        branch: 'DHA',
        total_commission: 1200,
        batch_ids: [4, 5],
      }],
    });

    expect(component.employees().length).toBe(2);
    expect(component.registerTotal()).toBe(1800);
    expect(component.approvedTotal()).toBe(1200);
    expect(component.approvedCount()).toBe(1);
    expect(component.branches()).toEqual(['DHA', 'Johar Town']);
    expect(component.selectedDetails()).toEqual([
      {
        id: '21',
        document: 'OINV #5001 · L0',
        category: 'Employee Sales',
        scheme: 'SCH-SLS-01',
        base: 'PKR 50,000',
        rate: '2%',
        amount: 1000,
      },
    ]);
    expect(component.payableRecords()[0].batchIds).toEqual(['4', '5']);

    component.setStatusFilter('Pending');
    const nextDetailRequest = httpMock.expectOne(
      publicApiUrl('commission-register-detail/9?period=2026-11'),
    );
    nextDetailRequest.flush({
      status: true,
      data: [],
    });
    expect(component.selectedEmployee()?.id).toBe('9');
    expect(component.selectedDetails()).toEqual([]);
  });

  it('reports list and payable API failures', () => {
    const fixture = TestBed.createComponent(CommissionRegisterComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();

    httpMock.expectOne(publicApiUrl('commission-register-list?period=2026-11')).flush(
      'Unavailable',
      { status: 500, statusText: 'Server Error' },
    );
    httpMock.expectOne(
      publicApiUrl('commission-payable-for-payroll?period=2026-11'),
    ).flush('Unavailable', { status: 503, statusText: 'Service Unavailable' });

    expect(component.isLoading()).toBe(false);
    expect(component.isLoadingPayables()).toBe(false);
    expect(component.loadError()).toBe('Unable to load the commission register. Please try again later.');
    expect(component.payableError()).toBe('Unable to load payable commissions. Please try again later.');
  });
});
