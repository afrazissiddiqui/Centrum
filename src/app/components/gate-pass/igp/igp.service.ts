import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';
import { apiUrl } from '../../../config/api.config';
import { AuthService } from '../../../services/auth.service';
import { filterRecordsBySessionBranches } from '../../../utils/branch-filter.util';

export interface IgpLineItem {
  itemCode: string;
  itemName: string;
  serialNumbers: string;
  category: string;
  packingCondition: string;
  productQuality: string;
  uom: string;
  maximumQuantity: number | null;
  remainingQuantity: number | null;
  qty: number;
  quantity: number | null;
  info: string;
  remarks: string;
  deleted: boolean;
}

export interface IgpPayloadLineItem {
  itemCode: string;
  itemName: string;
  category: string;
  packingCondition: string;
  productQuality: string;
  uom: string;
  maximumQuantity: number | null;
  remainingQuantity: number | null;
  qty: number;
  quantity: number | null;
  info: string;
  remarks: string;
}

export interface IgpAddPayload {
  type: string;
  baseDocNo: string;
  poNumber: string;
  documentDate: string;
  date?: string;
  submittedDate?: string;
  referenceNo: string;
  businessPartnerCode: string;
  businessPartnerName: string;
  vehicleNo: string;
  fromUnit: string;
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
  lines: IgpPayloadLineItem[];
  totalQty: number;
}

export interface IgpApiResponse {
  status?: boolean;
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

export interface IgpRecord {
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
  poNumber: string;
  businessPartnerName: string;
  vehicleNo: string;
  fromUnit: string;
  kantaSlip: string;
  biltyNo: string;
  store: string;
  driverName: string;
  driverCnic: string;
  driverPhone: string;
  weight: string;
  location: string;
  employee: string;
  lines: IgpLineItem[];
  totalQty: number;
}

const INWARD_GATE_PASS_LIST_URL = apiUrl('inward-gate-pass-list');
const INWARD_GATE_PASS_ADD_URL = apiUrl('inward-gate-pass-add');
const IGP_DETAIL_URL = apiUrl('inward-gate-pass-detail');
const IGP_DETAIL_FALLBACK_URL = apiUrl('outward-gate-pass-detail');
const INWARD_GATE_PASS_UPDATE_URL = apiUrl('inward-gate-pass-update');
const INWARD_GATE_PASS_DELETE_URL = apiUrl('inward-gate-pass-delete');

function emptyLine(): IgpLineItem {
  return {
    itemCode: '',
    itemName: '',
    serialNumbers: '',
    category: '',
    packingCondition: '',
    productQuality: '',
    uom: '',
    maximumQuantity: null,
    remainingQuantity: null,
    qty: 0,
    quantity: null,
    info: '',
    remarks: '',
    deleted: false,
  };
}

export function createEmptyIgpLines(count: number): IgpLineItem[] {
  return Array.from({ length: count }, () => emptyLine());
}

export function createEmptyIgpLineItem(): IgpLineItem {
  return emptyLine();
}

@Injectable({
  providedIn: 'root',
})
export class IgpService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly igpList = signal<IgpRecord[]>([]);

  readonly records = this.igpList.asReadonly();

  fetchInwardGatePasses(): Observable<IgpRecord[]> {
    return this.http.get<unknown>(INWARD_GATE_PASS_LIST_URL).pipe(
      map((response) => this.extractApiItems(response).map((item) => this.mapApiItemToRecord(item))),
      map((records) =>
        filterRecordsBySessionBranches(records, (record) => record.location, this.authService.getSessionUser()),
      ),
      tap((records) => this.igpList.set(records)),
    );
  }

  fetchInwardGatePassDetail(id: string | number): Observable<IgpRecord> {
    const identifier = encodeURIComponent(String(id));
    const numericId = Number.parseInt(String(id), 10) || 0;
    const cached = this.igpList().find((record) => record.Id === numericId);

    const mapDetail = (response: unknown): IgpRecord => {
      const record = this.mapDetailResponse(response);
      if (!record.Id && numericId) {
        return { ...record, Id: numericId };
      }
      return record;
    };

    return this.http.get<unknown>(`${IGP_DETAIL_URL}/${identifier}`).pipe(
      map(mapDetail),
      catchError((primaryError: unknown) =>
        this.http.get<unknown>(`${IGP_DETAIL_FALLBACK_URL}/${identifier}`).pipe(
          map(mapDetail),
          catchError(() =>
            cached ? of(cached) : throwError(() => primaryError),
          ),
        ),
      ),
    );
  }

  addInwardGatePass(payload: IgpAddPayload): Observable<IgpApiResponse> {
    return this.http.post<IgpApiResponse>(INWARD_GATE_PASS_ADD_URL, payload);
  }

  updateInwardGatePass(id: string | number, payload: IgpAddPayload): Observable<IgpApiResponse> {
    const identifier = encodeURIComponent(String(id));
    return this.http.post<IgpApiResponse>(`${INWARD_GATE_PASS_UPDATE_URL}/${identifier}`, payload);
  }

  deleteInwardGatePass(id: string | number): Observable<IgpApiResponse> {
    const identifier = encodeURIComponent(String(id));
    return this.http.delete<IgpApiResponse>(`${INWARD_GATE_PASS_DELETE_URL}/${identifier}`);
  }

  removeIgpRecord(record: IgpRecord): void {
    this.igpList.update((list) => list.filter((item) => item.Id !== record.Id));
  }

  recordToPayload(record: IgpRecord): IgpAddPayload {
    return {
      type: record.type,
      baseDocNo: record.baseDocNo,
      poNumber: record.poNumber,
      documentDate: record.submittedDate,
      referenceNo: record.referenceNo,
      businessPartnerCode: record.businessPartnerCode,
      businessPartnerName: record.businessPartnerName,
      vehicleNo: record.vehicleNo,
      fromUnit: record.fromUnit,
      kantaSlip: record.kantaSlip,
      biltyNo: record.biltyNo,
      store: record.store,
      driverName: record.driverName,
      driverCnic: record.driverCnic,
      driverPhone: record.driverPhone,
      department: record.department,
      weight: record.weight,
      location: record.location,
      employee: record.employee,
      remarks: record.remarks ?? '',
      lines: record.lines.map((line) => ({ ...line, qty: Number(line.qty) || 0 })),
      totalQty: record.totalQty,
    };
  }

  private mapDetailResponse(response: unknown): IgpRecord {
    const items = this.extractApiItems(response);
    if (items.length > 0) {
      return this.mapApiItemToRecord(items[0]);
    }

    if (response && typeof response === 'object') {
      return this.mapApiItemToRecord(response as Record<string, unknown>);
    }

    throw new Error('Inward gate pass record not found');
  }

  private extractApiItems(response: unknown): Array<Record<string, unknown>> {
    if (!response) {
      return [];
    }

    if (Array.isArray(response)) {
      return response.filter((item): item is Record<string, unknown> => this.isLikelyIgpItem(item));
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
      'Results',
      'records',
      'Records',
      'rows',
      'Rows',
      'list',
      'List',
      'value',
      'Value',
      'response',
      'Response',
      'result',
      'Result',
      'payload',
      'Payload',
      'inward_gate_passes',
      'inward_gate_pass_list',
      'inwardGatePasses',
      'inwardGatePassList',
      'igpList',
      'igps',
    ];

    for (const key of arrayKeys) {
      const value = obj[key];
      if (Array.isArray(value)) {
        const items = value.filter((item): item is Record<string, unknown> => this.isLikelyIgpItem(item));
        if (items.length > 0) {
          return items;
        }
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

    if (this.isLikelyIgpItem(obj)) {
      return [obj];
    }

    return [];
  }

  private isLikelyIgpItem(item: unknown): item is Record<string, unknown> {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return false;
    }

    const record = item as Record<string, unknown>;
    return Boolean(
      record['referenceNo'] ||
        record['reference_no'] ||
        record['type'] ||
        record['baseDocNo'] ||
        record['base_doc_no'] ||
        record['businessPartnerName'] ||
        record['business_partner_name'] ||
        record['documentDate'] ||
        record['document_date'] ||
        record['id'] ||
        record['Id'] ||
        record['igp_id'] ||
        record['inward_gate_pass_id'],
    );
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null) {
      return {};
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return {};
      }
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return {};
      }
      return {};
    }
    if (Array.isArray(value)) {
      const first = value[0];
      return first && typeof first === 'object' ? (first as Record<string, unknown>) : {};
    }
    if (typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return {};
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

  private pickOptionalNumber(sources: Array<Record<string, unknown>>, keys: string[]): number | null {
    const text = this.pickString(sources, keys);
    if (!text) {
      return null;
    }

    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private mapLineItem(raw: Record<string, unknown>): IgpLineItem {
    return {
      itemCode: this.pickString([raw], ['itemCode', 'item_code', 'ItemCode', 'ItemCodeNo']),
      itemName: this.pickString([raw], ['itemName', 'item_name', 'ItemName', 'ItemDescription']),
      serialNumbers: this.pickString([raw], ['serialNumbers', 'serial_numbers', 'batchNo', 'batch_no', 'BatchNo', 'serialNo', 'SerialNo']),
      category: this.pickString([raw], ['category', 'Category', 'itemCategory', 'ItemCategory', 'lineCategory', 'LineCategory']),
      packingCondition: this.pickString([raw], ['packingCondition', 'packing_condition', 'PackingCondition', 'Packing']),
      productQuality: this.pickString([raw], ['productQuality', 'product_quality', 'ProductQuality', 'Quality']),
      uom: this.pickString([raw], ['uom', 'UOM', 'Uom', 'unitOfMeasure', 'UnitOfMeasure']),
      maximumQuantity: this.pickOptionalNumber([raw], [
        'maximumQuantity', 'maximum_quantity', 'MaximumQuantity', 'maxQuantity', 'max_quantity', 'MaxQuantity',
      ]),
      remainingQuantity: this.pickOptionalNumber([raw], [
        'remainingQuantity', 'remaining_quantity', 'RemainingQuantity', 'remainingQty', 'remaining_qty', 'RemainingQty',
      ]),
      qty: this.pickNumber([raw], ['qty', 'Qty', 'quantityValue']),
      quantity: this.pickOptionalNumber([raw], ['quantity', 'Quantity']),
      info: this.pickString([raw], ['info', 'Info', 'lineInfo', 'LineInfo', 'description', 'Description']),
      remarks: this.pickString([raw], ['remarks', 'Remarks', 'remark', 'Remark', 'notes', 'Notes', 'comment', 'Comment']),
      deleted: Boolean(raw['deleted'] ?? raw['Deleted'] ?? raw['isDeleted']),
    };
  }

  private mapLines(item: Record<string, unknown>): IgpLineItem[] {
    const rawLines = item['lines'] ?? item['Lines'] ?? item['lineItems'] ?? item['line_items'];
    if (!Array.isArray(rawLines)) {
      return [];
    }

    return rawLines
      .filter((line): line is Record<string, unknown> => !!line && typeof line === 'object')
      .map((line) => this.mapLineItem(line));
  }

  private mapApiItemToRecord(item: Record<string, unknown>): IgpRecord {
    const sources = [item];
    const id = this.pickString([item], ['id', 'Id', 'igp_id', 'inward_gate_pass_id']);

    const businessPartnerName =
      this.pickString(sources, ['businessPartnerName', 'business_partner_name', 'BusinessPartnerName']) || '—';
    const location = this.pickString(sources, [
      'location',
      'Location',
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
      'BPLId',
      'BPLID',
      'bplId',
      'branchId',
      'branch_id',
    ]);
    const lines = this.mapLines(item);
    const totalQty =
      this.pickNumber(sources, ['totalQty', 'total_qty', 'TotalQty']) ||
      lines.reduce((sum, line) => sum + (Number.isFinite(line.qty) ? line.qty : 0), 0);

    return {
      Id: Number.parseInt(id, 10) || 0,
      referenceNo: this.pickString(sources, ['referenceNo', 'reference_no', 'ReferenceNo']) || '—',
      title: businessPartnerName,
      department: this.pickString(sources, ['department', 'Department', 'DepartmentName']) || '—',
      status: this.pickString(sources, ['status', 'Status']) || '—',
      submittedDate:
        this.pickString(sources, [
          'date',
          'Date',
          'docDate',
          'doc_date',
          'documentDate',
          'document_date',
          'submittedDate',
          'submitted_date',
        ]) || '—',
      remarks: this.pickString(sources, ['remarks', 'Remarks', 'remarksText', 'remarksText']) || undefined,
      selected: false,
      type:
        this.pickString(sources, [
          'type',
          'Type',
          'igpType',
          'IGPType',
          'igp_type',
          'gatePassType',
          'GatePassType',
          'documentType',
          'DocumentType',
          'document_type',
          'docType',
          'DocType',
          'doc_type',
          'orderType',
          'OrderType',
          'type_name',
          'document_type_name',
          'pass_type',
        ]) ||
        '—',
      businessPartnerCode:
        this.pickString(sources, ['businessPartnerCode', 'business_partner_code', 'BusinessPartnerCode', 'bpCode', 'BPCode']) || '—',
      baseDocNo:
        this.pickString(sources, ['baseDocNo', 'base_doc_no', 'BaseDocNo', 'baseDoc', 'BaseDoc', 'baseDocumentNo', 'BaseDocumentNo']) ||
        '—',
      poNumber:
        this.pickString(sources, ['poNumber', 'po_number', 'PoNumber', 'poNo', 'po_no', 'PoNo', 'purchaseOrderNo', 'PurchaseOrderNo']) ||
        this.pickString(sources, ['baseDocNo', 'base_doc_no', 'BaseDocNo', 'baseDoc', 'BaseDoc', 'baseDocumentNo', 'BaseDocumentNo']) ||
        '—',
      businessPartnerName,
      vehicleNo:
        this.pickString(sources, ['vehicleNo', 'vehicle_no', 'VehicleNo', 'vehicleNumber', 'VehicleNumber']) || '—',
      fromUnit:
        this.pickString(sources, ['fromUnit', 'from_unit', 'FromUnit', 'fromLocation', 'from_location', 'FromUnitName']) || '—',
      kantaSlip:
        this.pickString(sources, ['kantaSlip', 'kanta_slip', 'KantaSlip', 'kantaSlipNo', 'kanta_slip_no', 'KantaSlipNo']) || '—',
      biltyNo: this.pickString(sources, ['biltyNo', 'bilty_no', 'BiltyNo', 'biltyNumber', 'BiltyNumber']) || '—',
      store: this.pickString(sources, ['store', 'Store', 'warehouse', 'Warehouse', 'warehouseCode', 'WarehouseCode']) || '—',
      driverName:
        this.pickString(sources, [
          'driverName',
          'driver_name',
          'DriverName',
          'transporterName',
          'transporter_name',
          'driverFullName',
          'DriverFullName',
        ]) || '—',
      driverCnic:
        this.pickString(sources, [
          'driverCnic',
          'driver_cnic',
          'DriverCnic',
          'driverCNIC',
          'DriverCNIC',
          'driverCnicNo',
          'DriverCnicNo',
          'transporterCnic',
          'transporter_cnic',
        ]) || '—',
      driverPhone:
        this.pickString(sources, [
          'driverPhone',
          'driver_phone',
          'DriverPhone',
          'driverPhoneNo',
          'DriverPhoneNo',
          'driverMobile',
          'DriverMobile',
          'transporterPhone',
          'transporter_phone',
        ]) || '—',
      weight: this.pickString(sources, ['weight', 'Weight', 'grossWeight', 'GrossWeight', 'weightKg', 'WeightKg']) || '—',
      location: location || '—',
      employee: this.pickString(sources, ['employee', 'Employee', 'employeeName', 'EmployeeName']) || '—',
      lines,
      totalQty,
    };
  }
}