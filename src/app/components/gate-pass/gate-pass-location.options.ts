import {
  GL_ACCOUNT_BRANCH_OPTIONS,
  resolveBranchCode,
} from '../setup/gl-account-determination/gl-account-branch.options';

export const GATE_PASS_LOCATION_OPTIONS = GL_ACCOUNT_BRANCH_OPTIONS.map((branch) => branch.name);

/** Maps a base-document / API location or BPLId value onto a known dropdown option. */
export function resolveGatePassLocation(value: string | undefined | null): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed === '—') {
    return '';
  }

  const branchCode = resolveBranchCode(trimmed);
  return GL_ACCOUNT_BRANCH_OPTIONS.find((branch) => branch.code === branchCode)?.name ?? '';
}

/** Resolves SAP `BPLId` (branch) onto Location dropdown value. */
export function resolveGatePassLocationFromBplId(value: string | number | undefined | null): string {
  return resolveGatePassLocation(value === undefined || value === null ? '' : String(value));
}
