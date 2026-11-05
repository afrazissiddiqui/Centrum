import { describe, expect, it } from 'vitest';
import { filterRecordsBySessionBranches, getAllowedBranches } from './branch-filter.util';

describe('branch filter utilities', () => {
  it('treats non-admin flags like 0 or "0" as non-admin users for branch filtering', () => {
    const allowedBranches = getAllowedBranches({ is_admin: '0' as unknown as boolean, branch: 'MB' } as any);

    expect([...allowedBranches]).toEqual(['mb']);
  });

  it('treats false-like strings as non-admin users for branch filtering', () => {
    const allowedBranches = getAllowedBranches({ is_admin: 'false', branch: 'DHA' } as any);

    expect([...allowedBranches]).toEqual(['dha']);
  });

  it('filters out records from other branches when the user is tagged with MB', () => {
    const filtered = filterRecordsBySessionBranches(
      [{ branch: '3' }, { branch: '1' }, { branch: '5' }],
      (record) => record.branch,
      { is_admin: 0 as unknown as boolean, branch: 'MB' },
    );

    expect(filtered).toEqual([{ branch: '3' }]);
  });

  it('keeps a leave record stored with a zero-padded location branch ID', () => {
    const filtered = filterRecordsBySessionBranches(
      [{ Location: '02', EmployeeId: 'Emp-00000011' }],
      (record) => record.Location,
      { is_admin: false, branch: '2' },
    );

    expect(filtered).toEqual([{ Location: '02', EmployeeId: 'Emp-00000011' }]);
  });
});
