import { resolveInventoryTransferBranchName } from './add-inventory-transfer';

describe('resolveInventoryTransferBranchName', () => {
  it('maps BPL ids 1 through 5 to the current branch labels', () => {
    expect(resolveInventoryTransferBranchName('1')).toBe('DHA');
    expect(resolveInventoryTransferBranchName('2')).toBe('Johar Town');
    expect(resolveInventoryTransferBranchName('3')).toBe('MB');
    expect(resolveInventoryTransferBranchName('4')).toBe('SAM');
    expect(resolveInventoryTransferBranchName('5')).toBe('RUDA');
  });
});
