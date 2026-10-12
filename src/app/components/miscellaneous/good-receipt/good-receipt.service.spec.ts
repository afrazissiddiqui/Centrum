import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { extractBatchNumber } from '../batch-number.util';
import { createEmptyGoodReceiptHeader, createEmptyGoodReceiptLine, GoodReceiptLine } from './good-receipt.model';
import { buildCreateGoodReceiptPayload } from './good-receipt.service';

describe('buildCreateGoodReceiptPayload', () => {
  it('uses the edited item cost as unitPrice and sends the expected item shape', () => {
    const header = createEmptyGoodReceiptHeader();
    header.branchId = '3';
    header.documentDate = '2026-09-30';
    header.postingDate = '2026-09-30';
    header.dueDate = '2026-07-28';
    header.remarks = 'Post By Afraz';
    const lines: GoodReceiptLine[] = [
      {
        ...createEmptyGoodReceiptLine(),
        itemCode: 'FG-001',
        warehouse: 'WH01',
        quantity: 10,
        unitPrice: 250,
        itemCost: 50,
        batchNumber: 'BATCH-01',
        manufacturingDate: '2026-07-02',
        expiryDate: '2029-07-28',
        accountCode: 'T01001005000050',
        branch: '3',
      },
    ];

    const payload = buildCreateGoodReceiptPayload(header, lines);

    expect(payload).toEqual({
      branch: 3,
      docDate: '2026-09-30',
      taxDate: '2026-09-30',
      docDueDate: '2026-07-28',
      remarks: 'Post By Afraz',
      items: [{
        itemCode: 'FG-001',
        quantity: 10,
        warehouse: 'WH01',
        unitPrice: 50,
        batchNumber: 'BATCH-01',
        manufacturingDate: '2026-07-02',
        expiryDate: '2029-07-28',
      AcctCode: 'T01001005000050',
      }],
    });
  });
});

describe('GoodReceiptService list parsing', () => {
  it('maps batch numbers from SAP BatchNumbers in the view response', () => {
    expect(
      extractBatchNumber({
        BatchNumbers: [{ BatchNumber: 'RECEIPT-001' }],
      }),
    ).toBe('RECEIPT-001');
  });

  it('maps the batch number when the API returns it directly on the line', () => {
    expect(
      extractBatchNumber({
        BatchNo: 'RECEIPT-002',
      }),
    ).toBe('RECEIPT-002');
  });
});
