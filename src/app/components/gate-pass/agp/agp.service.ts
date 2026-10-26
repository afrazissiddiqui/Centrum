import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { AGP_API_BASE_URL, apiUrl } from '../../../config/api.config';
import { AuthService } from '../../../services/auth.service';

export interface AgpLineItem {
  itemCode: string;
  itemName: string;
  /** SAP Item Master (OITM) linkage */
  oitmCode: string;
  serialNumbers: string;
  category: string;
  packingCondition: string;
  productQuality: string;
  uom: string;
  qtySent: number;
  qtyReceived: number;
  info: string;
  remarks: string;
  deleted: boolean;
}

export interface AgpLinePayload {
  oitmCode: string;
  itemCode: string;
  itemName: string;
  serialNumbers: string;
  category: string;
  packingCondition: string;
  productQuality: string;
  uom: string;
  qtySent: number;
  qtyReceived: number;
  info: string;
  remarks: string;
}

export interface AgpAddPayload {
  type: string;
  baseDocNo: string;
  documentDate: string;
  referenceNo: string;
  businessPartnerCode: string;
  businessPartnerName: string;
  vehicleNo: string;
  location: string;
  reasonForMovement: string;
  requestingEmployee: string;
  requestingDepartment: string;
  requestedBy: string;
  issuedTo: string;
  articleOutDate: string;
  articleReturnedDate: string | null;
  issueResolved: 'Yes' | 'No';
  transporterName: string;
  transporterCnic: string;
  transporterPhone: string;
  biltyNo: string;
  freightAmount: number;
  attachmentFileName: string;
  headOfSupplyChainApproval: boolean;
  remarks: string;
  lines: AgpLinePayload[];
  totalQtySent: number;
  totalQtyReceived: number;
}

export interface AgpApiResponse {
  status?: boolean;
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

export interface AgpRecord {
  Id: number;
  /** AGP NO */
  referenceNo: string;
  /** List / search label (typically business partner name) */
  title: string;
  requestingDepartment: string;
  status: string;
  /** Document date */
  submittedDate: string;
  remarks?: string;
  selected?: boolean;

  type: string;
  businessPartnerCode: string;
  baseDocNo: string;
  businessPartnerName: string;
  vehicleNo: string;

  reasonForMovement: string;
  natureOfItem: string;
  natureOfRepair: string;
  requestingEmployee: string;
  requestedBy: string;
  issuedTo: string;

  articleOutDate: string;
  articleReturnedDate: string;
  issueResolved: 'Yes' | 'No';
  returnStatus: 'Yes' | 'No';
  warrantyClaimable: 'Yes' | 'No';
  warrantyStartDate: string;
  warrantyDuration: string;
  warrantyExpiryDate: string;
  location: string;
  store: string;
  kantaSlip: string;
  driverName: string;
  driverCnic: string;
  driverPhone: string;
  biltyNo: string;
  weight: string;

  attachmentFileName?: string;
  headOfSupplyChainApproval: boolean;

  lines: AgpLineItem[];
  totalQtySent: number;
  totalQtyReceived: number;

  /** @deprecated Use requestingDepartment — kept for list/search compatibility */
  department?: string;
}

export interface AgpPagination {
  currentPage: number;
  lastPage: number;
  perPage: number;
  from: number | null;
  to: number | null;
  total: number;
}

const ARTICLE_GATE_PASS_LIST_URL = apiUrl('article-gate-pass-list', AGP_API_BASE_URL);
const ARTICLE_GATE_PASS_ADD_URL = apiUrl('article-gate-pass-add', AGP_API_BASE_URL);
const ARTICLE_GATE_PASS_DETAIL_URL = apiUrl('article-gate-pass-detail', AGP_API_BASE_URL);
const ARTICLE_GATE_PASS_UPDATE_URL = apiUrl('article-gate-pass-update', AGP_API_BASE_URL);
const ARTICLE_GATE_PASS_DELETE_URL = apiUrl('article-gate-pass-delete', AGP_API_BASE_URL);

function emptyLine(): AgpLineItem {
  return {
    itemCode: '',
    itemName: '',
    oitmCode: '',
    serialNumbers: '',
    category: '',
    packingCondition: '',
    productQuality: '',
    uom: '',
    qtySent: 0,
    qtyReceived: 0,
    info: '',
    remarks: '',
    deleted: false,
  };
}

function normalizeReturnStatus(status: string, returnDate: string): 'Yes' | 'No' {
  const normalized = status.trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(normalized)) {
    return 'Yes';
  }
  if (['no', 'n', 'false', '0'].includes(normalized)) {
    return 'No';
  }
  return returnDate.trim() && returnDate !== '—' ? 'Yes' : 'No';
}

export function createEmptyAgpLines(count: number): AgpLineItem[] {
  return Array.from({ length: count }, () => emptyLine());
}

/** One blank line for dynamic “Add line” on the create form. */
export function createEmptyAgpLineItem(): AgpLineItem {
  return emptyLine();
}

@Injectable({
  providedIn: 'root',
})
export class AgpService {
  private readonly http = inject(HttpClient);
  private readonly agpList = signal<AgpRecord[]>([]);

  readonly records = this.agpList.asReadonly();
  readonly pagination = signal<AgpPagination>({
    currentPage: 1,
    lastPage: 1,
    perPage: 15,
    from: null,
    to: null,
    total: 0,
  });

  fetchArticleGatePasses(page = 1, perPage = this.pagination().perPage): Observable<AgpRecord[]> {
    const params = new HttpParams()
      .set('page', page)
      .set('per_page', perPage);
    const requestedPerPage = perPage;

    return this.http.get<unknown>(ARTICLE_GATE_PASS_LIST_URL, { params }).pipe(
      map((response) => {
        const records = this.extractApiItems(response).map((item) => this.mapApiItemToRecord(item));
        this.pagination.set(this.extractPagination(response, records.length, page, requestedPerPage));
        return records;
      }),
      tap((records) => this.agpList.set(records)),
    );
  }

  fetchArticleGatePassDetail(id: string | number): Observable<AgpRecord> {
    const identifier = encodeURIComponent(String(id));
    const numericId = Number.parseInt(String(id), 10) || 0;
    const cached = this.agpList().find((record) => record.Id === numericId);

    return this.http.get<unknown>(`${ARTICLE_GATE_PASS_DETAIL_URL}/${identifier}`).pipe(
      map((response) => {
        const record = this.mapDetailResponse(response);
        if (!record.Id && numericId) {
          return { ...record, Id: numericId };
        }
        return record;
      }),
      map((record) => {
        if (record.lines.length > 0 || !cached?.lines.length) {
          return this.withCachedBaseDocumentNumber(record, cached);
        }
        return this.withCachedBaseDocumentNumber({ ...record, lines: cached.lines }, cached);
      }),
    );
  }

  private withCachedBaseDocumentNumber(record: AgpRecord, cached: AgpRecord | undefined): AgpRecord {
    if (record.baseDocNo !== '—' && record.baseDocNo.trim()) {
      return record;
    }

    if (cached?.baseDocNo && cached.baseDocNo !== '—') {
      return { ...record, baseDocNo: String(cached.baseDocNo) };
    }

    return record;
  }

  findCachedRecord(id: string | number): AgpRecord | undefined {
    const numericId = Number.parseInt(String(id), 10) || 0;
    return this.agpList().find((record) => record.Id === numericId);
  }

  addArticleGatePass(payload: AgpAddPayload): Observable<AgpApiResponse> {
    return this.http.post<AgpApiResponse>(ARTICLE_GATE_PASS_ADD_URL, payload);
  }

  updateArticleGatePass(id: string | number, payload: AgpAddPayload): Observable<AgpApiResponse> {
    const identifier = encodeURIComponent(String(id));
    const updatePayload: Partial<AgpAddPayload> = { ...payload };
    // The base document is immutable during edits; resubmitting it triggers the API's uniqueness check.
    delete updatePayload.baseDocNo;

    return this.http.post<AgpApiResponse>(
      `${ARTICLE_GATE_PASS_UPDATE_URL}/${identifier}`,
      JSON.stringify(updatePayload),
      { headers: { 'Content-Type': 'application/json' } },
    );
  }

  deleteArticleGatePass(id: string | number): Observable<AgpApiResponse> {
    const identifier = encodeURIComponent(String(id));
    return this.http.delete<AgpApiResponse>(`${ARTICLE_GATE_PASS_DELETE_URL}/${identifier}`);
  }

  removeAgpRecord(record: AgpRecord): void {
    this.agpList.update((list) => list.filter((item) => item.Id !== record.Id));
  }

  private mapDetailResponse(response: unknown): AgpRecord {
    const items = this.extractApiItems(response);
    if (items.length > 0) {
      return this.mapApiItemToRecord(items[0]);
    }

    if (response && typeof response === 'object') {
      return this.mapApiItemToRecord(response as Record<string, unknown>);
    }

    throw new Error('Article gate pass record not found');
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
      'items',
      'results',
      'records',
      'list',
      'article_gate_passes',
      'articleGatePasses',
      'articleGatePassList',
      'article_gate_pass_list',
      'agpList',
      'agps',
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

    const nestedData = obj['data'];
    if (nestedData && typeof nestedData === 'object') {
      const nestedItems = this.extractApiItems(nestedData);
      if (nestedItems.length > 0) {
        return nestedItems;
      }
    }

    if (
      obj['referenceNo'] ||
      obj['reference_no'] ||
      obj['type'] ||
      obj['baseDocNo'] ||
      obj['base_doc_no'] ||
      obj['businessPartnerName'] ||
      obj['business_partner_name']
    ) {
      return [obj];
    }

    return [];
  }

  private extractPagination(
    response: unknown,
    recordCount: number,
    requestedPage: number,
    requestedPerPage: number,
  ): AgpPagination {
    const metadata = this.findPaginationMetadata(response);
    const total = this.readPositiveOrZeroNumber(metadata, ['total']) ?? recordCount;
    const perPage = this.readPositiveNumber(metadata, ['per_page', 'perPage']) ?? requestedPerPage;
    const lastPage =
      this.readPositiveNumber(metadata, ['last_page', 'lastPage']) ??
      Math.max(1, Math.ceil(total / perPage));
    const currentPage = this.readPositiveNumber(metadata, ['current_page', 'currentPage']) ?? requestedPage;
    const from =
      this.readPositiveNumber(metadata, ['from']) ??
      (recordCount > 0 ? (currentPage - 1) * perPage + 1 : null);
    const to = this.readPositiveNumber(metadata, ['to']) ?? (from === null ? null : from + recordCount - 1);

    return { currentPage, lastPage, perPage, from, to, total };
  }

  private findPaginationMetadata(response: unknown): Record<string, unknown> {
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      return {};
    }

    const object = response as Record<string, unknown>;
    if (
      object['current_page'] !== undefined ||
      object['currentPage'] !== undefined ||
      object['last_page'] !== undefined ||
      object['per_page'] !== undefined
    ) {
      return object;
    }

    return this.findPaginationMetadata(object['data']);
  }

  private readPositiveNumber(source: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const value = Number(source[key]);
      if (Number.isInteger(value) && value > 0) {
        return value;
      }
    }
    return null;
  }

  private readPositiveOrZeroNumber(source: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const value = Number(source[key]);
      if (Number.isInteger(value) && value >= 0) {
        return value;
      }
    }
    return null;
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

  private pickBoolean(sources: Array<Record<string, unknown>>, keys: string[]): boolean {
    for (const source of sources) {
      for (const key of keys) {
        const value = source[key];
        if (value === true || value === false) {
          return value;
        }
        if (value === 1 || value === '1' || String(value).toLowerCase() === 'true') {
          return true;
        }
        if (value === 0 || value === '0' || String(value).toLowerCase() === 'false') {
          return false;
        }
      }
    }
    return false;
  }

  private mapLineItem(raw: Record<string, unknown>): AgpLineItem {
    return {
      oitmCode: this.pickString([raw], ['oitmCode', 'oitm_code', 'OitmCode']),
      itemCode: this.pickString([raw], ['itemCode', 'item_code', 'ItemCode']),
      itemName: this.pickString([raw], ['itemName', 'item_name', 'ItemName']),
      serialNumbers: this.pickString([raw], ['serialNumbers', 'serial_numbers', 'SerialNumbers', 'batchNo', 'batch_no', 'BatchNo']),
      category: this.pickString([raw], ['category', 'Category']),
      packingCondition: this.pickString([raw], ['packingCondition', 'packing_condition']),
      productQuality: this.pickString([raw], ['productQuality', 'product_quality']),
      uom: this.pickString([raw], ['uom', 'UOM', 'Uom']),
      qtySent: this.pickNumber([raw], ['qtySent', 'qty_sent', 'QtySent']),
      qtyReceived: this.pickNumber([raw], ['qtyReceived', 'qty_received', 'QtyReceived']),
      info: this.pickString([raw], ['info', 'Info']),
      remarks: this.pickString([raw], ['remarks', 'Remarks']),
      deleted: Boolean(raw['deleted'] ?? raw['Deleted'] ?? raw['isDeleted']),
    };
  }

  private mapLines(item: Record<string, unknown>): AgpLineItem[] {
    const rawLines = item['lines'] ?? item['Lines'] ?? item['lineItems'] ?? item['line_items'];
    if (!Array.isArray(rawLines)) {
      return [];
    }

    return rawLines
      .filter((line): line is Record<string, unknown> => !!line && typeof line === 'object')
      .map((line) => this.mapLineItem(line));
  }

  private mapApiItemToRecord(item: Record<string, unknown>): AgpRecord {
    const sources = [item];
    const id = this.pickString([item], ['id', 'Id', 'agp_id', 'article_gate_pass_id']);

    const businessPartnerName =
      this.pickString(sources, ['businessPartnerName', 'business_partner_name', 'BusinessPartnerName']) || '—';
    const requestingDepartment =
      this.pickString(sources, [
        'requestingDepartment',
        'requesting_department',
        'RequestingDepartment',
        'department',
        'Department',
        'requestingDept',
        'requesting_dept',
      ]) || '—';
    const lines = this.mapLines(item);
    const totalQtySent =
      this.pickNumber(sources, ['totalQtySent', 'total_qty_sent', 'TotalQtySent']) ||
      lines.reduce((sum, line) => sum + (Number.isFinite(line.qtySent) ? line.qtySent : 0), 0);
    const totalQtyReceived =
      this.pickNumber(sources, ['totalQtyReceived', 'total_qty_received', 'TotalQtyReceived']) ||
      lines.reduce((sum, line) => sum + (Number.isFinite(line.qtyReceived) ? line.qtyReceived : 0), 0);

    return {
      Id: Number.parseInt(id, 10) || 0,
      referenceNo: this.pickString(sources, ['referenceNo', 'reference_no', 'ReferenceNo']) || '—',
      title: businessPartnerName,
      requestingDepartment,
      department: requestingDepartment,
      status: this.pickString(sources, ['status', 'Status']) || '—',
      submittedDate:
        this.pickString(sources, ['documentDate', 'document_date', 'submittedDate', 'submitted_date']) || '—',
      remarks: this.pickString(sources, ['remarks', 'Remarks']) || undefined,
      selected: false,
      type:
        this.pickString(sources, [
          'type',
          'Type',
          'agpType',
          'AGPType',
          'agp_type',
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
        ]) || '—',
      businessPartnerCode:
        this.pickString(sources, ['businessPartnerCode', 'business_partner_code', 'BusinessPartnerCode']) || '—',
      baseDocNo:
        this.pickString(sources, [
          'baseDocNo',
          'base_doc_no',
          'BaseDocNo',
          'BaseDoc',
          'baseDoc',
          'baseDocumentNo',
          'base_document_no',
          'BaseDocumentNo',
          'baseDocNumber',
          'base_doc_number',
          'documentNumber',
          'document_number',
          'docNum',
          'DocNum',
        ]) || '—',
      businessPartnerName,
      vehicleNo: this.pickString(sources, ['vehicleNo', 'vehicle_no', 'VehicleNo']) || '—',
      reasonForMovement: this.pickString(sources, ['reasonForMovement', 'reason_for_movement', 'ReasonForMovement', 'reason']) || '—',
      natureOfItem: this.pickString(sources, ['natureOfItem', 'nature_of_item', 'NatureOfItem']) || '—',
      natureOfRepair: this.pickString(sources, ['natureOfRepair', 'nature_of_repair', 'NatureOfRepair']) || '—',
      requestingEmployee: this.pickString(sources, ['requestingEmployee', 'requesting_employee', 'RequestingEmployee']) || '—',
      requestedBy: this.pickString(sources, ['requestedBy', 'requested_by', 'RequestedBy']) || '—',
      issuedTo: this.pickString(sources, ['issuedTo', 'issued_to', 'IssuedTo']) || '—',
      articleOutDate: this.pickString(sources, ['articleOutDate', 'article_out_date', 'ArticleOutDate', 'articleOutDateDoc']) || '—',
      articleReturnedDate: this.pickString(sources, ['articleReturnedDate', 'article_returned_date', 'ArticleReturnedDate']) || '—',
      issueResolved: normalizeReturnStatus(
        this.pickString(sources, ['issueResolved', 'issue_resolved', 'IssueResolved']),
        '',
      ),
      returnStatus: normalizeReturnStatus(
        this.pickString(sources, ['returnStatus', 'return_status', 'ReturnStatus']),
        this.pickString(sources, ['articleReturnedDate', 'article_returned_date', 'ArticleReturnedDate']),
      ),
      warrantyClaimable: normalizeReturnStatus(
        this.pickString(sources, ['warrantyClaimable', 'warranty_claimable', 'WarrantyClaimable']),
        this.pickString(sources, ['warrantyStartDate', 'warranty_start_date', 'WarrantyStartDate']),
      ),
      warrantyStartDate: this.pickString(sources, ['warrantyStartDate', 'warranty_start_date', 'WarrantyStartDate']) || '—',
      warrantyDuration: this.pickString(sources, ['warrantyDuration', 'warranty_duration', 'WarrantyDuration']) || '—',
      warrantyExpiryDate: this.pickString(sources, ['warrantyExpiryDate', 'warranty_expiry_date', 'WarrantyExpiryDate']) || '—',
      location:
        this.pickString(sources, [
          'location',
          'Location',
          'branch',
          'Branch',
          'branchName',
          'branch_name',
          'BranchName',
          'branchLocation',
          'branch_location',
          'BranchLocation',
          'BPLName',
          'BPLNAME',
          'bplName',
          'BPLId',
          'BPLID',
          'bplId',
          'branchId',
          'branch_id',
          'branchNameText',
          'BranchNameText',
          'locationName',
          'location_name',
        ]) || '—',
      store: this.pickString(sources, ['store', 'Store', 'warehouse', 'Warehouse', 'warehouseCode']) || '—',
      kantaSlip: this.pickString(sources, ['kantaSlip', 'kanta_slip', 'KantaSlip']) || '—',
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
          'TranspPhone',
          'transportPhone',
        ]) || '—',
      biltyNo: this.pickString(sources, ['biltyNo', 'bilty_no', 'BiltyNo']) || '—',
      weight: this.pickString(sources, ['weight', 'Weight']) || '—',
      attachmentFileName: this.pickString(sources, ['attachmentFileName', 'attachment_file_name']) || undefined,
      headOfSupplyChainApproval: this.pickBoolean(sources, [
        'headOfSupplyChainApproval',
        'head_of_supply_chain_approval',
      ]),
      lines,
      totalQtySent,
      totalQtyReceived,
    };
  }
}
