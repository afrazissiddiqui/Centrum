import {
  GL_ACCOUNT_BRANCH_OPTIONS,
  resolveBranchCode,
} from '../components/setup/gl-account-determination/gl-account-branch.options';

export function resolveBranchNameFromBplId(value: string | number | undefined | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  const code = resolveBranchCode(raw);
  return GL_ACCOUNT_BRANCH_OPTIONS.find((branch) => branch.code === code)?.name ?? raw;
}

export function formatBranchNameForDisplay(value: string | number | undefined | null): string {
  return resolveBranchNameFromBplId(value);
}
