import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { apiUrl } from '../config/api.config';
import { formatSapApiFailureMessage } from '../utils/api-error.util';

export interface CrushedRisenConsumptionRecord {
  id: number;
  documentNumberFromProduction: string;
  itemCodeFromProduction: string;
  itemNameFromProduction: string;
  status: string;
}

export interface CrushedRisenConsumptionDetail extends CrushedRisenConsumptionRecord {
  productDocEntry: string;
  crcNumber: string;
  series: string;
  signedUser: string;
  remark: string;
  createDate: string;
  createTime: string;
  updateDate: string;
  updateTime: string;
  sapDocEntry: string;
  sapDocNum: string;
  lines: CrushedRisenConsumptionDetailLine[];
}

export interface CrushedRisenConsumptionDetailLine {
  machineId: string;
  machineName: string;
  moldNumber: string;
  cavityNumber: string;
  employeeShift: string;
  crushedRisenConsumption: number | string | null;
}

export interface CrushedRisenConsumptionAddPayload {
  docNumPo: string;
  docEntryPo: string;
  itemCode: string;
  itemName: string;
  crcNumber: string;
  series: number;
  status: string;
  userSigned: string;
  remark: string;
  createDate: string;
  createTime: string;
  lines: CrushedRisenConsumptionAddLine[];
}

export interface CrushedRisenConsumptionAddLine {
  machineId: string;
  machineName: string;
  moldNumber: string;
  cavityNumber: string;
  employeeShift: string;
  crushedRisenConsumption: number | null;
}

export interface CrushedRisenConsumptionUpdatePayload {
  remark: string;
  status: string;
  lines: CrushedRisenConsumptionUpdateLine[];
}

export interface CrushedRisenConsumptionUpdateLine {
  machineId: string;
  machineName: string;
  moldNumber: string;
  cavityNumber: string;
  employeeShift: string;
  crushedRisenConsumption: number | string | null;
}

interface CrushedRisenConsumptionListResponse {
  status: boolean;
  message?: string;
  data: CrushedRisenConsumptionApiRecord[];
}

interface CrushedRisenConsumptionDetailResponse {
  status: boolean;
  message?: string;
  data: CrushedRisenConsumptionApiDetail;
}

interface CrushedRisenConsumptionApiRecord {
  id: number;
  doc_num_po: string;
  item_code: string;
  item_name: string;
  status: string;
}

interface CrushedRisenConsumptionApiDetail extends CrushedRisenConsumptionApiRecord {
  doc_entry_po: string;
  crc_number: string;
  series: string;
  user_signed: string;
  remark: string;
  create_date: string;
  create_time: string;
  update_date?: string | null;
  update_time?: string | null;
  sap_doc_entry?: string | null;
  sap_doc_num?: string | null;
  lines: CrushedRisenConsumptionDetailLine[];
}

const CRUSHED_RISEN_CONSUMPTION_LIST_URL = apiUrl('crushed-risen-consumption-list');
const CRUSHED_RISEN_CONSUMPTION_DETAIL_URL = apiUrl('crushed-risen-consumption-detail');
const CRUSHED_RISEN_CONSUMPTION_DELETE_URL = apiUrl('crushed-risen-consumption-delete');
const CRUSHED_RISEN_CONSUMPTION_ADD_URL = apiUrl('crushed-risen-consumption-add');
const CRUSHED_RISEN_CONSUMPTION_UPDATE_URL = apiUrl('crushed-risen-consumption-update');

@Injectable({
  providedIn: 'root',
})
export class CrushedRisenConsumptionService {
  private readonly http = inject(HttpClient);

  addRecord(payload: CrushedRisenConsumptionAddPayload): Observable<unknown> {
    return this.http.post<unknown>(CRUSHED_RISEN_CONSUMPTION_ADD_URL, payload).pipe(
      map((response) => {
        if (response && typeof response === 'object' && !Array.isArray(response)) {
          const result = response as Record<string, unknown>;
          if (result['status'] === false || result['success'] === false) {
            throw new Error(
              formatSapApiFailureMessage(
                response,
                'Crushed Risen Consumption record could not be saved.',
              ),
            );
          }
        }
        return response;
      }),
    );
  }

  updateRecord(id: number, payload: CrushedRisenConsumptionUpdatePayload): Observable<unknown> {
    const identifier = encodeURIComponent(String(id));
    return this.http
      .post<unknown>(`${CRUSHED_RISEN_CONSUMPTION_UPDATE_URL}/${identifier}`, payload)
      .pipe(
        map((response) => {
          if (response && typeof response === 'object' && !Array.isArray(response)) {
            const result = response as Record<string, unknown>;
            if (result['status'] === false || result['success'] === false) {
              throw new Error(
                formatSapApiFailureMessage(
                  response,
                  'Crushed Risen Consumption record could not be updated.',
                ),
              );
            }
          }
          return response;
        }),
      );
  }

  fetchRecords(): Observable<CrushedRisenConsumptionRecord[]> {
    return this.http
      .get<CrushedRisenConsumptionListResponse>(CRUSHED_RISEN_CONSUMPTION_LIST_URL)
      .pipe(
        map((response) => {
          if (!response.status) {
            throw new Error(response.message || 'Failed to load Crushed Risen Consumption records.');
          }

          return response.data.map((record) => ({
            id: record.id,
            documentNumberFromProduction: record.doc_num_po,
            itemCodeFromProduction: record.item_code,
            itemNameFromProduction: record.item_name,
            status: record.status,
          }));
        }),
      );
  }

  fetchRecordDetail(id: number): Observable<CrushedRisenConsumptionDetail> {
    return this.http
      .get<CrushedRisenConsumptionDetailResponse>(
        `${CRUSHED_RISEN_CONSUMPTION_DETAIL_URL}/${encodeURIComponent(id)}`,
      )
      .pipe(
        map((response) => {
          if (!response.status) {
            throw new Error(response.message || 'Failed to load Crushed Risen Consumption details.');
          }

          const record = response.data;
          return {
            id: record.id,
            documentNumberFromProduction: record.doc_num_po,
            itemCodeFromProduction: record.item_code,
            itemNameFromProduction: record.item_name,
            status: record.status,
            productDocEntry: record.doc_entry_po,
            crcNumber: record.crc_number,
            series: record.series,
            signedUser: record.user_signed,
            remark: record.remark,
            createDate: record.create_date,
            createTime: record.create_time,
            updateDate: record.update_date ?? '',
            updateTime: record.update_time ?? '',
            sapDocEntry: record.sap_doc_entry ?? '',
            sapDocNum: record.sap_doc_num ?? '',
            lines: record.lines,
          };
        }),
      );
  }

  deleteRecord(id: number): Observable<unknown> {
    return this.http
      .delete<unknown>(`${CRUSHED_RISEN_CONSUMPTION_DELETE_URL}/${encodeURIComponent(id)}`)
      .pipe(
        map((response) => {
          const result = response as Record<string, unknown> | null;
          if (
            result &&
            typeof result === 'object' &&
            !Array.isArray(result) &&
            (result['status'] === false || result['success'] === false)
          ) {
            throw new Error(
              formatSapApiFailureMessage(
                result,
                'Crushed Risen Consumption record could not be deleted.',
              ),
            );
          }
          return response;
        }),
      );
  }
}
