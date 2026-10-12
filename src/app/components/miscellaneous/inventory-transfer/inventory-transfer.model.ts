export interface InventoryTransferHeader {
  businessPartner: string;
  name: string;
  contactPerson: string;
  shipTo: string;
  postingDate: string;
  docDate: string;
  taxDate: string;
  fromBranch: string;
  fromWarehouse: string;
  toWarehouse: string;
  toBinLocation: string;
  journalRemarks: string;
  remarks: string;
  baseItrDocEntry?: string;
  baseItrDocNum?: string;
}

export interface InventoryTransferLine {
  itemCode: string;
  itemDescription: string;
  itemCost: string;
  uomCode: string;
  uomName: string;
  distrRule: string;
  fromWarehouse: string;
  fromBinLocation: string;
  toWarehouse: string;
  firstToBinLocation: string;
  toBranch: string;
  quantity: number | null;
  batchNumber: string;
  baseEntry?: string;
  baseLine?: string;
}

function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export function createEmptyInventoryTransferHeader(): InventoryTransferHeader {
  const today = todayDateString();
  return {
    businessPartner: '',
    name: '',
    contactPerson: '',
    shipTo: '',
    postingDate: today,
    docDate: today,
    taxDate: today,
    fromBranch: '',
    fromWarehouse: '',
    toWarehouse: '',
    toBinLocation: '',
    journalRemarks: '',
    remarks: 'Inventory transfer request',
    baseItrDocEntry: '',
    baseItrDocNum: '',
  };
}

export function createEmptyInventoryTransferLine(
  fromWarehouse = '',
  toWarehouse = '',
): InventoryTransferLine {
  return {
    itemCode: '',
    itemDescription: '',
    itemCost: '',
    uomCode: '',
    uomName: '',
    distrRule: '',
    fromWarehouse,
    fromBinLocation: '',
    toWarehouse,
    firstToBinLocation: '',
    toBranch: '',
    quantity: null,
    batchNumber: '',
    baseEntry: '',
    baseLine: '',
  };
}

export function updateInventoryTransferLine(
  rows: InventoryTransferLine[],
  index: number,
  field: keyof InventoryTransferLine,
  value: string,
): InventoryTransferLine[] {
  return rows.map((row, rowIndex) => {
    if (rowIndex !== index) {
      return row;
    }

    if (field === 'quantity') {
      const numericValue = value === '' ? null : Number(value);
      return { ...row, quantity: Number.isNaN(numericValue) ? null : numericValue };
    }

    return { ...row, [field]: value };
  });
}
