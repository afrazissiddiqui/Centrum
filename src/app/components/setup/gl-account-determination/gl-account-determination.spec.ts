import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AlertService } from '../../../services/alert.service';
import { GlAccountDeterminationService } from '../../../services/gl-account-determination.service';
import {
  GatePassBusinessPartnerService,
} from '../../gate-pass/gate-pass-business-partner.service';
import { GlAccountDeterminationComponent } from './gl-account-determination';

describe('GlAccountDeterminationComponent', () => {
  let fixture: ComponentFixture<GlAccountDeterminationComponent>;
  let component: GlAccountDeterminationComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GlAccountDeterminationComponent],
      providers: [
        {
          provide: AlertService,
          useValue: {
            validation: jasmine.createSpy('validation'),
            success: jasmine.createSpy('success'),
            warning: jasmine.createSpy('warning'),
            error: jasmine.createSpy('error'),
            confirm: jasmine.createSpy('confirm').and.resolveTo({ isConfirmed: true }),
          },
        },
        {
          provide: GlAccountDeterminationService,
          useValue: {
            fetchGlAccountOptions: () => of([]),
            fetchCostCenterTypeOptions: () =>
              of([
                { CctCode: 'COS', CctName: 'Cost of Sales' },
                { CctCode: 'ADM', CctName: 'Administration' },
              ]),
            fetchGlAccountDeterminations: () => of([]),
            addGlAccountDetermination: () => of({}),
            updateGlAccountDetermination: () => of({}),
            deleteGlAccountDetermination: () => of({}),
          },
        },
        {
          provide: GatePassBusinessPartnerService,
          useValue: {
            ensureAllLoaded: () => of(undefined),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GlAccountDeterminationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders Cost Center Type options from the service', () => {
    const select = fixture.nativeElement.querySelector(
      'select[name^="costCenterType-"]',
    ) as HTMLSelectElement;

    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual([
      'Select Cost Center Type',
      'Cost of Sales',
      'Administration',
    ]);
    expect(Array.from(select.options).slice(1).map((option) => option.value)).toEqual([
      'COS',
      'ADM',
    ]);
  });

  it('sends the selected code as both required Cost Center Type payload fields', () => {
    const row = { ...component.rows[0], costCenterType: 'COS' };
    const payload = (component as any).toPayload(row);

    expect(payload.CctCode).toBe('COS');
    expect(payload.costCenterType).toBe('COS');
  });

  it('does not submit a row when every mapping field matches a saved line', () => {
    const service = TestBed.inject(GlAccountDeterminationService);
    const addSpy = spyOn(service, 'addGlAccountDetermination').and.callThrough();
    const row = {
      ...component.rows[0],
      formName: 'Job Specification Form',
      formValue: 1,
      glItemType: 'Salary',
      salaryGlAccountCode: '1000',
      salaryGlAccountName: 'Cash',
      businessPartner: 'BP-01',
      costCenterType: 'COS',
      branch: 'AHCP_HO',
      debitCreditType: 'Debit',
    };
    component.rows = [row];
    component.savedRecords.set([
      {
        Id: 101,
        Form: 1,
        Type: 'Salary',
        Code: '1000',
        Name: 'Cash',
        Branch: '2',
        DebitCreditType: 'DEBIT',
        BusinessPartner: 'BP-01',
        CctCode: 'COS',
        CctName: 'Cost of Sales',
        VendorForExpenseReimbursement: '',
        VendorForLoans: '',
        VendorForAdvances: '',
      },
    ]);

    component.submitForm();

    expect(addSpy).not.toHaveBeenCalled();
    expect(TestBed.inject(AlertService).validation).toHaveBeenCalledWith(
      'Row 2: This GL Account Determination already exists.',
    );
  });

  it('allows a row that differs from a saved line by one mapping field', () => {
    const service = TestBed.inject(GlAccountDeterminationService);
    const addSpy = spyOn(service, 'addGlAccountDetermination').and.callThrough();
    component.rows = [
      {
        ...component.rows[0],
        formName: 'Job Specification Form',
        formValue: 1,
        glItemType: 'Salary',
        salaryGlAccountCode: '1000',
        salaryGlAccountName: 'Cash',
        businessPartner: 'BP-01',
        costCenterType: 'COS',
        branch: 'AHCP_Faisalabad',
        debitCreditType: 'Debit',
      },
    ];
    component.savedRecords.set([
      {
        Id: 101,
        Form: 1,
        Type: 'Salary',
        Code: '1000',
        Name: 'Cash',
        Branch: '2',
        DebitCreditType: 'DEBIT',
        BusinessPartner: 'BP-01',
        CctCode: 'COS',
        CctName: 'Cost of Sales',
        VendorForExpenseReimbursement: '',
        VendorForLoans: '',
        VendorForAdvances: '',
      },
    ]);

    component.submitForm();

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({ branch: '3' }),
    );
  });

  it('deletes the selected saved lines and refreshes the listing', async () => {
    const service = TestBed.inject(GlAccountDeterminationService);
    const deleteSpy = spyOn(service, 'deleteGlAccountDetermination').and.returnValue(of({}));
    const records = [
      { Id: 101, Type: 'Salary', Code: '1000' },
      { Id: 102, Type: 'Expense', Code: '2000' },
    ].map((partialRecord) => ({
      Form: 'Job Specification Form',
      Name: 'Account',
      Branch: 'AHCP_HO',
      DebitCreditType: 'DEBIT',
      BusinessPartner: 'BP-01',
      CctCode: 'COS',
      CctName: 'Cost of Sales',
      VendorForExpenseReimbursement: '',
      VendorForLoans: '',
      VendorForAdvances: '',
      ...partialRecord,
    }));
    spyOn(service, 'fetchGlAccountDeterminations').and.returnValue(of([]));
    component.savedRecords.set(records);
    component.selectedRecordIds.set(new Set([101, 102]));

    await component.deleteSelectedRecords();

    expect(deleteSpy).toHaveBeenCalledTimes(2);
    expect(deleteSpy).toHaveBeenCalledWith(101);
    expect(deleteSpy).toHaveBeenCalledWith(102);
    expect(component.savedRecords()).toEqual([]);
    expect(component.selectedRecordIds().size).toBe(0);
    expect(TestBed.inject(AlertService).success).toHaveBeenCalledWith(
      'Deleted',
      '2 GL Account Determination line(s) deleted successfully.',
    );
  });

  it('keeps failed lines selected when bulk deletion partially fails', async () => {
    const service = TestBed.inject(GlAccountDeterminationService);
    const records = [
      { Id: 101, Type: 'Salary', Code: '1000' },
      { Id: 102, Type: 'Expense', Code: '2000' },
    ].map((partialRecord) => ({
      Form: 'Job Specification Form',
      Name: 'Account',
      Branch: 'AHCP_HO',
      DebitCreditType: 'DEBIT',
      BusinessPartner: 'BP-01',
      CctCode: 'COS',
      CctName: 'Cost of Sales',
      VendorForExpenseReimbursement: '',
      VendorForLoans: '',
      VendorForAdvances: '',
      ...partialRecord,
    }));
    spyOn(service, 'deleteGlAccountDetermination').and.callFake((id) =>
      Number(id) === 101 ? of({}) : throwError(() => new Error('Delete was rejected.')),
    );
    spyOn(service, 'fetchGlAccountDeterminations').and.returnValue(of([records[1]]));
    component.savedRecords.set(records);
    component.selectedRecordIds.set(new Set([101, 102]));

    await component.deleteSelectedRecords();

    expect(component.savedRecords()).toEqual([records[1]]);
    expect([...component.selectedRecordIds()]).toEqual([102]);
    expect(TestBed.inject(AlertService).warning).toHaveBeenCalledWith(
      'Some Lines Were Not Deleted',
      '1 line(s) deleted; 1 failed. Delete was rejected.',
    );
  });
});
