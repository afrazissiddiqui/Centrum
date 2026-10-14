import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { apiUrl } from '../../../config/api.config';
import {
  ReceiptFromProductionHeader,
  ReceiptFromProductionLine,
} from './receipt-from-production.model';
import { resolveBranchNameFromBplId } from '../../../utils/branch-name.util';

function normalizeBranchName(value: string | number | undefined | null): string {
  return resolveBranchNameFromBplId(value);
}

function normalizeShift(value: string | undefined | null): string {
  const normalized = `${value ?? ''}`.trim().toLowerCase();
  if (normalized === 'shift a') {
    return '01';
  }
  if (normalized === 'shift b') {
    return '02';
  }
  if (normalized === 'shift c') {
    return '03';
  }
  return `${value ?? ''}`.trim();
}

function normalizeDocumentTaxStatus(value: string | undefined | null): string {
  const normalized = `${value ?? ''}`.trim().toLowerCase();
  if (normalized === 'registered' || normalized === 'r') {
    return 'R';
  }
  if (
    normalized === 'unregistered' ||
    normalized === 'u' ||
    normalized === 'ur' ||
    normalized === 'pass ur' ||
    normalized === 'unregistered pass ur'
  ) {
    return 'UR';
  }
  return `${value ?? ''}`.trim();
}

function normalizeProductionTime(value: string | undefined | null): string {
  const trimmed = `${value ?? ''}`.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return trimmed;
  }
  return `${Number(match[1])}:${match[2]}`;
}

function normalizeBranchCode(value: string | number | undefined | null): string {
  const trimmed = `${value ?? ''}`.trim();
  if (!trimmed) {
    return '';
  }

  const directMatch = trimmed.match(/^\d$/);
  if (directMatch) {
    return trimmed;
  }

  const normalized = trimmed.toLowerCase();
  if (normalized.includes('peshawar') || normalized.includes('psh')) {
    return '1';
  }
  if (normalized.includes('ho') || normalized.includes('head office') || normalized.includes('headoffice')) {
    return '2';
  }
  if (normalized.includes('faisalabad') || normalized.includes('fsd')) {
    return '3';
  }

  return trimmed;
}

function mapReceiptBranchLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  switch (trimmed.toLowerCase()) {
    case '1':
    case 'peshawar':
      return 'Peshawar';
    case '2':
    case 'ho':
    case 'head office':
    case 'headoffice':
      return 'HeadOffice';
    case '3':
    case 'faisalabad':
      return 'Faisalabad';
    default:
      return trimmed;
  }
}

export interface CreateReceiptFromProductionPayload {
  docEntry: number;
  docDate: string;
  taxDate: string;
  docDueDate: string;
  production_time: string;
  remarks: string;
  warehouse: string;
  quantity: number;
  batchNumber: string;
  manufacturingDate: string;
  branch: string;
  expiryDate: string;
  U_MachineID: string;
  U_MachineName: string;
  U_Shift: string;
  U_MoldNo: string;
  U_Cavity_NUM: string;
  U_DocTaxStatus: string;
  U_LegacyBatch: string | null;
  items?: Array<{
    line_num: number;
    item_code: string;
    quantity: number;
    warehouse: string;
    batch_no: string;
    batches: Array<{
      BatchNum: string;
      Quantity: string;
      MnfDate: string | null;
      ProductionTime: string | null;
      U_LegacyBatch: string | null;
    }>;
    refilling?: boolean;
    existing_batch?: string;
  }>;
}

export interface CreateReceiptFromProductionResponse {
  status?: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  error_code?: string | number;
  docEntry?: string | number;
  data?: Record<string, unknown>;
}

export interface ProductionOrderBatch {
  batchNo: string;
  quantity: number;
}

export interface ProductionOrderItem {
  lineNum: string;
  itemCode: string;
  itemDescription: string;
  legacyBatch?: string;
  manBtchNum?: string;
  quantity: number;
  plannedQty?: number;
  completedQty?: number;
  issuedQuantity?: number;
  jumboCartons: number;
  warehouse: string;
  batchNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  baseLine: string;
  batches?: ProductionOrderBatch[];
}

export interface ProductionOrderRecord {
  docEntry: string;
  docNum: string;
  seriesName: string;
  orderType: string;
  itemCode: string;
  itemDescription: string;
  plannedQty: number;
  completedQty: number;
  rejectedQty: number;
  receiptQty: number;
  postDate: string;
  dueDate: string;
  startDate: string;
  status: string;
  warehouse: string;
  branch: string;
  batchNumber: string;
  customerCode: string;
  customerName: string;
  U_MachineID?: string;
  U_MachineName?: string;
  U_MoldNo?: string;
  U_Cavity_NUM?: string;
  U_EmployeeShift?: string;
  U_Shift?: string;
  U_DocTaxStatus?: string;
  U_LegacyBatch?: string;
  U_NoBinReceived?: string | null;
  items?: ProductionOrderItem[];
}

export interface ReceiptFromProductionListLineItem {
  lineNum: string;
  itemCode: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  warehouse: string;
  lineTotal: number;
  batchNumber: string;
  itemColor: string;
}

export interface ReceiptFromProductionListItem {
  docEntry: string;
  docNum: string;
  docDate: string;
  docDueDate: string;
  seriesName: string;
  branch: string;
  warehouse: string;
  remarks: string;
  status: string;
  customerCode: string;
  customerName: string;
  driverName: string;
  vehicleNo: string;
  transporterName: string;
  shift: string;
  machineName: string;
  items: ReceiptFromProductionListLineItem[];
  itemCount: number;
}

export function buildCreateReceiptFromProductionPayload(
  header: ReceiptFromProductionHeader,
  lines: ReceiptFromProductionLine[],
): CreateReceiptFromProductionPayload {
  const validLines = lines.filter((line) => (line.itemCode ?? '').trim());
  const line = validLines[0];
  const baseDocEntry = (header.baseProductionOrderDocEntry ?? '').trim();
  const docEntry = Number.parseInt(baseDocEntry || (line?.baseEntry ?? '').trim() || '', 10);

  const normalizedLines = validLines.map((row, index) => ({
    line_num: index,
    item_code: (row.itemCode ?? '').trim(),
    quantity: row.quantity ?? 0,
    warehouse: ((row.warehouse ?? '') as string).trim(),
    batch_no: ((row.batchNumber ?? '') as string).trim(),
    batches: [
      {
        BatchNum: ((row.batchNumber ?? '') as string).trim(),
        Quantity: (row.quantity ?? 0).toFixed(6),
        MnfDate: ((row.manufacturingDate ?? '') as string).trim() || null,
        ProductionTime: normalizeProductionTime(header.productionTime) || null,
        U_LegacyBatch: ((row.legacyBatch ?? '') as string).trim() || null,
      },
    ],
    refilling: Boolean(row.refilling),
    existing_batch: ((row.existingBatch ?? '') as string).trim(),
  }));

  const headerWarehouse = ((header as ReceiptFromProductionHeader & { warehouse?: string }).warehouse ?? '').trim();
  const lineWarehouse = ((line?.warehouse ?? '') as string).trim();

  return {
    docEntry: Number.isFinite(docEntry) ? docEntry : 0,
    docDate: (header.documentDate ?? '').trim(),
    taxDate: (header.postingDate ?? '').trim(),
    docDueDate: (header.dueDate ?? '').trim(),
    production_time: normalizeProductionTime(header.productionTime),
    remarks: (header.remarks ?? '').trim(),
    warehouse: lineWarehouse || headerWarehouse,
    quantity: line?.quantity ?? 0,
    batchNumber: ((line?.batchNumber ?? '') as string).trim(),
    manufacturingDate: ((line?.manufacturingDate ?? '') as string).trim(),
    branch: normalizeBranchCode(header.branchId ?? ''),
    expiryDate: ((line?.expiryDate ?? '') as string).trim(),
    U_MachineID: (header.machineId ?? '').trim(),
    U_MachineName: (header.machineName ?? '').trim(),
    U_Shift: normalizeShift(header.shift),
    U_MoldNo: (header.moldNumber ?? '').trim(),
    U_Cavity_NUM: (header.cavityNumber ?? '').trim(),
    U_DocTaxStatus: normalizeDocumentTaxStatus(header.documentTaxStatus),
    U_LegacyBatch: ((line?.legacyBatch ?? '') as string).trim() || null,
    items: normalizedLines,
  };
}

@Injectable({ providedIn: 'root' })
export class ReceiptFromProductionService {
  private readonly http = inject(HttpClient);

  list(): Observable<ReceiptFromProductionListItem[]> {
    return this.http.get<unknown>(apiUrl('receipt_from_production')).pipe(
      map((response) =>
        this.parseReceipts(response, [
          'data',
          'receipt_from_production',
          'receipts_from_production',
        ]),
      ),
    );
  }

  listProductionOrders(): Observable<ProductionOrderRecord[]> {
    return this.http.get<unknown>(apiUrl('production_orders')).pipe(
      map((response) => this.parseProductionOrders(response)),
    );
  }

  getProductionOrderDetails(docEntry: string): Observable<ProductionOrderItem[]> {
    return this.http
      .get<unknown>(apiUrl(`production_orders/${encodeURIComponent(docEntry)}/items`))
      .pipe(map((response) => this.parseProductionOrderItems(response)));
  }

  create(
    payload: CreateReceiptFromProductionPayload,
  ): Observable<CreateReceiptFromProductionResponse> {
    return this.http.post<CreateReceiptFromProductionResponse>(
      apiUrl('createReceiptFromProduction'),
      payload,
    );
  }

  createIssueForProduction(
    payload: Record<string, unknown>,
  ): Observable<CreateReceiptFromProductionResponse> {
    return this.http.post<CreateReceiptFromProductionResponse>(
      apiUrl('createIssueForProduction'),
      payload,
    );
  }

  private parseProductionOrderItems(response: unknown): ProductionOrderItem[] {
    const data = this.extractDataArray(response, ['production_order_items', 'items', 'data']);
    return data
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => this.mapProductionOrderItem(item));
  }

  private mapProductionOrderItem(item: Record<string, unknown>, fallbackItem?: Record<string, unknown>): ProductionOrderItem {
    const firstBatch = this.pickFirstBatch(item);
    const fallback = fallbackItem ?? {};
    const itemCode = this.pickString(item, ['ItemCode', 'itemCode', 'Item', 'ProductCode', 'ProdCode', 'Product']) || this.pickString(fallback, ['ItemCode', 'itemCode', 'Item', 'ProductCode', 'ProdCode', 'Product']);
    const itemDescription = this.pickString(item, ['ItemName', 'itemName', 'ProdName', 'ProductName', 'Dscription', 'itemDescription', 'Name']) || this.pickString(fallback, ['ItemName', 'itemName', 'ProdName', 'ProductName', 'Dscription', 'itemDescription', 'Name']);
    const lineNum =
      this.pickString(item, ['LineNum', 'lineNum', 'line_num', 'DocLine', 'docLine', 'doc_line']) ||
      this.pickString(fallback, ['LineNum', 'lineNum', 'line_num', 'DocLine', 'docLine', 'doc_line']);
    const lineQuantity = this.pickProductionOrderItemQuantity(item);
    const fallbackQuantity = this.pickProductionOrderItemQuantity(fallback);
    const quantity = lineQuantity > 0 ? lineQuantity : fallbackQuantity;
    const issuedQuantity = this.pickNumber(item, ['IssuedQty', 'issuedQty']);
    const fallbackIssuedQuantity = this.pickNumber(fallback, ['IssuedQty', 'issuedQty']);
    const normalizedIssuedQuantity = issuedQuantity > 0 ? issuedQuantity : fallbackIssuedQuantity;
    const lineJumboCartons = this.pickNumber(item, ['U_NoJC', 'NoJC', 'numJumboCartons', 'jumboCartons', 'U_NoJc']);
    const fallbackJumboCartons = this.pickNumber(fallback, ['U_NoJC', 'NoJC', 'numJumboCartons', 'jumboCartons', 'U_NoJc']);
    const jumboCartons = lineJumboCartons > 0 ? lineJumboCartons : fallbackJumboCartons;

    return {
      lineNum,
      itemCode,
      itemDescription,
      legacyBatch:
        this.pickString(item, ['U_LegacyBatch', 'legacyBatch', 'LegacyBatch']) ||
        this.pickString(fallback, ['U_LegacyBatch', 'legacyBatch', 'LegacyBatch']) ||
        (firstBatch ? this.pickString(firstBatch, ['U_LegacyBatch', 'legacyBatch', 'LegacyBatch']) : ''),
      manBtchNum: this.pickString(item, ['ManBtchNum', 'manBtchNum', 'ManBatchNum']),
      quantity,
      issuedQuantity: normalizedIssuedQuantity > 0 ? normalizedIssuedQuantity : undefined,
      jumboCartons,
      warehouse:
        this.pickString(item, ['WhsCode', 'warehouse', 'Warehouse', 'wareHouse', 'Whs', 'WarehouseCode']) ||
        this.pickString(fallback, ['WhsCode', 'warehouse', 'Warehouse', 'wareHouse', 'Whs', 'WarehouseCode']) ||
        (firstBatch ? this.pickString(firstBatch, ['WhsCode', 'warehouse', 'Warehouse', 'wareHouse']) : ''),
      batchNumber:
        this.pickString(item, ['BatchNum', 'batchNum', 'batchNumber', 'batch_number', 'BatchNo', 'Batch', 'U_BatchNum']) ||
        this.pickString(fallback, ['BatchNum', 'batchNum', 'batchNumber', 'batch_number', 'BatchNo', 'Batch', 'U_BatchNum']) ||
        (firstBatch ? this.pickString(firstBatch, ['BatchNum', 'batchNum', 'batchNumber', 'batch_number', 'BatchNo']) : ''),
      manufacturingDate: this.pickDate(item, ['ManufactureDate', 'MfgDate', 'manufacturingDate']) || this.pickDate(fallback, ['ManufactureDate', 'MfgDate', 'manufacturingDate']),
      expiryDate: this.pickDate(item, ['ExpiryDate', 'expiry_date', 'expiryDate']) || this.pickDate(fallback, ['ExpiryDate', 'expiry_date', 'expiryDate']),
      baseLine: lineNum || '0',
      batches: this.pickAvailableBatches(item),
    };
  }

  private pickProductionOrderItemQuantity(item: Record<string, unknown>): number {
    const plannedQty = this.pickNumber(item, ['PlannedQty', 'plannedQty']);
    const completedQty = this.pickNumber(item, ['CmpltQty', 'completedQty', 'CompletedQty', 'completeQty']);
    if (plannedQty > 0 || completedQty > 0) {
      return Math.max(plannedQty - completedQty, 0);
    }

    const quantity = this.pickNumber(item, ['Quantity', 'quantity', 'Qty', 'qty']);
    if (quantity > 0) {
      return quantity;
    }

    const firstBatch = this.pickFirstBatch(item);
    return firstBatch ? this.pickNumber(firstBatch, ['Quantity', 'quantity', 'Qty', 'qty', 'PlannedQty', 'plannedQty']) : 0;
  }

  private parseProductionOrders(response: unknown): ProductionOrderRecord[] {
    const data = this.extractDataArray(response, ['production_orders', 'production_order', 'data']);

    return data
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => {
        const plannedQty = this.pickNumber(item, ['PlannedQty', 'plannedQty']);
        const completedQty = this.pickNumber(item, ['CmpltQty', 'completedQty']);
        const rejectedQty = this.pickNumber(item, ['RjctQty', 'rjctQty', 'RejectedQty', 'rejectedQty']);
        const receiptQty = this.pickNumber(item, ['qty', 'receiptQty', 'Quantity', 'quantity']);
        const remainingQty = Math.max(plannedQty - completedQty, 0);
        const orderQuantity = receiptQty > 0 ? receiptQty : remainingQty;

        const orderLines = this.extractOrderItems(item);
        const items =
          orderLines.length > 0
            ? orderLines.map((line) => this.mapProductionOrderItem(line, item))
            : this.hasProductionOrderItemFields(item)
              ? [this.mapProductionOrderItem(item)]
              : [];

        return {
          docEntry: this.pickString(item, ['DocEntry', 'docEntry']),
          docNum: this.pickString(item, ['DocNum', 'docNum']),
          seriesName: this.pickString(item, ['SeriesName', 'seriesName', 'Series']),
          orderType: this.pickString(item, ['Type', 'type', 'OrderType', 'orderType', 'DocumentType', 'docType']),
          itemCode: this.pickString(item, ['ItemCode', 'itemCode']),
          itemDescription: this.pickString(item, ['ItemName', 'itemName', 'ProdName', 'ProductName', 'itemDescription', 'Dscription', 'Name']),
          plannedQty,
          completedQty,
          rejectedQty,
          receiptQty: orderQuantity,
          postDate: this.pickDate(item, ['PostDate', 'docDate', 'DocDate']),
          dueDate: this.pickDate(item, ['DueDate', 'docDueDate', 'DocDueDate']),
          startDate: this.pickDate(item, ['StartDate', 'startDate']),
          status: this.pickString(item, ['Status', 'status']),
          warehouse: this.pickString(item, ['Warehouse', 'warehouse', 'WhsCode', 'wareHouse', 'Whs', 'WarehouseCode']),
          branch: normalizeBranchName(this.pickString(item, ['BPLName', 'branchName', 'Branch', 'branch', 'BPLId'])),
          batchNumber: this.pickProductionOrderBatchNumber(item),
          customerCode: this.pickString(item, ['CardCode', 'cardCode']),
          customerName: this.pickString(item, ['CardName', 'cardName']),
          U_MachineID: this.pickString(item, ['U_MachineID', 'machineId', 'MachineID', 'MachineNo']),
          U_MachineName: this.pickString(item, ['U_MachineName', 'machineName', 'MachineName']),
          U_MoldNo: this.pickString(item, ['U_MoldNo', 'moldNumber', 'MoldNo', 'Mold']),
          U_Cavity_NUM: this.pickString(item, ['U_Cavity_NUM', 'cavityNumber', 'Cavity_NUM', 'CavityNum']),
          U_EmployeeShift: this.pickString(item, ['U_EmployeeShift', 'employeeShift', 'Shift', 'shift']),
          U_Shift: this.pickString(item, ['U_Shift', 'shift', 'Shift']),
          U_DocTaxStatus: this.pickString(item, ['U_DocTaxStatus', 'documentTaxStatus', 'DocTaxStatus']),
          U_LegacyBatch: this.pickString(item, ['U_LegacyBatch', 'legacyBatch', 'LegacyBatch']),
          U_NoBinReceived: this.pickString(item, ['U_NoBinReceived', 'NoBinReceived']) || null,
          items,
        };
      });
  }

  private extractOrderItems(item: Record<string, unknown>): Record<string, unknown>[] {
    const candidates = ['items', 'Items', 'DocumentLines', 'Lines', 'documentLines'];
    for (const key of candidates) {
      const value = item[key];
      if (Array.isArray(value)) {
        return value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object');
      }
    }
    // Sometimes APIs return a single object rather than an array for a single line
    const singleCandidates = ['item', 'Item', 'line', 'Line', 'DocumentLine'];
    for (const key of singleCandidates) {
      const value = item[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return [value as Record<string, unknown>];
      }
    }
    return [];
  }

  private hasProductionOrderItemFields(item: Record<string, unknown>): boolean {
    return (
      this.pickString(item, ['ItemCode', 'itemCode', 'ProductCode', 'ProdCode', 'Item', 'Product']) !== '' ||
      this.pickString(item, ['ItemName', 'itemName', 'ProdName', 'ProductName', 'itemDescription', 'Dscription', 'Name']) !== '' ||
      this.pickNumber(item, ['PlannedQty', 'plannedQty', 'Quantity', 'quantity', 'Qty', 'qty', 'OpenQty']) > 0 ||
      this.pickString(item, ['WhsCode', 'warehouse', 'Warehouse', 'wareHouse', 'Whs', 'WarehouseCode']) !== '' ||
      this.pickString(item, ['BatchNum', 'batchNum', 'batchNumber', 'batch_number', 'BatchNo', 'Batch', 'U_BatchNum']) !== '' ||
      this.pickNumber(item, ['U_NoJC', 'NoJC', 'numJumboCartons', 'jumboCartons', 'U_NoJc']) > 0
    );
  }

  private pickProductionOrderBatchNumber(item: Record<string, unknown>): string {
    const batches = this.pickArray(item, ['batches', 'Batches']);
    const firstBatch =
      batches.find(
        (batch): batch is Record<string, unknown> =>
          !!batch && typeof batch === 'object' && !Array.isArray(batch),
      ) ?? null;

    if (firstBatch) {
      return this.pickString(firstBatch, ['BatchNum', 'batchNum', 'batchNumber', 'batch_number']);
    }

    return this.pickString(item, ['BatchNum', 'batchNum', 'batchNumber', 'batch_number']);
  }

  private pickFirstBatch(item: Record<string, unknown>): Record<string, unknown> | null {
    const batches = this.pickArray(item, ['batches', 'Batches']);
    return (
      batches.find(
        (batch): batch is Record<string, unknown> =>
          !!batch && typeof batch === 'object' && !Array.isArray(batch),
      ) ?? null
    );
  }

  private pickAvailableBatches(item: Record<string, unknown>): Array<{ batchNo: string; quantity: number }> {
    const batchEntries = this.pickArray(item, ['batches', 'Batches']);
    return batchEntries
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object' && !Array.isArray(entry))
      .map((entry) => ({
        batchNo: this.pickString(entry, ['BatchNo', 'batchNo', 'batchNumber', 'batch_number', 'BatchNum', 'batchNum', 'Batch']),
        quantity: this.pickNumber(entry, ['Quantity', 'quantity', 'Qty', 'qty', 'AvailableQty', 'availableQty']),
      }))
      .filter((entry) => entry.batchNo.trim() !== '');
  }

  private parseReceipts(
    response: unknown,
    wrapperKeys: string[],
  ): ReceiptFromProductionListItem[] {
    const data = this.extractDataArray(response, wrapperKeys);
    return data
      .filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object' && !Array.isArray(item),
      )
      .map((item) => {
        const lines = this.pickArray(item, ['items', 'lines', 'DocumentLines'])
          .filter(
            (line): line is Record<string, unknown> =>
              !!line && typeof line === 'object' && !Array.isArray(line),
          )
          .map((line) => {
            const batches = this.pickArray(line, ['batches']);
            const firstBatch =
              batches.find(
                (batch): batch is Record<string, unknown> =>
                  !!batch && typeof batch === 'object' && !Array.isArray(batch),
              ) ?? null;

            return {
              lineNum: this.pickString(line, ['LineNum', 'lineNum']),
              itemCode: this.pickString(line, ['ItemCode', 'itemCode']),
              itemDescription: this.pickString(line, [
                'Dscription',
                'itemDescription',
                'description',
              ]),
              quantity: this.pickNumber(line, ['Quantity', 'quantity']),
              unitPrice: this.pickNumber(line, ['Price', 'unitPrice', 'price']),
              warehouse: this.pickString(line, ['WhsCode', 'warehouse']),
              lineTotal: this.pickNumber(line, ['LineTotal', 'lineTotal']),
              batchNumber: firstBatch
                ? this.pickString(firstBatch, ['BatchNum', 'batchNumber', 'batch_number'])
                : this.pickString(line, ['SerialNum', 'batchNumber', 'BatchNum']),
              itemColor: this.pickString(line, ['U_ItemColor', 'itemColor', 'Colour', 'Color']),
            };
          });

        const firstLine = lines[0] ?? null;
        return {
          docEntry: this.pickString(item, ['DocEntry', 'docEntry']),
          docNum: this.pickString(item, ['DocNum', 'docNum']),
          docDate: this.pickDate(item, ['DocDate', 'docDate']),
          docDueDate: this.pickDate(item, ['DocDueDate', 'docDueDate']),
          seriesName: this.pickString(item, ['SeriesName', 'seriesName', 'Series']),
          branch: normalizeBranchName(this.pickString(item, ['BPLName', 'branchName', 'Branch', 'branch', 'BPLId'])),
          warehouse:
            this.pickString(item, ['WhsCode', 'warehouse', 'Filler']) || firstLine?.warehouse || '',
          remarks: this.pickString(item, ['Comments', 'Remarks', 'remarks']),
          status: this.pickString(item, ['DocStatus', 'status']) || 'O',
          customerCode: this.pickString(item, ['CardCode', 'cardCode']),
          customerName: this.pickString(item, ['CardName', 'cardName']),
          driverName: this.pickString(item, ['U_DriverName', 'driverName']),
          vehicleNo: this.pickString(item, ['U_VehicleNo', 'vehicleNo']),
          transporterName: this.pickString(item, ['U_TransporterName', 'transporterName']),
          shift: this.pickString(item, ['U_Shift', 'Shift', 'shift']),
          machineName: this.pickString(item, ['U_MAC_Name', 'U_Machine', 'machineName', 'Machine']),
          items: lines,
          itemCount: lines.length,
        };
      });
  }

  private extractDataArray(response: unknown, wrapperKeys: string[]): unknown[] {
    if (Array.isArray(response)) {
      return response;
    }
    if (!response || typeof response !== 'object') {
      return [];
    }

    const root = response as Record<string, unknown>;

    if (this.isSingleProductionOrderLike(root)) {
      return [root];
    }

    const wrappedCandidates = [...wrapperKeys, 'data', 'value', 'result', 'items'];
    for (const key of wrappedCandidates) {
      const wrapper = root[key];
      if (Array.isArray(wrapper)) {
        return wrapper;
      }
      if (wrapper && typeof wrapper === 'object' && !Array.isArray(wrapper)) {
        const nested = wrapper as Record<string, unknown>;
        if (this.isSingleProductionOrderLike(nested)) {
          return [nested];
        }
        if (Array.isArray(nested['data'])) {
          return nested['data'] as unknown[];
        }
        if (Array.isArray(nested['value'])) {
          return nested['value'] as unknown[];
        }
        if (nested['value'] && typeof nested['value'] === 'object' && !Array.isArray(nested['value'])) {
          const nestedValue = nested['value'] as Record<string, unknown>;
          if (this.isSingleProductionOrderLike(nestedValue)) {
            return [nestedValue];
          }
        }
      }
    }

    return [];
  }

  private isSingleProductionOrderLike(source: Record<string, unknown>): boolean {
    if (!source || typeof source !== 'object') {
      return false;
    }

    const keys = Object.keys(source).map((key) => key.toLowerCase());
    return keys.some((key) =>
      [
        'docentry',
        'docnum',
        'cardcode',
        'itemcode',
        'prodname',
        'plannedqty',
        'postdate',
        'docdate',
        'duedate',
        'itemname',
        'cardname',
      ].includes(key),
    );
  }

  private pickArray(source: Record<string, unknown>, keys: string[]): unknown[] {
    for (const key of keys) {
      const value = source[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
    return [];
  }

  private cleanSapText(value: unknown): string {
    return String(value ?? '')
      .replace(/\u0000/g, '')
      .trim();
  }

  private pickString(source: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = source[key];
      if (value === undefined || value === null) {
        continue;
      }
      const text = this.cleanSapText(value);
      if (text !== '') {
        return text;
      }
    }
    return '';
  }

  private pickNumber(source: Record<string, unknown>, keys: string[]): number {
    for (const key of keys) {
      const value = source[key];
      if (value === undefined || value === null) {
        continue;
      }
      const text = this.cleanSapText(value);
      if (text === '') {
        continue;
      }
      const parsed = Number(text);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return 0;
  }

  private pickDate(source: Record<string, unknown>, keys: string[]): string {
    const raw = this.pickString(source, keys);
    const match = raw.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
}
