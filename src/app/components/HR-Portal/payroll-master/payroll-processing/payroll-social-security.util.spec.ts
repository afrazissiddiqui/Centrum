import { describe, expect, it } from 'vitest';
import {
  computeSocialSecurityKpk,
  computeSocialSecurityPunjab,
} from './payroll-social-security.util';

describe('payroll social security contributions', () => {
  it('calculates the Punjab contribution for FSD and AHCP_HO branch codes', () => {
    expect(computeSocialSecurityPunjab(37000, 51800, '03')).toBe(2220);
    expect(computeSocialSecurityPunjab(37000, 51800, '3')).toBe(2220);
    expect(computeSocialSecurityPunjab(37000, 51800, '02')).toBe(2220);
    expect(computeSocialSecurityPunjab(37000, 51800, '2')).toBe(2220);
    expect(computeSocialSecurityPunjab(37000, 51800, 'AHCP_HO')).toBe(2220);
  });

  it('keeps Punjab eligibility capped at 1.4 times minimum wage', () => {
    expect(computeSocialSecurityPunjab(37000, 51800.01, 'AHCP_HO')).toBe(0);
  });

  it('calculates KPK contribution only for Peshawar branch codes', () => {
    expect(computeSocialSecurityKpk(37000, 59200, '01')).toBe(2220);
    expect(computeSocialSecurityKpk(37000, 59200, '1')).toBe(2220);
    expect(computeSocialSecurityKpk(37000, 59200, 'AHCP_Peshawar')).toBe(2220);
    expect(computeSocialSecurityKpk(37000, 59200, '02')).toBe(0);
  });
});
