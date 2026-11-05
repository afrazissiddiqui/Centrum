import { describe, expect, it } from 'vitest';
import { formatBranchNameForDisplay, resolveBranchNameFromBplId } from './branch-name.util';
import { resolveBranchCode } from '../components/setup/gl-account-determination/gl-account-branch.options';

describe('resolveBranchNameFromBplId', () => {
  it('maps BPLID values to their new branch names', () => {
    expect(resolveBranchNameFromBplId('1')).toBe('DHA');
    expect(resolveBranchNameFromBplId('2')).toBe('Johar Town');
    expect(resolveBranchNameFromBplId('3')).toBe('MB');
    expect(resolveBranchNameFromBplId('4')).toBe('SAM');
    expect(resolveBranchNameFromBplId('5')).toBe('RUDA');
  });

  it('maps zero-padded ids and case-insensitive branch names', () => {
    expect(resolveBranchNameFromBplId('02')).toBe('Johar Town');
    expect(resolveBranchNameFromBplId('johar_town')).toBe('Johar Town');
  });

  it('normalizes legacy branch labels to the current branch names', () => {
    expect(resolveBranchNameFromBplId('AHCP_Peshawar')).toBe('DHA');
    expect(resolveBranchNameFromBplId('AHCP_HO')).toBe('Johar Town');
    expect(resolveBranchNameFromBplId('AHCP_Faisalabad')).toBe('MB');
  });
});

describe('formatBranchNameForDisplay', () => {
  it('maps branch IDs to display labels', () => {
    expect(formatBranchNameForDisplay('1')).toBe('DHA');
    expect(formatBranchNameForDisplay('2')).toBe('Johar Town');
    expect(formatBranchNameForDisplay('3')).toBe('MB');
    expect(formatBranchNameForDisplay('4')).toBe('SAM');
    expect(formatBranchNameForDisplay('5')).toBe('RUDA');
  });

  it('preserves unknown branch labels', () => {
    expect(formatBranchNameForDisplay('Custom Branch')).toBe('Custom Branch');
  });
});

describe('resolveBranchCode', () => {
  it('resolves each current branch name and legacy code to the payload value', () => {
    expect(resolveBranchCode('DHA')).toBe('1');
    expect(resolveBranchCode('Johar Town')).toBe('2');
    expect(resolveBranchCode('MB')).toBe('3');
    expect(resolveBranchCode('SAM')).toBe('4');
    expect(resolveBranchCode('RUDA')).toBe('5');
    expect(resolveBranchCode('FSD-WH01')).toBe('3');
    expect(resolveBranchCode('Head Office')).toBe('2');
  });
});
