export interface ReceiptFromProductionHeader {
  branchId: string;
  branchName: string;
  warehouse?: string;
  remarks: string;
  postingDate: string;
  documentDate: string;
  dueDate: string;
  productionTime: string;
  machineId?: string;
  machineName?: string;
  shift?: string;
  moldNumber?: string;
  cavityNumber?: string;
  customerCode?: string;
  customerName?: string;
  noBinReceived?: string | null;
  documentTaxStatus?: string;
  baseProductionOrderDocEntry?: string;
  baseProductionOrderDocNum?: string;
}

export interface ReceiptFromProductionLine {
  orderNo: string;
  seriesNo: string;
  orderType: string;
  itemCode: string;
  itemDescription: string;
  transactionType: 'Complete' | 'Reject';
  quantity: number | null;
  unitPrice: number | null;
  warehouse: string;
  binLocation: string;
  allocation: string;
  itemCost: number | null;
  plannedQty: number | null;
  completedQty: number | null;
  uomCode: string;
  uomName: string;
  departmentLocation: string;
  branch: string;
  byProduct: string;
  quantityPerJumboCtn: number | null;
  jumboCartons: number | null;
  batchNumber: string;
  legacyBatch: string;
  refilling: boolean;
  existingBatch: string;
  manufacturingDate: string;
  expiryDate: string;
  baseEntry?: string;
  baseLine?: string;
}

function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

function plusDaysDateString(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

export function createEmptyReceiptFromProductionHeader(): ReceiptFromProductionHeader {
  const today = todayDateString();
  return {
    branchId: '2',
    branchName: 'Johar Town',
    warehouse: '',
    remarks: '',
    postingDate: today,
    documentDate: today,
    dueDate: today,
    productionTime: '',
    machineId: '',
    machineName: '',
    shift: '',
    moldNumber: '',
    cavityNumber: '',
    customerCode: '',
    customerName: '',
    noBinReceived: null,
    documentTaxStatus: '',
    baseProductionOrderDocEntry: '',
    baseProductionOrderDocNum: '',
  };
}

export function createEmptyReceiptFromProductionLine(): ReceiptFromProductionLine {
  return {
    orderNo: '',
    seriesNo: '',
    orderType: '',
    itemCode: '',
    itemDescription: '',
    transactionType: 'Complete',
    quantity: null,
    unitPrice: null,
    warehouse: '',
    binLocation: '',
    allocation: '',
    itemCost: null,
    plannedQty: null,
    completedQty: null,
    uomCode: '',
    uomName: '',
    departmentLocation: '',
    branch: '',
    byProduct: '',
    quantityPerJumboCtn: null,
    jumboCartons: null,
    batchNumber: '',
    legacyBatch: '',
    refilling: false,
    existingBatch: '',
    manufacturingDate: '',
    expiryDate: plusDaysDateString(10),
    baseEntry: '',
    baseLine: '',
  };
}

export function updateReceiptFromProductionLine(
  rows: ReceiptFromProductionLine[],
  index: number,
  field: keyof ReceiptFromProductionLine,
  value: string,
): ReceiptFromProductionLine[] {
  return rows.map((row, rowIndex) => {
    if (rowIndex !== index) {
      return row;
    }

    const numericFields: Array<keyof ReceiptFromProductionLine> = [
      'unitPrice',
      'quantity',
      'itemCost',
      'plannedQty',
      'completedQty',
      'quantityPerJumboCtn',
      'jumboCartons',
    ];

    if (numericFields.includes(field)) {
      const numericValue = value === '' ? null : Number(value);
      return { ...row, [field]: Number.isNaN(numericValue) ? null : numericValue };
    }

    return { ...row, [field]: value };
  });
}
