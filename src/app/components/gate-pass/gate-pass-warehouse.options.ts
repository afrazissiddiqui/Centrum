export interface GatePassWarehouseOption {
  code: string;
  name: string;
}

export const GATE_PASS_WAREHOUSE_OPTIONS: GatePassWarehouseOption[] = [
  { code: '01', name: 'General Warehouse HO' },
  { code: '02', name: 'General Warehouse-Peshawar' },
  { code: '03', name: 'General Warehouse-Faisalabad' },
  { code: 'FSD-WH01', name: 'SC Main Warehouse 1' },
  { code: 'FSD-WH02', name: 'SC Warehouse 2 (Production Hall)' },
  { code: 'FSD-WH03', name: 'Production Hall Warehouse' },
  { code: 'FSD-WH04', name: 'Toll Resin Warehouse' },
  { code: 'FSD-WH05', name: 'Toll Finished Goods Warehouse' },
  { code: 'FSD-WH06', name: 'QC Warehouse' },
  { code: 'FSD-WH07', name: 'Rented Warehouse' },
  { code: 'FSD-WH08', name: 'General Stores' },
  { code: 'FSD-WH10', name: 'Scrap Yard' },
  { code: 'PSH-WH01', name: 'SC Main Warehouse 1' },
  { code: 'PSH-WH02', name: 'SC Warehouse 2 (Production Hall)' },
  { code: 'PSH-WH03', name: 'Production Hall Warehouse' },
  { code: 'PSH-WH04', name: 'Toll Resin Warehouse' },
  { code: 'PSH-WH05', name: 'Toll Finished Goods Warehouse' },
  { code: 'PSH-WH06', name: 'QC Warehouse' },
  { code: 'PSH-WH07', name: 'Rented Warehouse' },
  { code: 'PSH-WH08', name: 'General Stores' },
  { code: 'PSH-WH10', name: 'Scrap Yard' },
];

export function gatePassWarehouseLabel(code: string | undefined | null): string {
  const trimmed = code?.trim();
  if (!trimmed || trimmed === '—') {
    return '—';
  }
  const match = GATE_PASS_WAREHOUSE_OPTIONS.find(
    (warehouse) => warehouse.code.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ? `${match.code} — ${match.name}` : trimmed;
}

/** Maps a base-document / API warehouse value onto a known warehouse code. */
export function resolveGatePassWarehouseCode(value: string | undefined | null): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed === '—') {
    return '';
  }

  const normalized = trimmed.toLowerCase();
  const byCode = GATE_PASS_WAREHOUSE_OPTIONS.find(
    (warehouse) => warehouse.code.toLowerCase() === normalized,
  );
  if (byCode) {
    return byCode.code;
  }

  const byName = GATE_PASS_WAREHOUSE_OPTIONS.find(
    (warehouse) => warehouse.name.toLowerCase() === normalized,
  );
  if (byName) {
    return byName.code;
  }

  const byLabel = GATE_PASS_WAREHOUSE_OPTIONS.find((warehouse) => {
    const label = `${warehouse.code} — ${warehouse.name}`.toLowerCase();
    const compact = `${warehouse.code} - ${warehouse.name}`.toLowerCase();
    return label === normalized || compact === normalized;
  });
  if (byLabel) {
    return byLabel.code;
  }

  const partial = GATE_PASS_WAREHOUSE_OPTIONS.find(
    (warehouse) =>
      warehouse.name.toLowerCase().includes(normalized) ||
      normalized.includes(warehouse.name.toLowerCase()) ||
      warehouse.code.toLowerCase().includes(normalized),
  );
  return partial?.code ?? '';
}
