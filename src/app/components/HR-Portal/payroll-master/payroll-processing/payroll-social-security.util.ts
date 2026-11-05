import { resolveBranchCode } from '../../../setup/gl-account-determination/gl-account-branch.options';

function normalizeBranchCode(location: string): string {
  return resolveBranchCode(location).replace(/^0+(?=\d)/, '');
}

export function computeSocialSecurityPunjab(
  minimumWage: number,
  grossSalaryInBank: number,
  location: string,
): number {
  if (grossSalaryInBank <= 0) {
    return 0;
  }
  const branchCode = normalizeBranchCode(location);
  if (['1', '2', '3', '4', '5'].includes(branchCode) && grossSalaryInBank <= minimumWage * 1.4) {
    return minimumWage * 0.06;
  }
  return 0;
}

export function computeSocialSecurityKpk(
  _minimumWage: number,
  _grossSalaryInBank: number,
  _location: string,
): number {
  return 0;
}
