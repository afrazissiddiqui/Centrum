import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { glAccountBranchLabel } from '../components/setup/gl-account-determination/gl-account-branch.options';
import { apiUrl } from '../config/api.config';
import { formatSapApiFailureMessage } from '../utils/api-error.util';

export interface GlAccountDeterminationAddPayload {
  form: number | string;
  type: string;
  code: string;
  name: string;
  branch: string;
  debit_credit_type: string;
  business_partner: string;
  costCenterType: string;
  CctCode: string;
  vendor_for_expense_reimbursement?: string;
  vendor_for_loans?: string;
  vendor_for_advances?: string;
}

export interface GlAccountDeterminationRecord {
  Id: number;
  Form: number | string;
  Type: string;
  Code: string;
  Name: string;
  Branch: string;
  DebitCreditType: string;
  BusinessPartner: string;
  CctCode: string;
  CctName: string;
  VendorForExpenseReimbursement: string;
  VendorForLoans: string;
  VendorForAdvances: string;
}

export interface GlAccountOption {
  code: string;
  name: string;
}

export interface CostCenterTypeOption {
  CctCode: string;
  CctName: string;
}

const GL_ACCOUNT_DETERMINATION_LIST_URL = apiUrl('gl-account-determination-list');
const GL_ACCOUNT_DETERMINATION_ADD_URL = apiUrl('gl-account-determination-add');
const GL_ACCOUNT_DETERMINATION_UPDATE_URL = apiUrl('gl-account-determination-update');
const GL_ACCOUNT_DETERMINATION_DELETE_URL = apiUrl('gl-account-determination-delete');
const INVENTORY_ACCOUNTS_URL = apiUrl('inventory_accounts');
const COST_CENTER_TYPES_URL = apiUrl('cost_center_types');
const EXPENSE_REIMBURSEMENT_FORM_VALUE = 6;
const LOAN_ADVANCE_FORM_VALUE = 7;

@Injectable({
  providedIn: 'root',
})
export class GlAccountDeterminationService {
  private readonly http = inject(HttpClient);
  private readonly recordList = signal<GlAccountDeterminationRecord[]>([]);

  readonly records = this.recordList.asReadonly();

  fetchGlAccountOptions(): Observable<GlAccountOption[]> {
    return this.http.get<unknown>(INVENTORY_ACCOUNTS_URL).pipe(
      map((response) => this.extractInventoryAccountOptions(response)),
    );
  }

  fetchCostCenterTypeOptions(): Observable<CostCenterTypeOption[]> {
    return this.http.get<unknown>(COST_CENTER_TYPES_URL).pipe(
      map((response) => this.extractCostCenterTypeOptions(response)),
    );
  }

  addGlAccountDetermination(payload: GlAccountDeterminationAddPayload): Observable<unknown> {
    return this.http.post<unknown>(GL_ACCOUNT_DETERMINATION_ADD_URL, payload).pipe(
      map((response) =>
        this.ensureSuccessfulMutationResponse(
          response,
          'GL Account Determination row could not be saved.',
        ),
      ),
    );
  }

  updateGlAccountDetermination(
    id: string | number,
    payload: GlAccountDeterminationAddPayload,
  ): Observable<unknown> {
    const identifier = encodeURIComponent(String(id));
    return this.http.post<unknown>(`${GL_ACCOUNT_DETERMINATION_UPDATE_URL}/${identifier}`, payload).pipe(
      map((response) =>
        this.ensureSuccessfulMutationResponse(
          response,
          'GL Account Determination row could not be updated.',
        ),
      ),
    );
  }

  fetchGlAccountDeterminations(): Observable<GlAccountDeterminationRecord[]> {
    return this.http.get<unknown>(GL_ACCOUNT_DETERMINATION_LIST_URL).pipe(
      map((response) => this.extractApiItems(response).map((item) => this.mapApiItemToRecord(item))),
      tap((records) => this.recordList.set(records)),
    );
  }

  fetchExpenseTypeOptions(): Observable<string[]> {
    return this.fetchGlAccountDeterminations().pipe(
      map((records) =>
        Array.from(
          new Set(
            records
              .filter((record) => this.isExpenseReimbursementRecord(record))
              .map((record) => record.Type.trim())
              .filter((type) => type),
          ),
        ),
      ),
    );
  }

  fetchLoanAdvanceRequestTypeOptions(): Observable<string[]> {
    return this.fetchGlAccountDeterminations().pipe(
      map((records) =>
        Array.from(
          new Set(
            records
              .filter((record) => this.isFormRecord(record, LOAN_ADVANCE_FORM_VALUE, 'loan/advance form'))
              .map((record) => record.Type.trim())
              .filter((type) => type),
          ),
        ),
      ),
    );
  }

  deleteGlAccountDetermination(id: string | number): Observable<unknown> {
    const identifier = encodeURIComponent(String(id));
    return this.http.delete<unknown>(`${GL_ACCOUNT_DETERMINATION_DELETE_URL}/${identifier}`).pipe(
      map((response) =>
        this.ensureSuccessfulMutationResponse(
          response,
          'GL Account Determination row could not be deleted.',
        ),
      ),
    );
  }

  private ensureSuccessfulMutationResponse(response: unknown, fallback: string): unknown {
    if (response && typeof response === 'object' && !Array.isArray(response)) {
      const result = response as Record<string, unknown>;
      if (result['status'] === false || result['success'] === false) {
        throw new Error(formatSapApiFailureMessage(response, fallback));
      }
    }

    return response;
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
      'glAccountDeterminations',
      'gl_account_determinations',
      'glAccountDeterminationList',
    ];

    for (const key of arrayKeys) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
      }
    }

    const nestedData = obj['data'];
    if (nestedData && typeof nestedData === 'object') {
      const nestedItems = this.extractApiItems(nestedData);
      if (nestedItems.length > 0) {
        return nestedItems;
      }
    }

    if (obj['type'] || obj['code'] || obj['name'] || obj['branch'] || obj['debit_credit_type']) {
      return [obj];
    }

    return [];
  }

  private extractInventoryAccountOptions(response: unknown): GlAccountOption[] {
    const options: GlAccountOption[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') {
        return;
      }

      const record = value as Record<string, unknown>;
      const code = this.pickString([record], [
        'AcctCode',
        'AccountCode',
        'Code',
        'code',
        'accountCode',
        'value',
        'id',
      ]);
      const name = this.pickString([record], [
        'Name',
        'name',
        'Description',
        'description',
        'AccountName',
        'accountName',
      ]);

      if (code) {
        if (!options.some((option) => option.code === code)) {
          options.push({ code, name: name || code });
        }
        return;
      }

      Object.values(record).forEach(visit);
    };

    visit(response);
    return options;
  }

  private extractCostCenterTypeOptions(response: unknown): CostCenterTypeOption[] {
    const options: CostCenterTypeOption[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value === 'string') {
        const name = value.trim();
        if (name) {
          options.push({ CctCode: name, CctName: name });
        }
        return;
      }
      if (!value || typeof value !== 'object') {
        return;
      }

      const record = value as Record<string, unknown>;
      const list = Object.entries(record).find(([key, item]) =>
        ['data', 'items', 'results', 'records', 'list', 'cost_center_types', 'costCenterTypes']
          .includes(key) && (Array.isArray(item) || (item !== null && typeof item === 'object')),
      );
      if (list) {
        visit(list[1]);
        return;
      }

      const code = this.pickString([record], [
        'CctCode',
        'cctCode',
        'cct_code',
        'cost_center_type_code',
        'costCenterTypeCode',
        'code',
      ]);
      const name = this.pickString([record], [
        'CctName',
        'cctName',
        'cct_name',
        'cost_center_type_name',
        'costCenterTypeName',
        'CostCenterType',
        'costCenterType',
        'name',
        'description',
        'label',
      ]);
      if (code || name) {
        options.push({ CctCode: code || name, CctName: name || code });
        return;
      }

      Object.values(record).forEach(visit);
    };

    visit(response);
    return [...new Map(options.map((option) => [option.CctCode.toLowerCase(), option])).values()];
  }

  private mapApiItemToRecord(item: Record<string, unknown>): GlAccountDeterminationRecord {
    const sources = [item];
    const formValueRaw = this.pickString(sources, ['Form', 'form', 'FormName', 'form_name', 'FormId', 'form_id']);
    const formValue = formValueRaw !== '' && /^\d+$/.test(formValueRaw) ? Number.parseInt(formValueRaw, 10) : formValueRaw;

    const costCenterTypeCode = this.pickString(sources, [
      'CctCode',
      'cctCode',
      'cct_code',
      'costCenterType',
      'cost_center_type',
      'CostCenterType',
    ]);
    const costCenterTypeName = this.pickString(sources, [
      'CctName',
      'cctName',
      'cct_name',
      'costCenterTypeName',
      'cost_center_type_name',
    ]);

    return {
      Id: this.pickNumber(sources, ['Id', 'id', 'ID']),
      Form: formValue,
      Type: this.pickString(sources, ['Type', 'type', 'glItemType', 'gl_item_type']),
      Code: this.pickString(sources, ['Code', 'code', 'salaryGlAccountCode', 'salary_gl_account_code']),
      Name: this.pickString(sources, ['Name', 'name', 'salaryGlAccountName', 'salary_gl_account_name']),
      Branch: glAccountBranchLabel(this.pickString(sources, ['Branch', 'branch'])),
      DebitCreditType: this.pickString(sources, [
        'DebitCreditType',
        'debitCreditType',
        'debit_credit_type',
      ]),
      BusinessPartner: this.pickString(sources, [
        'BusinessPartner',
        'businessPartner',
        'business_partner',
      ]),
      CctCode: costCenterTypeCode || costCenterTypeName,
      CctName: costCenterTypeName || costCenterTypeCode,
      VendorForExpenseReimbursement: this.pickString(sources, [
        'VendorForExpenseReimbursement',
        'vendorForExpenseReimbursement',
        'vendor_for_expense_reimbursement',
      ]),
      VendorForLoans: this.pickString(sources, [
        'VendorForLoans',
        'vendorForLoans',
        'vendor_for_loans',
      ]),
      VendorForAdvances: this.pickString(sources, [
        'VendorForAdvances',
        'vendorForAdvances',
        'vendor_for_advances',
      ]),
    };
  }

  private isExpenseReimbursementRecord(record: GlAccountDeterminationRecord): boolean {
    return this.isFormRecord(record, EXPENSE_REIMBURSEMENT_FORM_VALUE, 'expense reimbursement form');
  }

  private isFormRecord(
    record: GlAccountDeterminationRecord,
    formValue: number,
    formName: string,
  ): boolean {
    if (record.Form === formValue) {
      return true;
    }

    return String(record.Form).trim().toLowerCase() === formName;
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
    return Number.parseInt(text, 10) || 0;
  }
}
