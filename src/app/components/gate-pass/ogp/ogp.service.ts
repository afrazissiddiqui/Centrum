import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';
import { apiUrl } from '../../../config/api.config';
import { AuthService } from '../../../services/auth.service';
import { filterRecordsBySessionBranches } from '../../../utils/branch-filter.util';
import { resolveGatePassLocation } from '../gate-pass-location.options';

export interface OgpLineItem {
  itemCode: string;
  itemName: string;
  serialNumbers: string;
  category: string;
  packingCondition: string;
  productQuality: string;
  uom: string;
  qty: number;
  info: string;
  remarks: string;
  deleted: boolean;
}

export interface OgpLinePayload {
  itemCode: string;
  itemName: string;
  category: string;
  packingCondition: string;
  productQuality: string;
  uom: string;
  qty: number;
  info: string;
  remarks: string;
}

export interface OgpAddPayload {
  type: string;
  baseDocNo: string;
  documentDate: string;
  referenceNo: string;
  businessPartnerCode: string;
  businessPartnerName: string;
  vehicleNo: string;
  fromUnit: string;
  originalDeliveryDestination: string;
  kantaSlip: string;
  biltyNo: string;
  store: string;
  driverName: string;
  driverCnic: string;
  driverPhone: string;
  department: string;
  weight: string;
  location: string;
  employee: string;
  remarks: string;
  lines: OgpLinePayload[];
  totalQty: number;
}

export interface OgpApiResponse {
  status?: boolean;
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

export interface OgpRecord {
  Id: number;
  referenceNo: string;
  title: string;
  department: string;
  status: string;
  submittedDate: string;
  remarks?: string;
  selected?: boolean;
  type: string;
  businessPartnerCode: string;
  baseDocNo: string;
  businessPartnerName: string;
  vehicleNo: string;
  fromUnit: string;
  originalDeliveryDestination: string;
  kantaSlip: string;
  biltyNo: string;
  store: string;
  driverName: string;
  driverCnic: string;
  driverPhone: string;
  weight: string;
  location: string;
  employee: string;
  lines: OgpLineItem[];
  totalQty: number;
}

const OUTWARD_GATE_PASS_LIST_URL = apiUrl('outward-gate-pass-list');
const OUTWARD_GATE_PASS_ADD_URL = apiUrl('outward-gate-pass-add');
const OUTWARD_GATE_PASS_DETAIL_URL = apiUrl('outward-gate-pass-detail');
const OUTWARD_GATE_PASS_UPDATE_URL = apiUrl('outward-gate-pass-update');
const OUTWARD_GATE_PASS_DELETE_URL = apiUrl('outward-gate-pass-delete');

function emptyLine(): OgpLineItem {
  return {
    itemCode: '',
    itemName: '',
    serialNumbers: '',
    category: '',
    packingCondition: '',
    productQuality: '',
    uom: '',
    qty: 0,
    info: '',
    remarks: '',
    deleted: false,
  };
}

export function createEmptyOgpLines(count: number): OgpLineItem[] {
  return Array.from({ length: count }, () => emptyLine());
}

export function createEmptyOgpLineItem(): OgpLineItem {
  return emptyLine();
}

@Injectable({
  providedIn: 'root',
})
export class OgpService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly ogpList = signal<OgpRecord[]>([]);

  readonly records = this.ogpList.asReadonly();

  fetchOutwardGatePasses(): Observable<OgpRecord[]> {
    return this.http.get<unknown>(OUTWARD_GATE_PASS_LIST_URL).pipe(
      map((response) => this.extractApiItems(response).map((item) => this.mapApiItemToRecord(item))),
      map((records) => filterRecordsBySessionBranches(records, (record) => record.location, this.authService.getSessionUser())),
      tap((records) => this.ogpList.set(records)),
    );
  }

  fetchOutwardGatePassDetail(id: string | number): Observable<OgpRecord> {
    const identifier = encodeURIComponent(String(id));
    const numericId = Number.parseInt(String(id), 10) || 0;
    const cached = this.ogpList().find((record) => record.Id === numericId);

    return this.http.get<unknown>(`${OUTWARD_GATE_PASS_DETAIL_URL}/${identifier}`).pipe(
      map((response) => {
        const record = this.mapDetailResponse(response);
        if (!record.Id && numericId) {
          return { ...record, Id: numericId };
        }
        return record;
      }),
      map((record) => {
        if (!cached) {
          return record;
        }

        const merged = { ...cached, ...record };
        for (const key of Object.keys(cached) as Array<keyof OgpRecord>) {
          const detailValue = record[key];
          if (
            (typeof detailValue === 'string' && (!detailValue.trim() || detailValue === '—')) ||
            (key === 'lines' && !record.lines.length)
          ) {
            merged[key] = cached[key] as never;
          }
        }
        return merged;
      }),
      catchError((primaryError: unknown) =>
        cached ? of(cached) : throwError(() => primaryError),
      ),
    );
  }

  findCachedRecord(id: string | number): OgpRecord | undefined {
    const numericId = Number.parseInt(String(id), 10) || 0;
    return this.ogpList().find((record) => record.Id === numericId);
  }

  addOutwardGatePass(payload: OgpAddPayload): Observable<OgpApiResponse> {
    return this.http.post<OgpApiResponse>(OUTWARD_GATE_PASS_ADD_URL, payload);
  }

  updateOutwardGatePass(id: string | number, payload: OgpAddPayload): Observable<OgpApiResponse> {
    const identifier = encodeURIComponent(String(id));
    return this.http.post<OgpApiResponse>(`${OUTWARD_GATE_PASS_UPDATE_URL}/${identifier}`, payload);
  }

  deleteOutwardGatePass(id: string | number): Observable<OgpApiResponse> {
    const identifier = encodeURIComponent(String(id));
    return this.http.delete<OgpApiResponse>(`${OUTWARD_GATE_PASS_DELETE_URL}/${identifier}`);
  }

  removeOgpRecord(record: OgpRecord): void {
    this.ogpList.update((list) => list.filter((item) => item.Id !== record.Id));
  }

  private mapDetailResponse(response: unknown): OgpRecord {
    const items = this.extractApiItems(response);
    if (items.length > 0) {
      return this.mapApiItemToRecord(items[0]);
    }

    if (response && typeof response === 'object') {
      return this.mapApiItemToRecord(response as Record<string, unknown>);
    }

    throw new Error('Outward gate pass record not found');
  }

  private extractApiItems(response: unknown): Array<Record<string, unknown>> {
    if (!response) {
      return [];
    }

    if (Array.isArray(response)) {
      return response.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }

    if (typeof response !== 'object') {
      return [];
    }

    const obj = response as Record<string, unknown>;
    const arrayKeys = [
      'data',
      'Data',
      'items',
      'Items',
      'results',
      'records',
      'list',
      'List',
      'outward_gate_passes',
      'outward_gate_pass_list',
      'outwardGatePasses',
      'outwardGatePassList',
      'ogpList',
      'ogps',
    ];

    for (const key of arrayKeys) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
      }
      if (value && typeof value === 'object') {
        const nestedItems = this.extractApiItems(value);
        if (nestedItems.length > 0) {
          return nestedItems;
        }
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') {
        const nestedItems = this.extractApiItems(value);
        if (nestedItems.length > 0) {
          return nestedItems;
        }
      }
    }

    if (
      obj['referenceNo'] ||
      obj['reference_no'] ||
      obj['ReferenceNo'] ||
      obj['type'] ||
      obj['Type'] ||
      obj['baseDocNo'] ||
      obj['base_doc_no'] ||
      obj['BaseDocNo'] ||
      obj['businessPartnerName'] ||
      obj['business_partner_name'] ||
      obj['BusinessPartnerName'] ||
      obj['id'] ||
      obj['Id'] ||
      obj['ogp_id'] ||
      obj['outward_gate_pass_id']
    ) {
      return [obj];
    }

    return [];
  }

  private pickString(sources: Array<Record<string, unknown>>, keys: string[]): string {
    for (const source of sources) {
      for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          return String(value).trim();
        }
      }
    }
    return '';
  }

  private pickNumber(sources: Array<Record<string, unknown>>, keys: string[]): number {
    const text = this.pickString(sources, keys);
    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private pickLocation(sources: Array<Record<string, unknown>>): string {
    const rawValues = [
      this.pickString(sources, ['location', 'Location']),
      this.pickString(sources, [
        'branchName',
        'branch_name',
        'BranchName',
        'branch',
        'Branch',
        'branchLocation',
        'branch_location',
        'BranchLocation',
        'BPLName',
        'BPLNAME',
        'bplName',
        'branchNameText',
        'BranchNameText',
      ]),
      this.pickString(sources, ['BPLId', 'BPLID', 'bplId', 'branchId', 'branch_id']),
    ];
    let fallback = '';

    for (const rawValue of rawValues) {
      if (!rawValue) {
        continue;
      }

      if (rawValue === '0') {
        return 'DHA';
      }

      fallback ||= rawValue;

      const resolved = resolveGatePassLocation(rawValue);
      if (resolved) {
        return resolved;
      }
    }

    return fallback;
  }

  private mapLineItem(raw: Record<string, unknown>): OgpLineItem {
    return {
      itemCode: this.pickString([raw], ['itemCode', 'item_code', 'ItemCode', 'ItemCodeNo']),
      itemName: this.pickString([raw], ['itemName', 'item_name', 'ItemName', 'ItemDescription']),
      serialNumbers: this.pickString([raw], ['serialNumbers', 'serial_numbers', 'batchNo', 'batch_no', 'BatchNo', 'serialNo', 'SerialNo']),
      category: this.pickString([raw], ['category', 'Category', 'itemCategory', 'ItemCategory']),
      packingCondition: this.pickString([raw], ['packingCondition', 'packing_condition', 'PackingCondition', 'Packing']),
      productQuality: this.pickString([raw], ['productQuality', 'product_quality', 'ProductQuality', 'Quality']),
      uom: this.pickString([raw], ['uom', 'UOM', 'Uom']),
      qty: this.pickNumber([raw], ['qty', 'quantity', 'Qty', 'quantityValue']),
      info: this.pickString([raw], ['info', 'Info', 'lineInfo', 'LineInfo', 'description', 'Description']),
      remarks: this.pickString([raw], ['remarks', 'Remarks', 'remark', 'Remark', 'notes', 'Notes', 'comment', 'Comment']),
      deleted: Boolean(raw['deleted'] ?? raw['Deleted'] ?? raw['isDeleted']),
    };
  }

  private mapLines(item: Record<string, unknown>): OgpLineItem[] {
    const rawLines = item['lines'] ?? item['Lines'] ?? item['lineItems'] ?? item['line_items'] ?? item['items'] ?? item['Items'];
    if (!Array.isArray(rawLines)) {
      return [];
    }

    return rawLines
      .filter((line): line is Record<string, unknown> => !!line && typeof line === 'object')
      .map((line) => this.mapLineItem(line));
  }

  private mapApiItemToRecord(item: Record<string, unknown>): OgpRecord {
    const sources = [item];
    const id = this.pickString([item], ['id', 'Id', 'ogp_id', 'outward_gate_pass_id']);

    const businessPartnerName =
      this.pickString(sources, ['businessPartnerName', 'business_partner_name', 'BusinessPartnerName']) || '—';
    const mappedType = this.pickString(sources, ['type', 'Type']);
    const lines = this.mapLines(item);
    const totalQty =
      this.pickNumber(sources, ['totalQty', 'total_qty', 'TotalQty']) ||
      lines.reduce((sum, line) => sum + (Number.isFinite(line.qty) ? line.qty : 0), 0);

    return {
      Id: Number.parseInt(id, 10) || 0,
      referenceNo: this.pickString(sources, ['referenceNo', 'reference_no', 'ReferenceNo']) || '—',
      title: businessPartnerName,
      department: this.pickString(sources, ['department', 'Department']) || '—',
      status: this.pickString(sources, ['status', 'Status']) || '—',
      submittedDate:
        this.pickString(sources, ['documentDate', 'document_date', 'submittedDate', 'submitted_date']) || '—',
      remarks: this.pickString(sources, ['remarks', 'Remarks']) || undefined,
      selected: false,
      type: !mappedType || mappedType.toLowerCase() === 'null' ? 'Delivery' : mappedType,
      businessPartnerCode:
        this.pickString(sources, ['businessPartnerCode', 'business_partner_code', 'BusinessPartnerCode']) || '—',
      baseDocNo: this.pickString(sources, ['baseDocNo', 'base_doc_no', 'BaseDocNo']) || '—',
      businessPartnerName,
      vehicleNo: this.pickString(sources, ['vehicleNo', 'vehicle_no', 'VehicleNo']) || '—',
      fromUnit: this.pickString(sources, ['fromUnit', 'from_unit', 'FromUnit']) || '—',
      originalDeliveryDestination:
        this.pickString(sources, [
          'originalDeliveryDestination',
          'original_delivery_destination',
          'OriginalDeliveryDestination',
        ]) || '—',
      kantaSlip: this.pickString(sources, ['kantaSlip', 'kanta_slip', 'KantaSlip']) || '—',
      biltyNo: this.pickString(sources, ['biltyNo', 'bilty_no', 'BiltyNo']) || '—',
      store: this.pickString(sources, ['store', 'Store']) || '—',
      driverName:
        this.pickString(sources, [
          'driverName',
          'driver_name',
          'DriverName',
          'transporterName',
          'transporter_name',
        ]) || '—',
      driverCnic:
        this.pickString(sources, [
          'driverCnic',
          'driver_cnic',
          'DriverCnic',
          'transporterCnic',
          'transporter_cnic',
        ]) || '—',
      driverPhone:
        this.pickString(sources, [
          'driverPhone',
          'driver_phone',
          'DriverPhone',
          'transporterPhone',
          'transporter_phone',
        ]) || '—',
      weight: this.pickString(sources, ['weight', 'Weight']) || '—',
      location: this.pickLocation(sources) || '—',
      employee: this.pickString(sources, ['employee', 'Employee']) || '—',
      lines,
      totalQty,
    };
  }
}
