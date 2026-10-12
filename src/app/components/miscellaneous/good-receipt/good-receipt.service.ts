import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map } from 'rxjs';
import { apiUrl } from '../../../config/api.config';
import { GoodReceiptHeader, GoodReceiptLine } from './good-receipt.model';
import { extractBatchNumber } from '../batch-number.util';

export interface InventoryAccountOption {
  code: string;
  name?: string;
}

export interface CreateGoodReceiptItemPayload {
  itemCode: string;
  quantity: number;
  warehouse: string;
  unitPrice: number;
  batchNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  AcctCode?: string;
}

export interface CreateGoodReceiptPayload {
  docEntry?: string | number;
  branch: number;
  docDate: string;
  taxDate: string;
  docDueDate: string;
  remarks: string;
  items: CreateGoodReceiptItemPayload[];
}

export interface CreateGoodReceiptResponse {
  status?: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  error_code?: string | number;
  docEntry?: string | number;
  data?: Record<string, unknown>;
}

export interface GoodReceiptListLineItem {
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

export interface GoodReceiptListItem {
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
  items: GoodReceiptListLineItem[];
  itemCount: number;
}

export function buildCreateGoodReceiptPayload(
  header: GoodReceiptHeader,
  lines: GoodReceiptLine[],
): CreateGoodReceiptPayload {
  const validLines = lines.filter((line) => line.itemCode.trim());
  const branch = Number.parseInt(header.branchId.trim(), 10);

  return {
    branch: Number.isFinite(branch) ? branch : 0,
    docDate: header.documentDate.trim(),
    taxDate: header.postingDate.trim(),
    docDueDate: header.dueDate.trim(),
    remarks: header.remarks.trim(),
    items: validLines.map((line) => ({
      itemCode: line.itemCode.trim(),
      quantity: line.quantity ?? 0,
      warehouse: line.warehouse.trim(),
      unitPrice: line.itemCost ?? 0,
      batchNumber: line.batchNumber.trim(),
      manufacturingDate: line.manufacturingDate.trim(),
      expiryDate: line.expiryDate.trim(),
      AcctCode: line.accountCode.trim(),
    })),
  };
}

@Injectable({
  providedIn: 'root',
})
export class GoodReceiptService {
  private readonly http = inject(HttpClient);

  listGoodsReceipts(): Observable<GoodReceiptListItem[]> {
    return this.http.get<unknown>(apiUrl('get_goods_receipt')).pipe(
      map((response) =>
        this.parseGoodReceipts(response, [
          'goods_receipt',
          'good_receipt',
          'get_goods_receipt',
          'delivery',
        ]),
      ),
    );
  }

  create(payload: CreateGoodReceiptPayload): Observable<CreateGoodReceiptResponse> {
    return this.http.post<CreateGoodReceiptResponse>(apiUrl('createGoodsReceipt'), payload);
  }

  listInventoryAccounts(
    branch: string,
    docDate: string,
    taxDate: string,
    docDueDate: string,
  ): Observable<InventoryAccountOption[]> {
    const payload = {
      branch: Number.parseInt(branch, 10) || 0,
      docDate: docDate.trim(),
      taxDate: taxDate.trim(),
      docDueDate: docDueDate.trim(),
      remarks: 'Goods Receipt',
      items: [],
    };

    return this.http.get<unknown>(apiUrl('inventory_accounts')).pipe(
      map((response) => this.parseInventoryAccounts(response)),
      catchError(() =>
        this.http.post<unknown>(apiUrl('inventory_accounts'), payload).pipe(
          map((response) => this.parseInventoryAccounts(response)),
        ),
      ),
    );
  }

  private parseGoodReceipts(
    response: unknown,
    wrapperKeys: string[],
  ): GoodReceiptListItem[] {
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
              batchNumber: extractBatchNumber(line),
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
          branch: this.pickString(item, ['BPLName', 'branchName', 'Branch', 'branch', 'BPLId']),
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

  private parseInventoryAccounts(response: unknown): InventoryAccountOption[] {
    const collected: InventoryAccountOption[] = [];
    this.collectInventoryAccounts(response, collected);
    const unique = new Map<string, InventoryAccountOption>();
    for (const account of collected) {
      const code = account.code.trim();
      if (code && !unique.has(code)) {
        unique.set(code, { ...account, code });
      }
    }
    return [...unique.values()];
  }

  private collectInventoryAccounts(value: unknown, collected: InventoryAccountOption[]): void {
    if (Array.isArray(value)) {
      value.forEach((item) => this.collectInventoryAccounts(item, collected));
      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    const record = value as Record<string, unknown>;
    const option = this.normalizeInventoryAccountOption(record);
    if (option.length > 0) {
      collected.push(...option);
      return;
    }

    for (const nestedValue of Object.values(record)) {
      if (nestedValue !== null && nestedValue !== undefined) {
        this.collectInventoryAccounts(nestedValue, collected);
      }
    }
  }

  private normalizeInventoryAccountOption(item: unknown): InventoryAccountOption[] {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      return trimmed ? [{ code: trimmed, name: trimmed }] : [];
    }

    if (!item || typeof item !== 'object') {
      return [];
    }

    const record = item as Record<string, unknown>;
    const code = this.pickString(record, [
      'AcctCode',
      'AccountCode',
      'Code',
      'code',
      'accountCode',
      'value',
      'id',
    ]);

    if (!code) {
      return [];
    }

    const name = this.pickString(record, [
      'Name',
      'name',
      'Description',
      'description',
      'AccountName',
      'accountName',
    ]);

    return [{ code, name: name || code }];
  }

  private extractDataArray(response: unknown, wrapperKeys: string[]): unknown[] {
    if (Array.isArray(response)) {
      return response;
    }
    if (!response || typeof response !== 'object') {
      return [];
    }

    const root = response as Record<string, unknown>;
    for (const key of wrapperKeys) {
      const wrapper = root[key];
      if (Array.isArray(wrapper)) {
        return wrapper;
      }
      if (wrapper && typeof wrapper === 'object') {
        const nested = wrapper as Record<string, unknown>;
        if (Array.isArray(nested['data'])) {
          return nested['data'] as unknown[];
        }
      }
    }

    if (Array.isArray(root['data'])) {
      return root['data'] as unknown[];
    }

    return [];
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
      const parsed = Number(this.cleanSapText(value));
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
