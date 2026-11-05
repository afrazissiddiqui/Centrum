import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { IssueFromProductionComponent } from './issue-from-production';
import { AlertService } from '../../../services/alert.service';

describe('IssueFromProductionComponent', () => {
  let component: IssueFromProductionComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IssueFromProductionComponent, HttpClientTestingModule],
      providers: [
        {
          provide: AlertService,
          useValue: {
            warning: () => undefined,
            error: () => undefined,
            success: () => undefined,
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(IssueFromProductionComponent);
    component = fixture.componentInstance;
  });

  it('uses the production order warehouse without assuming old branch warehouse mappings', () => {
    component.headerForm.set({
      ...component.headerForm(),
      branchId: '3',
      branchName: 'MB',
    });
    component.selectedProductionOrder.set({
      docEntry: '17',
      docNum: 'PO-100',
      postDate: '2026-07-02',
      dueDate: '2026-07-02',
      warehouse: 'WH01',
      batchNumber: 'B1',
      status: 'O',
      items: [
        {
          lineNum: '1',
          itemCode: 'FG-001',
          itemDescription: 'Finished Goods A',
          quantity: 2,
          warehouse: '',
          batchNumber: '',
          manufacturingDate: '',
          expiryDate: '',
          baseLine: '1',
        },
        {
          lineNum: '2',
          itemCode: 'FG-002',
          itemDescription: 'Finished Goods B',
          quantity: 3,
          warehouse: '',
          batchNumber: '',
          manufacturingDate: '',
          expiryDate: '',
          baseLine: '2',
        },
      ],
    });
    component.selectedProductionOrderItemKeys.set(new Set(['1:FG-001', '2:FG-002']));

    component.applySelectedProductionOrderItems();

    expect(component.contentLines().map((line) => line.warehouse)).toEqual(['WH01', 'WH01']);
  });

  it('keeps the production order line number from the item instead of falling back to 1', () => {
    const item = {
      lineNum: '14',
      itemCode: 'RM-Own-00000003',
      itemDescription: 'Crushed v-PET Resin Material',
      quantity: 627.264,
      warehouse: 'PSH-WH03',
      batchNumber: 'RM-Own-PSH-2026-000000001',
      manufacturingDate: '',
      expiryDate: '',
      baseLine: '0',
      batches: [{ batchNo: 'RM-Own-PSH-2026-000000001', quantity: 499900 }],
    };

    component.selectedProductionOrder.set({
      docEntry: '59',
      docNum: 'PO-200',
      postDate: '2026-07-22',
      dueDate: '2026-07-22',
      warehouse: 'WH01',
      batchNumber: 'B1',
      status: 'O',
      items: [item],
    });
    component.selectedProductionOrderItemKeys.set(new Set(['14:RM-Own-00000003']));

    component.applySelectedProductionOrderItems();

    expect(component.contentLines()[0].baseLine).toBe('14');
  });

  it('selects and clears all production order items from the modal', () => {
    component.selectedProductionOrder.set({
      docEntry: '17',
      docNum: 'PO-100',
      postDate: '2026-07-02',
      dueDate: '2026-07-02',
      warehouse: 'WH01',
      batchNumber: 'B1',
      status: 'O',
      items: [
        {
          lineNum: '1',
          itemCode: 'FG-001',
          itemDescription: 'Finished Goods A',
          quantity: 2,
          warehouse: '',
          batchNumber: '',
          manufacturingDate: '',
          expiryDate: '',
          baseLine: '1',
        },
        {
          lineNum: '2',
          itemCode: 'FG-002',
          itemDescription: 'Finished Goods B',
          quantity: 3,
          warehouse: '',
          batchNumber: '',
          manufacturingDate: '',
          expiryDate: '',
          baseLine: '2',
        },
      ],
    });

    component.toggleSelectAllProductionOrderItems();
    expect(component.selectedProductionOrderItemKeys().size).toBe(2);

    component.toggleSelectAllProductionOrderItems();
    expect(component.selectedProductionOrderItemKeys().size).toBe(0);
  });

  it('excludes production order items whose item code contains Resources', () => {
    component.selectedProductionOrder.set({
      docEntry: '18',
      docNum: 'PO-101',
      postDate: '2026-07-02',
      dueDate: '2026-07-02',
      warehouse: 'WH01',
      branch: '3',
      batchNumber: 'B1',
      status: 'O',
      items: [
        {
          itemCode: 'Resource-00000001',
          itemDescription: 'Resource item',
        },
        {
          itemCode: 'FG-003',
          itemDescription: 'Finished Goods C',
        },
      ],
    } as any);

    expect(component.productionOrderItems().map((item) => item.itemCode)).toEqual(['FG-003']);
  });

  it('updates the active batch line with the selected batch and a quantity', () => {
    component.contentLines.set([
      {
        itemCode: 'FG-001',
        itemDescription: 'Finished Goods A',
        warehouse: 'FSD-WH03',
        quantity: 2,
        batchNumber: '',
        manufacturingDate: '',
        expiryDate: '',
        baseEntry: '17',
        baseLine: '1',
        availableBatches: [{ batchNo: 'B-100', quantity: 5 }],
      },
    ]);

    component.activeBatchSelectionLineIndex.set(0);
    component.selectBatchForActiveLine({ batchNo: 'B-100', quantity: 5 });
    component.updateBatchIssueQuantity({ batchNo: 'B-100', quantity: 5 }, '4');

    expect(component.contentLines()[0].batchNumber).toBe('B-100');
    expect(component.contentLines()[0].quantity).toBe(2);
    expect(component.contentLines()[0].availableBatches[0].issueQuantity).toBe(4);
  });

  it('does not show items whose name starts with Resources in batch selection', () => {
    component.contentLines.set([
      {
        itemCode: 'RM-001',
        itemDescription: 'Resources - Resin',
        warehouse: 'FSD-WH03',
        quantity: 2,
        requiredQuantity: 2,
        batchNumber: 'B-100',
        manufacturingDate: '',
        expiryDate: '',
        baseEntry: '17',
        baseLine: '1',
        availableBatches: [{ batchNo: 'B-100', quantity: 5 }],
      },
      {
        itemCode: 'FG-001',
        itemDescription: 'Finished Goods A',
        warehouse: 'FSD-WH03',
        quantity: 3,
        requiredQuantity: 3,
        batchNumber: 'B-200',
        manufacturingDate: '',
        expiryDate: '',
        baseEntry: '17',
        baseLine: '2',
        availableBatches: [{ batchNo: 'B-200', quantity: 3 }],
      },
    ]);

    expect(component.batchSelectionLines().map(({ line }) => line.itemCode)).toEqual(['FG-001']);
  });

  it('marks a batch selection line as complete when one batch has issue quantity', () => {
    component.contentLines.set([
      {
        itemCode: 'FG-001',
        itemDescription: 'Finished Goods A',
        warehouse: 'FSD-WH03',
        quantity: 2,
        requiredQuantity: 2,
        batchNumber: 'B-100',
        manufacturingDate: '',
        expiryDate: '',
        baseEntry: '17',
        baseLine: '1',
        availableBatches: [{ batchNo: 'B-100', quantity: 5, issueQuantity: 1 }],
      },
      {
        itemCode: 'FG-002',
        itemDescription: 'Finished Goods B',
        warehouse: 'FSD-WH03',
        quantity: 3,
        requiredQuantity: 3,
        batchNumber: 'B-200',
        manufacturingDate: '',
        expiryDate: '',
        baseEntry: '17',
        baseLine: '2',
        availableBatches: [{ batchNo: 'B-200', quantity: 3, issueQuantity: null }],
      },
    ]);

    expect((component as any).isBatchSelectionComplete(component.contentLines()[0])).toBeTrue();
    expect((component as any).isBatchSelectionComplete(component.contentLines()[1])).toBeFalse();
    expect((component as any).areAllBatchSelectionsComplete()).toBeFalse();

    component.contentLines.update((lines) =>
      lines.map((line) => ({
        ...line,
        availableBatches: line.availableBatches.map((batch) => ({ ...batch, issueQuantity: 1 })),
      })),
    );

    expect((component as any).areAllBatchSelectionsComplete()).toBeTrue();
  });

  it('calculates remaining required quantity considering form issued quantities', () => {
    const line: IssueForProductionLine = {
      itemCode: 'FG-001',
      itemDescription: 'Finished Goods A',
      warehouse: 'FSD-WH03',
      quantity: 10,
      requiredQuantity: 10,
      batchNumber: 'B-100',
      manufacturingDate: '',
      expiryDate: '',
      baseEntry: '17',
      baseLine: '1',
      availableBatches: [{ batchNo: 'B-100', quantity: 5, issueQuantity: 2 }],
    };

    const remaining = (component as any).getRemainingRequiredQuantity(line);
    expect(remaining).toBe(8);
  });

  it('calculates already issued quantity as required quantity minus remaining required quantity', () => {
    const line: IssueForProductionLine = {
      itemCode: 'FG-001',
      itemDescription: 'Finished Goods A',
      warehouse: 'FSD-WH03',
      quantity: 10,
      requiredQuantity: 10,
      batchNumber: 'B-100',
      manufacturingDate: '',
      expiryDate: '',
      baseEntry: '17',
      baseLine: '1',
      availableBatches: [{ batchNo: 'B-100', quantity: 5, issueQuantity: 2 }],
    };

    const alreadyIssued = (component as any).getAlreadyIssuedQuantity(line);
    expect(alreadyIssued).toBe(2);
  });

  it('enforces issue qty max constraint: min(batch available, remaining required)', () => {
    const line: IssueForProductionLine = {
      itemCode: 'FG-001',
      itemDescription: 'Finished Goods A',
      warehouse: 'FSD-WH03',
      quantity: 10,
      requiredQuantity: 10,
      batchNumber: 'B-100',
      manufacturingDate: '',
      expiryDate: '',
      baseEntry: '17',
      baseLine: '1',
      availableBatches: [
        { batchNo: 'B-100', quantity: 8, issueQuantity: 0 },
        { batchNo: 'B-200', quantity: 5, issueQuantity: 0 },
      ],
    };

    const batch = line.availableBatches[0];
    const maxAllowed = (component as any).getMaxAvailableForBatch(batch, line);
    
    // Remaining required = 10 - 7 - 0 = 3
    // Max = min(batch.available=8, remaining=3) = 3
    expect(maxAllowed).toBe(3);
  });

  it('builds the receipt-from-production payload using the selected production order values', () => {
    const record = {
      docEntry: 17,
      docDate: '2026-07-02',
      itemCode: 'FG-001',
      itemName: 'Finished Goods',
      quantity: 1,
      warehouse: 'PSH-WH06',
      batchNumber: 'FG250702001',
    };

    const payload = (component as unknown as {
      buildReceiptFromProductionPayload(record: Record<string, unknown>): Record<string, unknown>;
    }).buildReceiptFromProductionPayload(record);

    expect(payload).toEqual(
      jasmine.objectContaining({
        docEntry: 17,
        docDate: '2026-07-02',
        taxDate: '2026-07-02',
        docDueDate: '2026-07-02',
        remarks: 'Receipt From Production Api hit',
        warehouse: 'PSH-WH06',
        quantity: 1,
        batchNumber: 'FG250702001',
        branch: '1',
      }),
    );
  });

  it('maps line-item fields from receipt_from_production responses into the table rows', () => {
    const response = {
      data: [
        {
          DocEntry: 101,
          DocNum: 202,
          DocDate: '2026-07-14',
          DocDueDate: '2026-07-20',
          DocStatus: 'O',
          WhsCode: 'WH01',
          DocumentLines: [
            {
              ItemCode: 'ITM-001',
              Dscription: 'Widget A',
              Quantity: 8,
              WhsCode: 'WH02',
            },
          ],
        },
      ],
    };

    const records = (component as unknown as { extractRecords(response: unknown): Array<Record<string, unknown>> }).extractRecords(response);

    expect(records[0]).toEqual(
      jasmine.objectContaining({
        docEntry: '101',
        docNum: '202',
        docDate: '2026-07-14',
        dueDate: '2026-07-20',
        itemCode: 'ITM-001',
        itemName: 'Widget A',
        quantity: 8,
        warehouse: 'WH02',
        status: 'O',
      }),
    );
  });
});
