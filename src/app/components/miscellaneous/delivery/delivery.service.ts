import { Injectable, inject } from '@angular/core';
import { resolveBranchNameFromBplId } from '../../../utils/branch-name.util';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { apiUrl } from '../../../config/api.config';
import { DeliveryAddress, DeliveryHeader, DeliveryLine } from './delivery.model';

export interface CreateDeliveryBatchPayload {
  batchNumber: string;
  quantity: number;
  U_LegacyBatch: string;
}

export interface CreateDeliveryItemPayload {
  baseEntry: number;
  baseLine: number;
  itemCode: string;
  warehouse: string;
  quantity: number;
  U_QtyPerJC: number | null;
  U_NoJC: number | null;
  discountPercent?: number;
  batches: CreateDeliveryBatchPayload[];
}

export interface CreateDeliveryPayload {
  cardCode: string;
  branch: number;
  docDate: string;
  taxDate: string;
  docDueDate: string;
  remarks: string;
  U_BuiltyNo?: string;
  U_DriverNo?: string;
  U_DriverName?: string;
  U_VehicleNo?: string;
  U_TransporterName?: string;
  U_IGP_DATE_CUS?: string;
  shipToAddresses: DeliveryAddress[];
  items: CreateDeliveryItemPayload[];
}

export interface CreateDeliveryResponse {
  status?: boolean;
  success?: boolean;
  message?: string;
  error?: string;
  docEntry?: string | number;
  data?: Record<string, unknown>;
}

export interface DeliveryVendor {
  code: string;
  name: string;
}

export interface DeliveryListLineItem {
  lineNum: string;
  itemCode: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  warehouse: string;
  lineTotal: number;
  batchNumbers: string[];
}

export interface DeliveryListItem {
  docEntry: string;
  docNum: string;
  docDate: string;
  docDueDate: string;
  cardCode: string;
  cardName: string;
  shipToAddress: string;
  customerPoNo: string;
  driverName: string;
  vehicleNo: string;
  transporterName: string;
  branch: string;
  seriesName: string;
  status: string;
  itemCount: number;
  items: DeliveryListLineItem[];
}

export function buildCreateDeliveryPayload(
  header: DeliveryHeader,
  lines: DeliveryLine[],
): CreateDeliveryPayload {
  const baseDocEntry = Number.parseInt(header.baseSalesOrderDocEntry.trim(), 10);
  const branch = Number.parseInt(header.branchId.trim(), 10);

  return {
    cardCode: header.customer.trim(),
    branch: Number.isFinite(branch) ? branch : 0,
    docDate: header.documentDate.trim(),
    taxDate: header.postingDate.trim(),
    docDueDate: header.documentDate.trim(),
    remarks: header.remarks.trim(),
    U_BuiltyNo: header.builtyNo.trim() || undefined,
    U_DriverNo: header.driverNo.trim() || undefined,
    U_DriverName: header.driverName.trim() || undefined,
    U_VehicleNo: header.vehicleNo.trim() || undefined,
    U_TransporterName: header.transporterName.trim() || undefined,
    U_IGP_DATE_CUS: header.igpDateCus.trim() || undefined,
    shipToAddresses: header.shipToAddresses.map((address) => ({
      address: address.address.trim(),
      street: address.street?.trim() || null,
      streetNo: address.streetNo?.trim() || null,
      block: address.block?.trim() || null,
      building: address.building?.trim() || null,
      city: address.city?.trim() || null,
      zipCode: address.zipCode?.trim() || null,
      state: address.state?.trim() || null,
      country: address.country?.trim() || null,
    })),
    items: lines
      .filter((line) => line.itemCode.trim())
      .map((line) => {
        const lineBaseDocEntry = Number.parseInt(line.baseDocEntry.trim(), 10);
        const baseLine = Number.parseInt(line.baseLine.trim(), 10);
        const resolvedBaseEntry = Number.isFinite(lineBaseDocEntry)
          ? lineBaseDocEntry
          : Number.isFinite(baseDocEntry)
            ? baseDocEntry
            : 0;
        const resolvedBaseLine = Number.isFinite(baseLine) ? baseLine : 0;

        const selectedBatches = (line.availableBatches ?? [])
          .filter((batch) => (batch.issueQuantity ?? 0) > 0)
          .map((batch) => ({
            batchNumber: batch.batchNo.trim(),
            quantity: batch.issueQuantity ?? 0,
            U_LegacyBatch: batch.legacyBatch?.trim() ?? '',
          }))
          .filter((batch) => batch.batchNumber && batch.quantity > 0);

        const fallbackBatches = line.batchSerialNumber.trim()
          ? [
              {
                batchNumber: line.batchSerialNumber.trim(),
                quantity: line.quantity ?? 0,
                U_LegacyBatch: '',
              },
            ]
          : [];

        return {
          baseEntry: resolvedBaseEntry,
          baseLine: resolvedBaseLine,
          itemCode: line.itemCode.trim(),
          warehouse: line.warehouse.trim(),
          quantity: line.quantity ?? 0,
          U_QtyPerJC: line.qtyPerJumboCarton,
          U_NoJC: line.jumboCartonsCount,
          discountPercent: Math.max(0, Math.min(100, line.discountPercent ?? 0)),
          batches: selectedBatches.length > 0 ? selectedBatches : fallbackBatches,
        };
      }),
  };
}

@Injectable({ providedIn: 'root' })
export class DeliveryService {
  private readonly http = inject(HttpClient);

  getDeliveryVendors(): Observable<DeliveryVendor[]> {
    return this.http.get<unknown>(apiUrl('getDeliveryVendors')).pipe(
      map((response) => this.parseDeliveryVendors(response)),
    );
  }

  list(): Observable<DeliveryListItem[]> {
    return this.http.get<unknown>(apiUrl('delivery')).pipe(
      map((response) => this.parseDeliveries(response)),
    );
  }

  create(payload: CreateDeliveryPayload): Observable<CreateDeliveryResponse> {
    return this.http.post<CreateDeliveryResponse>(apiUrl('createDelivery'), payload);
  }

  private parseDeliveryVendors(response: unknown): DeliveryVendor[] {
    const records = this.extractDataArray(response, ['deliveryVendors', 'delivery_vendors', 'vendors', 'data']);
    return records
      .map((record) => {
        if (typeof record === 'string') {
          return { code: record.trim(), name: record.trim() };
        }

        if (!record || typeof record !== 'object' || Array.isArray(record)) {
          return null;
        }

        const source = record as Record<string, unknown>;
        const code = this.pickString(source, ['code', 'Code', 'vendorCode', 'VendorCode', 'CardCode']);
        const name = this.pickString(source, ['name', 'Name', 'vendorName', 'VendorName', 'CardName', 'description', 'Description']);
        return { code: code || name, name: name || code };
      })
      .filter((vendor): vendor is DeliveryVendor => !!vendor && !!vendor.name)
      .filter((vendor, index, vendors) => vendors.findIndex((item) => item.name.toLowerCase() === vendor.name.toLowerCase()) === index);
  }

  private parseDeliveries(response: unknown): DeliveryListItem[] {
    const data = this.extractDataArray(response, ['delivery', 'deliveries']);
    return data
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => {
        const lines = this.pickArray(item, ['items', 'lines', 'DocumentLines'])
          .filter((line): line is Record<string, unknown> => !!line && typeof line === 'object')
          .map((line) => {
            const rawBatches = this.pickArray(line, ['batches', 'BatchNumbers', 'batchNumbers']);
            const batchNumbersFromArray = rawBatches.flatMap((batch) => {
              if (typeof batch === 'string') {
                return [batch];
              }
              if (batch && typeof batch === 'object' && !Array.isArray(batch)) {
                return [this.pickString(batch as Record<string, unknown>, ['batchNumber', 'BatchNum', 'batch_number'])];
              }
              return [];
            });
            const batchNumberFromLine = this.pickString(line, ['batchNumber', 'BatchNum', 'batch_number']);

            return {
              lineNum: this.pickString(line, ['LineNum', 'lineNum']),
              itemCode: this.pickString(line, ['ItemCode', 'itemCode']),
              itemDescription: this.pickString(line, ['Dscription', 'itemDescription', 'description']),
              quantity: this.pickNumber(line, ['Quantity', 'quantity']),
              unitPrice: this.pickNumber(line, ['Price', 'unitPrice', 'price']),
              warehouse: this.pickString(line, ['WhsCode', 'warehouse', 'warehouseCode']),
              lineTotal: this.pickNumber(line, ['LineTotal', 'lineTotal']),
              batchNumbers: [
                ...batchNumbersFromArray,
                ...(batchNumberFromLine ? [batchNumberFromLine] : []),
              ].map((batch) => batch.trim()).filter((batch) => batch !== ''),
            };
          });

        return {
          docEntry: this.pickString(item, ['DocEntry', 'docEntry']),
          docNum: this.pickString(item, ['DocNum', 'docNum', 'deliveryNo']),
          docDate: this.pickDate(item, ['DocDate', 'docDate']),
          docDueDate: this.pickDate(item, ['DocDueDate', 'docDueDate']),
          cardCode: this.pickString(item, ['CardCode', 'cardCode']),
          cardName: this.pickString(item, ['CardName', 'cardName', 'customerName']),
          shipToAddress: this.pickString(item, ['Address', 'ShipToAddress', 'shipToAddress']),
          customerPoNo: this.pickString(item, ['NumAtCard', 'U_CusPoNo', 'customerPoNo']),
          driverName: this.pickString(item, ['U_DriverName', 'driverName']),
          vehicleNo: this.pickString(item, ['U_VehicleNo', 'vehicleNo']),
          transporterName: this.pickString(item, ['U_TransporterName', 'transporterName']),
          branch: this.resolveDeliveryBranch(this.pickString(item, ['BPLName', 'Branch', 'branch', 'BPLId'])),
          seriesName: this.pickString(item, ['SeriesName', 'seriesName', 'Series']),
          status: this.normalizeDeliveryStatus(this.pickString(item, ['DocStatus', 'docStatus', 'status']) || 'O'),
          itemCount: lines.length,
          items: lines,
        };
      });
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
      if (typeof value === 'string' && value.trim() !== '') {
        return value.split(',').map((v) => v.trim()).filter((v) => v);
      }
    }
    return [];
  }

  private resolveDeliveryBranch(value: string): string {
    return resolveBranchNameFromBplId(value);
  }

  private normalizeDeliveryStatus(value: string): string {
    const normalized = value.trim().toUpperCase();
    if (normalized === 'O' || normalized === 'OPEN') {
      return 'O';
    }
    if (normalized === 'C' || normalized === 'CLOSED') {
      return 'C';
    }
    return normalized;
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

  private pickDate(source: Record<string, unknown>, keys: string[]): string {
    const raw = this.pickString(source, keys);
    const match = raw.match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
}
