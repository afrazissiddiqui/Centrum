export type GlAccountBranchOption = {
  code: string;
  name: string;
};

export const GL_ACCOUNT_BRANCH_OPTIONS: GlAccountBranchOption[] = [
  { code: '1', name: 'DHA' },
  { code: '2', name: 'Johar Town' },
  { code: '3', name: 'MB' },
  { code: '4', name: 'SAM' },
  { code: '5', name: 'RUDA' },
];

const LEGACY_BRANCH_CODES: Record<string, string> = {
  'ahcp peshawar': '1',
  peshawar: '1',
  psh: '1',
  'psh branch': '1',
  'ahcp ho': '2',
  ho: '2',
  'head office': '2',
  headoffice: '2',
  'lahore ho': '2',
  'ahcp faisalabad': '3',
  faisalabad: '3',
  fsd: '3',
  'faisalabad branch': '3',
};

export function glAccountBranchCode(name: string): string {
  const normalizedName = normalizeBranchName(name);
  const legacyCode = resolveLegacyBranchCode(normalizedName);
  if (legacyCode) {
    return legacyCode;
  }
  const match = GL_ACCOUNT_BRANCH_OPTIONS.find(
    (option) => normalizeBranchName(option.name) === normalizedName,
  );
  return match?.code ?? name;
}

export function glAccountBranchLabel(codeOrName: string): string {
  const trimmed = codeOrName.trim();
  if (!trimmed) {
    return '';
  }
  const legacyCode = resolveLegacyBranchCode(normalizeBranchName(trimmed));
  if (legacyCode) {
    return GL_ACCOUNT_BRANCH_OPTIONS.find((option) => option.code === legacyCode)?.name ?? trimmed;
  }
  const match = GL_ACCOUNT_BRANCH_OPTIONS.find(
    (option) =>
      option.code === trimmed ||
      normalizeBranchName(option.name) === normalizeBranchName(trimmed),
  );
  return match?.name ?? trimmed;
}

function normalizeBranchName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

function resolveLegacyBranchCode(normalizedName: string): string | undefined {
  const exactCode = LEGACY_BRANCH_CODES[normalizedName];
  if (exactCode) {
    return exactCode;
  }
  if (normalizedName.includes('peshawar') || normalizedName.includes('psh')) {
    return '1';
  }
  if (normalizedName.includes('faisalabad') || normalizedName.includes('fsd')) {
    return '3';
  }
  if (normalizedName.includes('head office') || normalizedName === 'ho' || normalizedName.startsWith('ho ')) {
    return '2';
  }
  return undefined;
}

/** Resolves a branch display name or legacy label to the API branch code. */
export function resolveBranchCode(codeOrName: string): string {
  const trimmed = codeOrName.trim();
  if (!trimmed) {
    return '';
  }
  const legacyCode = resolveLegacyBranchCode(normalizeBranchName(trimmed));
  if (legacyCode) {
    return legacyCode;
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
  const byName = GL_ACCOUNT_BRANCH_OPTIONS.find(
    (option) => normalizeBranchName(option.name) === normalizeBranchName(trimmed),
  );
  if (byName) {
    return byName.code;
  }
  return glAccountBranchCode(trimmed);
}
