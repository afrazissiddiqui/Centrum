import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { extractBatchNumber } from '../batch-number.util';
import { buildCreateGoodIssuePayload } from './good-issue.service';
import { createEmptyGoodIssueHeader, createEmptyGoodIssueLine } from './good-issue.model';

describe('GoodIssueService', () => {
  it('uses the default account code when a row account is not changed', () => {
    const header = createEmptyGoodIssueHeader();
    const line = {
      ...createEmptyGoodIssueLine(),
      itemCode: 'ITEM-001',
    };

    const payload = buildCreateGoodIssuePayload(header, [line]);

    expect(payload.items[0].AcctCode).toBe('A02022900100010');
  });

  it('includes row-level detail fields in the payload', () => {
    const header = createEmptyGoodIssueHeader();
    const lines = [
      {
        ...createEmptyGoodIssueLine(),
        itemCode: 'ITEM-001',
        itemDescription: 'Test Item',
        warehouse: 'WH-01',
        quantity: 2,
        unitPrice: 10,
        binLocationAllocation: 'BIN-01',
        accountCode: 'ACCT-100',
        itemCost: 20,
        uomCode: 'EA',
        uomName: 'Each',
        departmentsLocations: 'Dept A',
        branch: 'BR-01',
      },
    ] as any;

    const payload = buildCreateGoodIssuePayload(header, lines);

    expect(payload.items[0]).toMatchObject({
      itemCode: 'ITEM-001',
      warehouse: 'WH-01',
      quantity: 2,
      binLocationAllocation: 'BIN-01',
      AcctCode: 'ACCT-100',
      itemCost: 20,
      uomCode: 'EA',
      uomName: 'Each',
      departmentsLocations: 'Dept A',
      branch: 'BR-01',
    });
  });

  it('serializes selected quantities from multiple batches', () => {
    const header = createEmptyGoodIssueHeader();
    const line = {
      ...createEmptyGoodIssueLine(),
      itemCode: 'ITEM-001',
      warehouse: 'WH-01',
      quantity: 10,
      availableBatches: [
        { batchNo: 'BATCH-001', quantity: 6, issueQuantity: 4 },
        { batchNo: 'BATCH-002', quantity: 8, issueQuantity: 6 },
      ],
    };

    const payload = buildCreateGoodIssuePayload(header, [line]);

    expect(payload.items[0].batches).toEqual([
      { batchNumber: 'BATCH-001', quantity: 4 },
      { batchNumber: 'BATCH-002', quantity: 6 },
    ]);
  });
});

describe('GoodIssueService list parsing', () => {
  it('maps all batch numbers from the view response', () => {
    expect(
      extractBatchNumber({
        batches: [
          { batchNumber: 'ISSUE-001' },
          { batchNumber: 'ISSUE-002' },
        ],
      }),
    ).toBe('ISSUE-001, ISSUE-002');
  });

  it('maps batch numbers returned in SAP BatchNumbers', () => {
    expect(
      extractBatchNumber({
        BatchNumbers: [{ BatchNum: 'ISSUE-003' }],
      }),
    ).toBe('ISSUE-003');
  });
});
