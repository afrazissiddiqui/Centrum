  import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AlertService } from '../../../../services/alert.service';
import { AuthService } from '../../../../services/auth.service';
import { MiscellaneousLayoutService } from '../../miscellaneous-layout.service';
import { AddReceiptFromProduction } from './add-receipt-from-production';
import { ReceiptFromProductionService, buildCreateReceiptFromProductionPayload } from '../receipt-from-production.service';
import { createEmptyReceiptFromProductionLine } from '../receipt-from-production.model';
import { OitmItemsService } from '../../../../services/oitm-items.service';

describe('AddReceiptFromProduction', () => {
  let component: AddReceiptFromProduction;
  let receiptService: jasmine.SpyObj<ReceiptFromProductionService>;
  let alertService: jasmine.SpyObj<AlertService>;
  let router: { navigate: jasmine.Spy };

  beforeEach(async () => {
    receiptService = jasmine.createSpyObj<ReceiptFromProductionService>('ReceiptFromProductionService', ['create', 'listProductionOrders']);
    receiptService.create.and.returnValue(of({}));
    receiptService.listProductionOrders.and.returnValue(of([]));
    alertService = jasmine.createSpyObj<AlertService>('AlertService', ['validation', 'success', 'error']);
    router = { navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true)) };

    await TestBed.configureTestingModule({
      imports: [AddReceiptFromProduction],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => null } } },
        },
        {
          provide: AuthService,
          useValue: { getSessionUser: () => ({ name: 'Test User' }) },
        },
        {
          provide: AlertService,
          useValue: alertService,
        },
        { provide: Router, useValue: router },
        {
          provide: MiscellaneousLayoutService,
          useValue: {
            backToModuleHome: jasmine.createSpy('backToModuleHome'),
            toggleSidebar: jasmine.createSpy('toggleSidebar'),
          },
        },
        {
          provide: ReceiptFromProductionService,
          useValue: receiptService,
        },
        {
          provide: OitmItemsService,
          useValue: {
            ensureLoaded: () => of([
              {
                itemCode: 'FG-Toll-P-00000069',
                itemName: 'Toll Flint - Preform 45 Gram',
                fetchPro: 'Y',
                properties: [
                  { code: '1', name: '17g-1810-425815' },
                  { code: '4', name: '19.5g-1881-PTK-12303' },
                  { code: '6', name: '21g-1881-PTK-10809' },
                ],
                uom: 'EA',
                batches: [
                  { batchNumber: 'BATCH-FSD-001', warehouse: 'FSD-WH03' },
                  { batchNumber: 'BATCH-PSH-001', warehouse: 'PSH-WH03' },
                ],
              },
              { itemCode: 'FA-00000196', itemName: 'H1- HyPET-225, 48 Cavity, Serial# 3406566', fetchPro: 'Y', properties: [], batches: [] },
              { itemCode: 'FA-00000203', itemName: 'H3, HPP4-400, 96 Cavity, Serial# 6150826', fetchPro: 'Y', properties: [], batches: [] },
            ]),
            getCatalog: () => [
              {
                itemCode: 'FG-Toll-P-00000069',
                itemName: 'Toll Flint - Preform 45 Gram',
                fetchPro: 'Y',
                properties: [
                  { code: '1', name: '17g-1810-425815' },
                  { code: '4', name: '19.5g-1881-PTK-12303' },
                  { code: '6', name: '21g-1881-PTK-10809' },
                ],
                uom: 'EA',
                batches: [
                  { batchNumber: 'BATCH-FSD-001', warehouse: 'FSD-WH03' },
                  { batchNumber: 'BATCH-PSH-001', warehouse: 'PSH-WH03' },
                ],
              },
              { itemCode: 'FA-00000196', itemName: 'H1- HyPET-225, 48 Cavity, Serial# 3406566', fetchPro: 'Y', properties: [], batches: [] },
              { itemCode: 'FA-00000203', itemName: 'H3, HPP4-400, 96 Cavity, Serial# 6150826', fetchPro: 'Y', properties: [], batches: [] },
            ],
          },
        },
      ],
    }).compileComponents();

    component = TestBed.createComponent(AddReceiptFromProduction).componentInstance;
  });

  it('shows the SAP error when the API returns an unsuccessful response', () => {
    receiptService.create.and.returnValue(
      of({
        success: false,
        error: 'unique constraint violation: Code=1 already exists',
      }),
    );
    component.headerForm.update((header) => ({ ...header, baseProductionOrderDocEntry: '53' }));
    component.contentLines.set([
      {
        ...createEmptyReceiptFromProductionLine(),
        itemCode: 'FG-Toll-P-00000069',
        quantity: 10,
        warehouse: 'FSD-WH06',
      },
    ]);

    component.save();

    expect(alertService.error).toHaveBeenCalledWith(
      'Save Failed',
      jasmine.stringContaining('unique constraint violation'),
    );
    expect(alertService.success).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('only populates header values when a production order is selected', () => {
    component.applyProductionOrder({
      docEntry: '53',
      docNum: '4',
      postDate: '2026-07-20',
      dueDate: '2026-07-20',
      startDate: '2026-07-20',
      status: 'R',
      U_DocTaxStatus: 'R',
      U_LegacyBatch: '1-45G-H5-2026-000000005',
      warehouse: 'FSD-WH03',
      branch: '3',
      batchNumber: 'Toll-FSD-2026-00000003',
      items: [
        {
          lineNum: '1',
          itemCode: 'FG-Toll-P-00000069',
          itemDescription: 'Toll Flint - Preform 45 Gram',
          quantity: 8064,
          warehouse: 'FSD-WH03',
          batchNumber: 'Toll-FSD-2026-00000003',
          manufacturingDate: '2026-07-20',
          expiryDate: '2026-07-30',
          baseLine: '1',
        },
      ],
    } as any);

    expect(component.headerForm().baseProductionOrderDocEntry).toBe('53');
    expect(component.headerForm().baseProductionOrderDocNum).toBe('4');
    expect(component.headerForm().postingDate).toBe('2026-07-20');
    expect(component.headerForm().dueDate).toBe('2026-07-20');
    expect(component.headerForm().documentTaxStatus).toBe('Registered');
    expect(component.headerForm().branchId).toBe('3');
    expect(component.contentLines().length).toBe(1);
    expect(component.contentLines()[0].itemCode).toBe('FG-Toll-P-00000069');
    expect(component.contentLines()[0].itemDescription).toBe('Toll Flint - Preform 45 Gram');
    expect(component.contentLines()[0].warehouse).toBe('FSD-WH06');
    expect(component.contentLines()[0].legacyBatch).toBe('1-45G-H5-2026-000000005');
  });

  it('marks the document tax status as UnRegistered when U_DocTaxStatus is not R', () => {
    component.applyProductionOrder({
      docEntry: '54',
      docNum: '5',
      postDate: '2026-07-20',
      dueDate: '2026-07-20',
      startDate: '2026-07-20',
      status: 'R',
      U_DocTaxStatus: 'U',
      warehouse: 'FSD-WH03',
      branch: '3',
      batchNumber: '',
      items: [],
    } as any);

    expect(component.headerForm().documentTaxStatus).toBe('UnRegistered');
  });

  it('defaults the row warehouse from the production order warehouse prefix', () => {
    component.applyProductionOrder({
      docEntry: '54',
      docNum: '5',
      postDate: '2026-07-20',
      dueDate: '2026-07-20',
      startDate: '2026-07-20',
      status: 'R',
      warehouse: 'PSH-WH03',
      branch: '3',
      batchNumber: '',
      items: [],
    } as any);

    expect(component.contentLines()[0].warehouse).toBe('PSH-WH06');
  });

  it('uses the manually selected warehouse when creating the payload', () => {
    component.contentLines.set([
      {
        ...createEmptyReceiptFromProductionLine(),
        itemCode: 'FG-Toll-P-00000069',
        quantity: 10,
        warehouse: 'PSH-WH06',
      },
    ]);

    component.updateContentLine(0, 'warehouse', 'FSD-WH03');

    const payload = buildCreateReceiptFromProductionPayload(component.headerForm(), component.contentLines());

    expect(payload.warehouse).toBe('FSD-WH03');
  });

  it('includes the machine name in the receipt payload', () => {
    component.headerForm.update((header) => ({
      ...header,
      machineName: 'Toll Flint - Preform 45 Gram',
    }));

    const payload = buildCreateReceiptFromProductionPayload(component.headerForm(), component.contentLines());

    expect(payload.U_MachineName).toBe('Toll Flint - Preform 45 Gram');
  });

  it('normalizes unregistered Pass UR tax status values to UR in the payload', () => {
    for (const documentTaxStatus of ['UR', 'Pass UR', 'UnRegistered Pass UR']) {
      component.headerForm.update((header) => ({ ...header, documentTaxStatus }));

      const payload = buildCreateReceiptFromProductionPayload(component.headerForm(), component.contentLines());

      expect(payload.U_DocTaxStatus).toBe('UR');
    }
  });

  it('includes the legacy batch in the item batch payload', () => {
    component.headerForm.update((header) => ({ ...header, productionTime: '08:30' }));
    component.contentLines.set([
      {
        ...createEmptyReceiptFromProductionLine(),
        itemCode: 'FG-Toll-P-00000069',
        batchNumber: 'FSD-26-000001',
        legacyBatch: 'LEGACY-001',
        quantity: 354816,
        manufacturingDate: '2026-08-31',
      },
    ]);

    const payload = buildCreateReceiptFromProductionPayload(component.headerForm(), component.contentLines());

    expect(payload.U_LegacyBatch).toBe('LEGACY-001');
    expect(payload.items?.[0].batches).toEqual([
      {
        BatchNum: 'FSD-26-000001',
        Quantity: '354816.000000',
        MnfDate: '2026-08-31',
        ProductionTime: '8:30',
        U_LegacyBatch: 'LEGACY-001',
      },
    ]);
  });

  it('prefers the changed line warehouse over a prefilled header warehouse', () => {
    component.headerForm.set({
      ...component.headerForm(),
      warehouse: 'PSH-WH06',
    });

    component.contentLines.set([
      {
        ...createEmptyReceiptFromProductionLine(),
        itemCode: 'FG-Toll-P-00000069',
        quantity: 10,
        warehouse: 'PSH-WH06',
      },
    ]);

    component.updateContentLine(0, 'warehouse', 'FSD-WH03');

    const payload = buildCreateReceiptFromProductionPayload(component.headerForm(), component.contentLines());

    expect(payload.warehouse).toBe('FSD-WH03');
  });

  it('returns matching batches from the items catalog for the active branch warehouse', () => {
    component.headerForm.set({
      ...component.headerForm(),
      branchId: '3',
    });

    component.contentLines.set([
      {
        ...createEmptyReceiptFromProductionLine(),
        itemCode: 'FG-Toll-P-00000069',
      },
    ]);

    expect(component.existingBatchesForLine(0)).toEqual(['BATCH-FSD-001']);
  });

  it('syncs the selected production machine code and name', () => {
    component.updateMachineId('FG-Toll-P-00000069');

    expect(component.headerForm().machineId).toBe('FG-Toll-P-00000069');
    expect(component.headerForm().machineName).toBe('Toll Flint - Preform 45 Gram');

    component.updateMachineName('Toll Flint - Preform 45 Gram');

    expect(component.headerForm().machineId).toBe('FG-Toll-P-00000069');
  });

  it('displays shift labels while retaining raw shift codes', () => {
    component.headerForm.set({ ...component.headerForm(), shift: '01' });

    expect(component.displayShift(component.headerForm().shift)).toBe('Shift A');

    component.updateShift('Shift B');

    expect(component.headerForm().shift).toBe('02');

    component.contentLines.set([
      {
        ...createEmptyReceiptFromProductionLine(),
        itemCode: 'FG-Toll-P-00000069',
        quantity: 1,
        warehouse: 'FSD-WH06',
      },
    ]);

    expect(buildCreateReceiptFromProductionPayload(component.headerForm(), component.contentLines()).U_Shift).toBe('02');
  });

  it('updates only the machine token in the row batch when the machine changes', () => {
    component.headerForm.set({
      ...component.headerForm(),
      machineName: 'H3, HPP4-400, 96 Cavity, Serial# 6150826',
    });
    component.contentLines.set([
      {
        ...createEmptyReceiptFromProductionLine(),
        batchNumber: '3-G-H3-2026-000000001',
      },
    ]);

    component.updateMachineId('FA-00000196');

    expect(component.headerForm().machineName).toBe('H1- HyPET-225, 48 Cavity, Serial# 3406566');
    expect(component.contentLines()[0].batchNumber).toBe('3-G-H1-2026-000000001');
  });

  it('updates the row batch when the machine is changed through its name', () => {
    component.headerForm.set({
      ...component.headerForm(),
      machineName: 'H2, HPP6e-400, 96 Cavity, Serial# 13693258',
    });
    component.contentLines.set([
      {
        ...createEmptyReceiptFromProductionLine(),
        batchNumber: '3-32.54G-H2-2026-000000001',
      },
    ]);

    component.updateMachineName('H5, HPP6e-400, 96 cavity, Serial# 13693259');

    expect(component.contentLines()[0].batchNumber).toBe('3-32.54G-H5-2026-000000001');
  });

  it('normalizes a lowercase batch machine token when the selected machine token is unchanged', () => {
    component.headerForm.set({
      ...component.headerForm(),
      machineName: 'H4, HPP6e-400, 96 Cavity, Serial# 13693259',
    });
    component.contentLines.set([
      {
        ...createEmptyReceiptFromProductionLine(),
        batchNumber: '1-G-h4-2026-000000001',
      },
    ]);

    component.updateMachineName('H4, HPP6e-400, 96 Cavity, Serial# 13693259');

    expect(component.contentLines()[0].batchNumber).toBe('1-G-H4-2026-000000001');
  });

  it('shows mold names and cavity codes for the selected production machine', () => {
    component.updateMachineId('FG-Toll-P-00000069');

    expect(component.moldNumberOptions()).toEqual([
      '17g-1810-425815',
      '19.5g-1881-PTK-12303',
      '21g-1881-PTK-10809',
    ]);
    expect(component.cavityNumberOptions()).toEqual(['1', '4', '6']);
  });

  it('auto-populates the copied production order metadata for related form fields', () => {
    component.applyProductionOrder({
      docEntry: '47',
      docNum: '3',
      postDate: '2026-07-18',
      dueDate: '2026-07-22',
      startDate: '2026-07-18',
      status: 'R',
      warehouse: 'FSD-WH03',
      branch: '3',
      customerCode: 'CC-000006',
      customerName: 'Anc Foods (Private) Limited',
      U_MachineID: 'M-100',
      U_MachineName: 'Blow Molding',
      U_MoldNo: 'MOLD-01',
      U_Cavity_NUM: '6',
      U_EmployeeShift: 'A',
      plannedQty: 354816,
      completedQty: 354817,
      rejectedQty: 0,
      receiptQty: 0,
      items: [
        {
          lineNum: '1',
          itemCode: 'FG-Toll-P-00000069',
          itemDescription: 'Toll Flint - Preform 45 Gram',
          quantity: 0,
          warehouse: 'FSD-WH03',
          batchNumber: 'BATCH-FSD-001',
          manufacturingDate: '2026-07-18',
          expiryDate: '2026-07-28',
          jumboCartons: 12000,
          baseLine: '1',
          plannedQty: 354816,
          completedQty: 354817,
        },
      ],
    } as any);

    expect((component.headerForm() as any).customerCode).toBe('CC-000006');
    expect((component.headerForm() as any).customerName).toBe('Anc Foods (Private) Limited');
    expect(component.headerForm().machineId).toBe('M-100');
    expect(component.headerForm().machineName).toBe('Blow Molding');
    expect(component.headerForm().moldNumber).toBe('MOLD-01');
    expect(component.headerForm().cavityNumber).toBe('6');
    expect(component.headerForm().shift).toBe('A');
    expect(component.contentLines()[0].plannedQty).toBe(354816);
    expect(component.contentLines()[0].completedQty).toBe(354817);
    expect((component.selectedProductionOrder() as any)?.rejectedQty).toBe(0);
  });
});
