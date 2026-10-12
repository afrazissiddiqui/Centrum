import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map } from 'rxjs';
import { apiUrl } from '../../../config/api.config';
import { GoodIssueHeader, GoodIssueLine } from './good-issue.model';
import { extractBatchNumber } from '../batch-number.util';

export interface InventoryAccountOption {
  code: string;
  name?: string;
}

export interface CreateGoodIssueItemPayload {
  itemCode: string;
  warehouse: string;
  quantity: number;
  batches: CreateGoodIssueBatchPayload[];
  binLocationAllocation?: string;
  AcctCode?: string;
  itemCost?: number;
  uomCode?: string;
  uomName?: string;
  departmentsLocations?: string;
  branch?: string;
}

export interface CreateGoodIssueBatchPayload {
  batchNumber: string;
  quantity: number;
  U_LegacyBatch: string;
}

export interface CreateGoodIssuePayload {
  branch: number;
  docDate: string;
  taxDate: string;
  docDueDate: string;
  issuedFrom: string;
  issuedTo: string;
  remarks: string;
  items: CreateGoodIssueItemPayload[];
}

export interface CreateGoodIssueResponse {
  status?: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  error_code?: number;
  docEntry?: string | number;
  data?: Record<string, unknown>;
}

export interface GoodIssueListLineItem {
  lineNum: string;
  itemCode: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  warehouse: string;
  lineTotal: number;
  batchNumber: string;
}

export interface GoodIssueListItem {
  docEntry: string;
  docNum: string;
  docDate: string;
  docDueDate: string;
  taxDate: string;
  seriesName: string;
  branch: string;
  fromWarehouse: string;
  issuedTo: string;
  remarks: string;
  status: string;
  items: GoodIssueListLineItem[];
  itemCount: number;
}

export function buildCreateGoodIssuePayload(
  header: GoodIssueHeader,
  lines: GoodIssueLine[],
): CreateGoodIssuePayload {
  const branch = Number.parseInt(header.branchId.trim(), 10);

  return {
    branch: Number.isFinite(branch) ? branch : 0,
    docDate: header.docDate.trim(),
    taxDate: header.taxDate.trim(),
    docDueDate: header.docDueDate.trim(),
    issuedFrom: header.issuedFrom.trim(),
    issuedTo: header.issuedTo.trim(),
    remarks: header.remarks.trim(),
    items: lines
      .filter((line) => line.itemCode.trim())
      .map((line) => ({
        itemCode: line.itemCode.trim(),
        warehouse: line.warehouse.trim(),
        quantity: line.quantity ?? 0,
        batches: (line.availableBatches ?? [])
          .filter((batch) => (batch.issueQuantity ?? 0) > 0)
          .map((batch) => ({
            batchNumber: batch.batchNo.trim(),
            quantity: batch.issueQuantity ?? 0,
            U_LegacyBatch: batch.legacyBatch?.trim() ?? '',
          })),
        binLocationAllocation: line.binLocationAllocation.trim(),
        AcctCode: line.accountCode.trim(),
        itemCost: line.itemCost ?? 0,
        uomCode: line.uomCode.trim(),
        uomName: line.uomName.trim(),
        departmentsLocations: line.departmentsLocations.trim(),
        branch: line.branch.trim(),
      }))
      .map((item, index) => {
        const line = lines.filter((currentLine) => currentLine.itemCode.trim())[index];
        if (item.batches.length > 0 || !line.batchSerialNumber.trim()) {
          return item;
        }
        return {
          ...item,
          batches: [{
            batchNumber: line.batchSerialNumber.trim(),
            quantity: line.quantity ?? 0,
            U_LegacyBatch: '',
          }],
        };
      }),
  };
}

@Injectable({
  providedIn: 'root',
})
export class GoodIssueService {
  private readonly http = inject(HttpClient);

  list(): Observable<GoodIssueListItem[]> {
    return this.http.get<unknown>(apiUrl('get_goods_issue')).pipe(
      map((response) => this.parseGoodIssues(response)),
    );
  }

  create(payload: CreateGoodIssuePayload): Observable<CreateGoodIssueResponse> {
    return this.http.post<CreateGoodIssueResponse>(apiUrl('createGoodsIssue'), payload);
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
      remarks: 'Goods Issue',
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

  private normalizeInventoryAccountOption(item: Record<string, unknown>): InventoryAccountOption[] {
    const code = this.pickString(item, ['AcctCode', 'AccountCode', 'Code', 'code', 'accountCode', 'value', 'id']);
    if (!code) {
      return [];
    }

    const name = this.pickString(item, ['Name', 'name', 'Description', 'description', 'AccountName', 'accountName']);
    return [{ code, name: name || code }];
  }

  private parseGoodIssues(response: unknown): GoodIssueListItem[] {
    const data = this.extractDataArray(response, ['goods_issue', 'good_issue', 'get_goods_issue', 'data']);
    return data
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => {
        const lines = this.pickArray(item, ['items', 'lines', 'DocumentLines'])
          .filter((line): line is Record<string, unknown> => !!line && typeof line === 'object')
          .map((line) => {
            return {
              lineNum: this.pickString(line, ['LineNum', 'lineNum']),
              itemCode: this.pickString(line, ['ItemCode', 'itemCode']),
              itemDescription: this.pickString(line, ['Dscription', 'itemDescription', 'description']),
              quantity: this.pickNumber(line, ['Quantity', 'quantity']),
              unitPrice: this.pickNumber(line, ['Price', 'unitPrice', 'price']),
              warehouse: this.pickString(line, ['WhsCode', 'warehouse', 'FromWhsCod', 'fromWarehouse']),
              lineTotal: this.pickNumber(line, ['LineTotal', 'lineTotal']),
              batchNumber: extractBatchNumber(line),
            };
          });

        const firstLine = lines[0] ?? null;
        return {
          docEntry: this.pickString(item, ['DocEntry', 'docEntry']),
          docNum: this.pickString(item, ['DocNum', 'docNum', 'issueNo']),
          docDate: this.pickDate(item, ['DocDate', 'docDate']),
          docDueDate: this.pickDate(item, ['DocDueDate', 'docDueDate']),
          taxDate: this.pickDate(item, ['TaxDate', 'taxDate']),
          seriesName: this.pickString(item, ['SeriesName', 'seriesName', 'Series']),
          branch: this.pickString(item, ['BPLName', 'branchName', 'Branch', 'branch', 'BPLId']),
          fromWarehouse:
            this.pickString(item, ['Filler', 'FromWhsCod', 'fromWarehouse', 'issuedFrom']) ||
            firstLine?.warehouse ||
            '',
          issuedTo: this.pickString(item, ['U_IssuedTo', 'issuedTo', 'IssuedTo']),
          remarks: this.pickString(item, ['Comments', 'Remarks', 'remarks']),
          status: this.pickString(item, ['DocStatus', 'status']) || 'O',
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
    for (const key of wrapperKeys) {
      const wrapper = root[key];
      if (Array.isArray(wrapper)) {
        return wrapper;
      }
      if (wrapper && typeof wrapper === 'object') {
        const wrappedData = (wrapper as Record<string, unknown>)['data'];
        if (Array.isArray(wrappedData)) {
          return wrappedData;
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

  private pickString(source: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
    return '';
  }

  private pickNumber(source: Record<string, unknown>, keys: string[]): number {
    for (const key of keys) {
      const value = source[key];
      const parsed = Number(value);
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
