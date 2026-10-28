export interface OitmItem {
  itemCode: string;
  itemName: string;
  itemType?: string;
  fetchPro?: string;
  cavityNumber?: string;
  properties?: OitmProperty[];
  uom: string;
  availableQty?: string | number;
  batches?: OitmBatch[];
}

export interface OitmProperty {
  code: string;
  name: string;
}

export interface OitmBatch {
  batchNumber: string;
  warehouse: string;
  quantity?: string | number;
  legacyBatch?: string;
  manufacturingDate?: string;
  expiryDate?: string;
}
