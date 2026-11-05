import { describe, expect, it } from 'vitest';
import {
  computeSocialSecurityKpk,
  computeSocialSecurityPunjab,
} from './payroll-social-security.util';

describe('payroll social security contributions', () => {
  it('calculates the Punjab contribution for each current branch code', () => {
    expect(computeSocialSecurityPunjab(37000, 51800, '03')).toBe(2220);
    expect(computeSocialSecurityPunjab(37000, 51800, '3')).toBe(2220);
    expect(computeSocialSecurityPunjab(37000, 51800, '02')).toBe(2220);
    expect(computeSocialSecurityPunjab(37000, 51800, '2')).toBe(2220);
    expect(computeSocialSecurityPunjab(37000, 51800, 'DHA')).toBe(2220);
    expect(computeSocialSecurityPunjab(37000, 51800, 'SAM')).toBe(2220);
    expect(computeSocialSecurityPunjab(37000, 51800, 'RUDA')).toBe(2220);
  });

  it('keeps Punjab eligibility capped at 1.4 times minimum wage', () => {
    expect(computeSocialSecurityPunjab(37000, 51800.01, 'Johar Town')).toBe(0);
  });

  it('does not calculate Social Security when bank gross is zero', () => {
    expect(computeSocialSecurityPunjab(37000, 0, 'Johar Town')).toBe(0);
    expect(computeSocialSecurityPunjab(37000, 0, 'MB')).toBe(0);
    expect(computeSocialSecurityKpk(37000, 0, 'DHA')).toBe(0);
  });

  it('does not calculate KPK contributions for the current branch list', () => {
    expect(computeSocialSecurityKpk(37000, 59200, 'DHA')).toBe(0);
    expect(computeSocialSecurityKpk(37000, 59200, 'SAM')).toBe(0);
    expect(computeSocialSecurityKpk(37000, 59200, '02')).toBe(0);
  });
});
