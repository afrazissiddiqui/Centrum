export interface GoodReceiptHeader {
  branchId: string;
  branchName: string;
  remarks: string;
  postingDate: string;
  documentDate: string;
  dueDate: string;
  issueReceiptReason: string;
}

export interface GoodReceiptLine {
  itemCode: string;
  itemDescription: string;
  warehouse: string;
  quantity: number | null;
  unitPrice: number | null;
  batchNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  binLocationAllocation: string;
  accountCode: string;
  itemCost: number | null;
  uomCode: string;
  uomName: string;
  departmentsLocations: string;
  branch: string;
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

export function createEmptyGoodReceiptHeader(): GoodReceiptHeader {
  const today = todayDateString();
  return {
    branchId: '2',
    branchName: 'Johar Town',
    remarks: '',
    postingDate: today,
    documentDate: today,
    dueDate: today,
    issueReceiptReason: '',
  };
}

export function createEmptyGoodReceiptLine(): GoodReceiptLine {
  return {
    itemCode: '',
    itemDescription: '',
    warehouse: '',
    quantity: null,
    unitPrice: null,
    batchNumber: '',
    manufacturingDate: '',
    expiryDate: plusDaysDateString(10),
    binLocationAllocation: '',
    accountCode: '',
    itemCost: null,
    uomCode: '',
    uomName: '',
    departmentsLocations: '',
    branch: '',
    baseEntry: '',
    baseLine: '',
  };
}

export function updateGoodReceiptLine(
  rows: GoodReceiptLine[],
  index: number,
  field: keyof GoodReceiptLine,
  value: string,
): GoodReceiptLine[] {
  return rows.map((row, rowIndex) => {
    if (rowIndex !== index) {
      return row;
    }

    if (field === 'unitPrice' || field === 'quantity' || field === 'itemCost') {
      const numericValue = value === '' ? null : Number(value);
      return { ...row, [field]: Number.isNaN(numericValue) ? null : numericValue };
    }

    return { ...row, [field]: value };
  });
}
