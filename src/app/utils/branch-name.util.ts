export function resolveBranchNameFromBplId(value: string | number | undefined | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  const normalized = raw.toLowerCase();
  const branchNames: Record<string, string> = {
    '1': 'AHCP_Peshawar',
    '2': 'AHCP_HO',
    '3': 'AHCP_Faisalabad',
    ahcp_peshawar: 'AHCP_Peshawar',
    'ahcp-peshawar': 'AHCP_Peshawar',
    ahcp_ho: 'AHCP_HO',
    'ahcp-ho': 'AHCP_HO',
    ahcp_faisalabad: 'AHCP_Faisalabad',
    'ahcp-faisalabad': 'AHCP_Faisalabad',
    peshawar: 'AHCP_Peshawar',
    'ahcp peshawar': 'AHCP_Peshawar',
    psh: 'AHCP_Peshawar',
    'psh branch': 'AHCP_Peshawar',
    ho: 'AHCP_HO',
    'head office': 'AHCP_HO',
    'head-office': 'AHCP_HO',
    headoffice: 'AHCP_HO',
    faisalabad: 'AHCP_Faisalabad',
    'faisalabad branch': 'AHCP_Faisalabad',
    fsd: 'AHCP_Faisalabad',
    'ahcp fsd': 'AHCP_Faisalabad',
    'ahcp-fsd': 'AHCP_Faisalabad',
    'ahcp faisalabad': 'AHCP_Faisalabad',
  };

  if (branchNames[normalized]) {
    return branchNames[normalized];
  }

  if (/^\d+$/.test(normalized)) {
    const numericBranch = branchNames[String(Number(normalized))];
    if (numericBranch) {
      return numericBranch;
    }
  }

  const prefix = normalized.split(/[-_\s]/, 1)[0];
  if (prefix && branchNames[prefix]) {
    return branchNames[prefix];
  }

  if (normalized.includes('psh') || normalized.includes('peshawar')) {
    return 'AHCP_Peshawar';
  }
  if (normalized.includes('fsd') || normalized.includes('faisalabad')) {
    return 'AHCP_Faisalabad';
  }
  if (normalized.includes('ho') || normalized.includes('head office') || normalized.includes('head-office')) {
    return 'AHCP_HO';
  }

  return raw;
}

export function formatBranchNameForDisplay(value: string | number | undefined | null): string {
  const branchName = resolveBranchNameFromBplId(value);
  return branchName === 'AHCP_Peshawar' ? 'AHCP Peshawar' : branchName;
}
