export type GlAccountBranchOption = {
  code: string;
  name: string;
};

export const GL_ACCOUNT_BRANCH_OPTIONS: GlAccountBranchOption[] = [
  { code: '1', name: 'AHCP_Peshawar' },
  { code: '2', name: 'AHCP_HO' },
  { code: '3', name: 'AHCP_Faisalabad' },
];

export function glAccountBranchCode(name: string): string {
  const match = GL_ACCOUNT_BRANCH_OPTIONS.find((option) => option.name === name);
  return match?.code ?? name;
}

export function glAccountBranchLabel(codeOrName: string): string {
  const trimmed = codeOrName.trim();
  if (!trimmed) {
    return '';
  }
  const match = GL_ACCOUNT_BRANCH_OPTIONS.find(
    (option) => option.code === trimmed || option.name === trimmed,
  );
  return match?.name ?? trimmed;
}

const LEGACY_BRANCH_ALIASES: Record<string, string> = {
  'AHCP_ Peshawar': '1',
  'AHCP_ HO': '2',
  'AHCP_ Faisalabad': '3',
};

/** Resolves a branch display name or legacy label to the API branch code. */
export function resolveBranchCode(codeOrName: string): string {
  const trimmed = codeOrName.trim();
  if (!trimmed) {
    return '';
  }
  if (LEGACY_BRANCH_ALIASES[trimmed]) {
    return LEGACY_BRANCH_ALIASES[trimmed];
  }
  const byCode = GL_ACCOUNT_BRANCH_OPTIONS.find((option) => option.code === trimmed);
  if (byCode) {
    return byCode.code;
  }
  if (/^\d+$/.test(trimmed)) {
    const normalizedCode = String(Number(trimmed));
    const byNormalizedCode = GL_ACCOUNT_BRANCH_OPTIONS.find(
      (option) => option.code === normalizedCode,
    );
    if (byNormalizedCode) {
      return byNormalizedCode.code;
    }
  }
  const normalizedName = trimmed.replace(/\s+/g, '_').replace(/^AHCP_\s*/i, 'AHCP_');
  const byName = GL_ACCOUNT_BRANCH_OPTIONS.find(
    (option) => option.name === trimmed || option.name === normalizedName,
  );
  if (byName) {
    return byName.code;
  }
  return glAccountBranchCode(normalizedName);
}
