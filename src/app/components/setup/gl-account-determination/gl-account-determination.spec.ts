import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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

  it('duplicates the selected row without mutating the original values', () => {
    component.rows = [
      {
        id: 'row-1',
        formName: 'Job Specification Form',
        formValue: 1,
        glItemType: 'Salary',
        salaryGlAccountCode: '1000',
        salaryGlAccountName: 'Cash',
        businessPartner: 'BP-01',
        costCenterType: 'Department',
        branch: 'Islamabad',
        debitCreditType: 'Debit',
      },
      {
        id: 'row-2',
        formName: 'Application Form',
        formValue: 2,
        glItemType: 'Expense',
        salaryGlAccountCode: '2000',
        salaryGlAccountName: 'Expense',
        businessPartner: 'BP-02',
        costCenterType: 'Project',
        branch: 'Karachi',
        debitCreditType: 'Credit',
      },
    ];

    component.duplicateRow('row-1');

    expect(component.rows.length).toBe(3);
    const duplicate = component.rows[1];
    expect(duplicate.id).not.toBe('row-1');
    expect(duplicate.formName).toBe('Job Specification Form');
    expect(duplicate.glItemType).toBe('Salary');
    expect(duplicate.salaryGlAccountCode).toBe('1000');
    expect(duplicate.businessPartner).toBe('BP-01');
    expect(duplicate.costCenterType).toBe('Department');
    expect(component.rows[0].salaryGlAccountCode).toBe('1000');
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
});
