import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { apiUrl } from '../../../../config/api.config';
import {
  MachineSearchOption,
  PlantMaintenanceMachineRecordBase,
} from '../plant-maintenance-machine.model';

export interface PlantMaintenanceMasterLineAttachment {
  fileName: string;
  dataUrl: string;
}

export interface PlantMaintenanceMasterReplacementLine {
  itemCode: string;
  itemName: string;
  quantity: number | null;
}

export interface PlantMaintenanceMasterInspectionLine {
  itemsToBeInspected: string;
  whatToCheck: string;
  replacement: string;
  replacementItems: PlantMaintenanceMasterReplacementLine[];
  instructions: string;
  status: string;
  employee: string;
  recommendation: string;
  attachments: PlantMaintenanceMasterLineAttachment[];
}

export interface PlantMaintenanceMasterComponent {
  name: string;
  inspectionLines: PlantMaintenanceMasterInspectionLine[];
}

export interface PlantMaintenanceMasterSparePartLine {
  sparePartId: string;
  sparePartDescription: string;
  quantity: number | null;
  warehouseCode: string;
  uomCode: string;
}

export interface PlantMaintenanceMasterRecord extends PlantMaintenanceMachineRecordBase {
  maintenanceNature: string;
  plantMaintenanceFrequency: string;
  plantMaintenanceType: string;
  startDate: string;
  endDate: string;
  duration: number | null;
  spareParts: PlantMaintenanceMasterSparePartLine[];
  remarks: string;
  components: PlantMaintenanceMasterComponent[];
}

export interface PlantMaintenanceMasterFormInput {
  machineId: string;
  machineName: string;
  machineType: string;
  location?: string;
  maintenanceNature: string;
  plantMaintenanceFrequency: string;
  plantMaintenanceType: string;
  startDate: string;
  endDate: string;
  duration: number | null;
  spareParts: PlantMaintenanceMasterSparePartLine[];
  components: PlantMaintenanceMasterComponent[];
}

export interface PlantMaintenanceMasterFormPayload {
  machineId: string;
  machineName: string;
  machineType: string;
  location?: string;
  maintenanceNature: string;
  plantMaintenanceFrequency: string;
  plantMaintenanceType: string;
  startDate: string;
  endDate: string;
  duration: number;
  spareParts: Array<{
    sparePartId: string;
    sparePartDescription: string;
    quantity: number;
    warehouseCode: string;
    uomCode: string;
  }>;
  components: PlantMaintenanceMasterComponent[];
}

export interface PlantMaintenanceMasterApiResponse {
  status?: boolean;
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

const PLANT_MAINTENANCE_MAIN_FORM_LIST_URL = apiUrl('plant-maintenance-main-form-list');
const PLANT_MAINTENANCE_MAIN_FORM_ADD_URL = apiUrl('plant-maintenance-main-form-add');
const PLANT_MAINTENANCE_MAIN_FORM_DETAIL_URL = apiUrl('plant-maintenance-main-form-detail');
const PLANT_MAINTENANCE_MAIN_FORM_UPDATE_URL = apiUrl('plant-maintenance-main-form-update');
const PLANT_MAINTENANCE_MAIN_FORM_DELETE_URL = apiUrl('plant-maintenance-main-form-delete');

export function plantMaintenanceMasterHasReplacementYes(
  record: PlantMaintenanceMasterRecord,
): boolean {
  return (record.components ?? []).some((component) =>
    (component.inspectionLines ?? []).some(
      (line) => line.replacement.trim().toLowerCase() === 'yes',
    ),
  );
}

export function hasPlantMaintenanceInspectionLineDetails(
  line: PlantMaintenanceMasterInspectionLine,
): boolean {
  return Boolean(
    line.itemsToBeInspected.trim() ||
      line.whatToCheck.trim() ||
      line.instructions.trim(),
  );
}

export function filterPlantMaintenanceViewableComponents(
  components: PlantMaintenanceMasterComponent[] | undefined,
): PlantMaintenanceMasterComponent[] {
  return (components ?? [])
    .map((component) => ({
      ...component,
      inspectionLines: (component.inspectionLines ?? []).filter(
        hasPlantMaintenanceInspectionLineDetails,
      ),
    }))
    .filter((component) => component.name.trim() && component.inspectionLines.length > 0);
}

export function extractItrEligibleMachines(
  records: PlantMaintenanceMasterRecord[],
): MachineSearchOption[] {
  const seen = new Set<string>();
  const machines: MachineSearchOption[] = [];

  for (const record of records) {
    if (!plantMaintenanceMasterHasReplacementYes(record)) {
      continue;
    }

    const machineId = record.machineId.trim();
    const machineName = record.machineName.trim();
    if (!machineId || machineId === '—') {
      continue;
    }

    const key = machineId.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    machines.push({
      machineId,
      machineName: machineName || machineId,
      defaultMachineType: record.machineType?.trim() ?? '',
    });
  }

  return machines.sort((a, b) => a.machineId.localeCompare(b.machineId));
}

export interface PlantMaintenanceMasterReplacementLineGroup {
  lineKey: string;
  componentName: string;
  itemsToBeInspected: string;
  whatToCheck: string;
  items: PlantMaintenanceMasterReplacementLine[];
}

export function extractReplacementLineGroupsForMachine(
  records: PlantMaintenanceMasterRecord[],
  machineId: string,
): PlantMaintenanceMasterReplacementLineGroup[] {
  const normalizedId = machineId.trim().toLowerCase();
  const record = records.find(
    (entry) => entry.machineId.trim().toLowerCase() === normalizedId,
  );
  if (!record) {
    return [];
  }

  const groups: PlantMaintenanceMasterReplacementLineGroup[] = [];
  let lineIndex = 0;

  for (const component of record.components ?? []) {
    for (const inspectionLine of component.inspectionLines ?? []) {
      if (inspectionLine.replacement.trim().toLowerCase() !== 'yes') {
        continue;
      }

      const items = (inspectionLine.replacementItems ?? []).map((item) => ({
        itemCode: item.itemCode,
        itemName: item.itemName,
        quantity: item.quantity ?? 1,
      }));

      if (items.length === 0) {
        items.push({ itemCode: '', itemName: '', quantity: 1 });
      }

      groups.push({
        lineKey: `${component.name}-${lineIndex}`,
        componentName: component.name,
        itemsToBeInspected: inspectionLine.itemsToBeInspected,
        whatToCheck: inspectionLine.whatToCheck,
        items,
      });
      lineIndex += 1;
    }
  }

  return groups;
}

export function buildPlantMaintenanceMasterFormPayload(
  entry: PlantMaintenanceMasterFormInput,
): PlantMaintenanceMasterFormPayload {
  return {
    machineId: entry.machineId.trim(),
    machineName: entry.machineName.trim(),
    machineType: entry.machineType.trim(),
    location: (entry.location ?? '').trim(),
    maintenanceNature: entry.maintenanceNature.trim(),
    plantMaintenanceFrequency: entry.plantMaintenanceFrequency.trim(),
    plantMaintenanceType: entry.plantMaintenanceType.trim(),
    startDate: entry.startDate.trim(),
    endDate: entry.endDate.trim(),
    duration: entry.duration ?? 0,
    spareParts: entry.spareParts.map((part) => ({
      sparePartId: part.sparePartId.trim(),
      sparePartDescription: part.sparePartDescription.trim(),
      quantity: part.quantity ?? 0,
      warehouseCode: part.warehouseCode.trim(),
      uomCode: part.uomCode.trim(),
    })),
    components: entry.components.map((component) => ({
      name: component.name.trim(),
      inspectionLines: component.inspectionLines.map((line) => ({
        status: line.status.trim(),
        itemsToBeInspected: line.itemsToBeInspected.trim(),
        whatToCheck: line.whatToCheck.trim(),
        replacement: line.replacement.trim() || 'No',
        replacementItems:
          line.replacement.trim() === 'Yes'
            ? line.replacementItems.map((item) => ({
                itemCode: item.itemCode.trim(),
                itemName: item.itemName.trim(),
                quantity: item.quantity ?? 0,
              }))
            : [],
        instructions: line.instructions.trim(),
        employee: line.employee.trim(),
        recommendation: line.recommendation.trim(),
        attachments: line.attachments.map((attachment) => ({
          fileName: attachment.fileName.trim(),
          dataUrl: attachment.dataUrl,
        })),
      })),
    })),
  };
}

@Injectable({ providedIn: 'root' })
export class PlantMaintenanceMasterFormService {
  private readonly http = inject(HttpClient);
  private readonly _records = signal<PlantMaintenanceMasterRecord[]>([]);

  readonly records = this._records.asReadonly();

  fetchPlantMaintenanceMasterForms(): Observable<PlantMaintenanceMasterRecord[]> {
    return this.http.get<unknown>(PLANT_MAINTENANCE_MAIN_FORM_LIST_URL).pipe(
      map((response) => this.extractApiItems(response).map((item) => this.mapApiItemToRecord(item))),
      tap((records) => this._records.set(records)),
    );
  }

  fetchPlantMaintenanceMasterFormDetail(
    id: string | number,
  ): Observable<PlantMaintenanceMasterRecord> {
    const identifier = encodeURIComponent(String(id));
    return this.http
      .get<unknown>(`${PLANT_MAINTENANCE_MAIN_FORM_DETAIL_URL}/${identifier}`)
      .pipe(map((response) => this.mapDetailResponse(response, id)));
  }

  addPlantMaintenanceMasterForm(
    entry: PlantMaintenanceMasterFormInput,
  ): Observable<PlantMaintenanceMasterApiResponse> {
    return this.http.post<PlantMaintenanceMasterApiResponse>(
      PLANT_MAINTENANCE_MAIN_FORM_ADD_URL,
      buildPlantMaintenanceMasterFormPayload(entry),
    );
  }

  updatePlantMaintenanceMasterForm(
    id: string | number,
    entry: PlantMaintenanceMasterFormInput,
  ): Observable<PlantMaintenanceMasterApiResponse> {
    const identifier = encodeURIComponent(String(id));
    return this.http.post<PlantMaintenanceMasterApiResponse>(
      `${PLANT_MAINTENANCE_MAIN_FORM_UPDATE_URL}/${identifier}`,
      buildPlantMaintenanceMasterFormPayload(entry),
    );
  }

  deletePlantMaintenanceMasterForm(
    id: string | number,
  ): Observable<PlantMaintenanceMasterApiResponse> {
    const identifier = encodeURIComponent(String(id));
    return this.http.delete<PlantMaintenanceMasterApiResponse>(
      `${PLANT_MAINTENANCE_MAIN_FORM_DELETE_URL}/${identifier}`,
    );
  }

  removePlantMaintenanceMasterRecord(record: PlantMaintenanceMasterRecord): void {
    this._records.update((list) => list.filter((item) => item.id !== record.id));
  }

  updateSelection(id: string, selected: boolean): void {
    this._records.update((list) =>
      list.map((r) => (r.id === id ? { ...r, selected } : r)),
    );
  }

  setAllSelected(selected: boolean, ids?: string[]): void {
    const idSet = ids ? new Set(ids) : null;
    this._records.update((list) =>
      list.map((r) => ({
        ...r,
        selected: idSet ? (idSet.has(r.id) ? selected : r.selected) : selected,
      })),
    );
  }

  getById(id: string): PlantMaintenanceMasterRecord | undefined {
    return this._records().find((r) => r.id === id);
  }

  hasDuplicateMachineId(machineId: string, excludeId?: string): boolean {
    const key = machineId.trim().toLowerCase();
    return this._records().some(
      (r) => r.machineId.trim().toLowerCase() === key && r.id !== excludeId,
    );
  }

  hasDuplicateProfile(
    entry: Omit<PlantMaintenanceMasterRecord, 'id' | 'selected' | 'remarks' | 'components'>,
    excludeId?: string,
  ): boolean {
    return this._records().some((r) => {
      if (r.id === excludeId) {
        return false;
      }
      return (
        r.machineId.trim().toLowerCase() === entry.machineId.trim().toLowerCase() &&
        r.machineName.trim().toLowerCase() === entry.machineName.trim().toLowerCase() &&
        r.machineType.trim().toLowerCase() === entry.machineType.trim().toLowerCase() &&
        (r.location ?? '').trim().toLowerCase() === (entry.location ?? '').trim().toLowerCase() &&
        r.maintenanceNature.trim().toLowerCase() === entry.maintenanceNature.trim().toLowerCase() &&
        r.plantMaintenanceFrequency.trim().toLowerCase() ===
          entry.plantMaintenanceFrequency.trim().toLowerCase() &&
        r.plantMaintenanceType.trim().toLowerCase() ===
          entry.plantMaintenanceType.trim().toLowerCase()
      );
    });
  }

  private mapDetailResponse(response: unknown, id: string | number): PlantMaintenanceMasterRecord {
    const items = this.extractApiItems(response);
    if (items.length > 0) {
      return this.mapApiItemToRecord(items[0]);
    }

    if (response && typeof response === 'object') {
      const record = this.mapApiItemToRecord(response as Record<string, unknown>);
      if (!record.id) {
        return { ...record, id: String(id) };
      }
      return record;
    }

    throw new Error('Plant maintenance master form record not found');
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
      'plant_maintenance_main_forms',
      'plantMaintenanceMainForms',
      'plantMaintenanceMainFormList',
      'plant_maintenance_main_form_list',
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

    if (obj['machineId'] || obj['machine_id'] || obj['machineName'] || obj['machine_name']) {
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

  private pickNumber(sources: Array<Record<string, unknown>>, keys: string[]): number | null {
    const text = this.pickString(sources, keys);
    if (!text) {
      return null;
    }
    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private mapAttachments(raw: unknown): PlantMaintenanceMasterLineAttachment[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
      .map((attachment) => ({
        fileName: this.pickString([attachment], ['fileName', 'file_name', 'FileName']),
        dataUrl: this.pickString([attachment], ['dataUrl', 'data_url', 'DataUrl']),
      }))
      .filter((attachment) => attachment.fileName || attachment.dataUrl);
  }

  private mapReplacementItems(raw: Record<string, unknown>): PlantMaintenanceMasterReplacementLine[] {
    const rawItems =
      raw['replacementItems'] ?? raw['replacement_items'] ?? raw['ReplacementItems'];
    if (!Array.isArray(rawItems)) {
      return [];
    }

    return rawItems
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
      .map((item) => ({
        itemCode: this.pickString([item], [
          'itemCode',
          'item_code',
          'ItemCode',
          'machineId',
          'machine_id',
          'MachineId',
        ]),
        itemName: this.pickString([item], [
          'itemName',
          'item_name',
          'ItemName',
          'machineNumber',
          'machine_number',
          'MachineNumber',
        ]),
        quantity: this.pickNumber([item], ['quantity', 'Quantity', 'qty', 'Qty']),
      }))
      .filter(
        (item) => item.itemCode || item.itemName || item.quantity !== null,
      );
  }

  private mapInspectionLine(raw: Record<string, unknown>): PlantMaintenanceMasterInspectionLine {
    const replacement = this.pickString([raw], ['replacement', 'Replacement']) || 'No';
    return {
      itemsToBeInspected: this.pickString([raw], [
        'itemsToBeInspected',
        'items_to_be_inspected',
        'ItemsToBeInspected',
      ]),
      whatToCheck: this.pickString([raw], ['whatToCheck', 'what_to_check', 'WhatToCheck']),
      replacement,
      replacementItems:
        replacement === 'Yes' ? this.mapReplacementItems(raw) : [],
      instructions: this.pickString([raw], ['instructions', 'Instructions']),
      status: this.pickString([raw], ['status', 'Status']),
      employee: this.pickString([raw], ['employee', 'Employee', 'employeeName', 'employee_name']),
      recommendation: this.pickString([raw], ['recommendation', 'Recommendation']),
      attachments: this.mapAttachments(raw['attachments'] ?? raw['Attachments']),
    };
  }

  private mapComponents(item: Record<string, unknown>): PlantMaintenanceMasterComponent[] {
    const raw = item['components'] ?? item['Components'];
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
      .map((component) => {
        const rawLines =
          component['inspectionLines'] ??
          component['inspection_lines'] ??
          component['InspectionLines'];
        const inspectionLines = Array.isArray(rawLines)
          ? rawLines
              .filter((line): line is Record<string, unknown> => !!line && typeof line === 'object')
              .map((line) => this.mapInspectionLine(line))
          : [];

        return {
          name: this.pickString([component], ['name', 'Name', 'component_name', 'componentName']),
          inspectionLines,
        };
      })
      .filter((component) => component.name || component.inspectionLines.length > 0);
  }

  private mapSpareParts(item: Record<string, unknown>): PlantMaintenanceMasterSparePartLine[] {
    const raw = item['spareParts'] ?? item['spare_parts'] ?? item['SpareParts'];
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
      .map((part) => ({
        sparePartId: this.pickString([part], ['sparePartId', 'spare_part_id', 'SparePartId']),
        sparePartDescription: this.pickString([part], [
          'sparePartDescription',
          'spare_part_description',
          'SparePartDescription',
        ]),
        quantity: this.pickNumber([part], ['quantity', 'Quantity', 'qty', 'Qty']),
        warehouseCode: this.pickString([part], ['warehouseCode', 'warehouse_code', 'WarehouseCode']),
        uomCode: this.pickString([part], ['uomCode', 'uom_code', 'UomCode', 'UOMCode']),
      }))
      .filter(
        (part) =>
          part.sparePartId ||
          part.sparePartDescription ||
          part.quantity !== null ||
          part.warehouseCode ||
          part.uomCode,
      );
  }

  private mapApiItemToRecord(item: Record<string, unknown>): PlantMaintenanceMasterRecord {
    const sources = [item];
    const id = this.pickString(sources, [
      'id',
      'Id',
      'plant_maintenance_main_form_id',
      'plantMaintenanceMainFormId',
    ]);

    return {
      id,
      machineId: this.pickString(sources, ['machineId', 'machine_id', 'MachineId']) || '—',
      machineName: this.pickString(sources, ['machineName', 'machine_name', 'MachineName']) || '—',
      machineType: this.pickString(sources, ['machineType', 'machine_type', 'MachineType']) || '—',
      location:
        this.pickString(sources, ['location', 'Location', 'machine_location', 'machineLocation', 'MachineLocation']) ||
        '—',
      maintenanceNature:
        this.pickString(sources, ['maintenanceNature', 'maintenance_nature', 'MaintenanceNature']) ||
        '—',
      plantMaintenanceFrequency:
        this.pickString(sources, [
          'plantMaintenanceFrequency',
          'plant_maintenance_frequency',
          'PlantMaintenanceFrequency',
        ]) || '—',
      plantMaintenanceType:
        this.pickString(sources, [
          'plantMaintenanceType',
          'plant_maintenance_type',
          'PlantMaintenanceType',
        ]) || '—',
      startDate: this.pickString(sources, ['startDate', 'start_date', 'StartDate']),
      endDate: this.pickString(sources, ['endDate', 'end_date', 'EndDate']),
      duration: this.pickNumber(sources, ['duration', 'Duration']),
      spareParts: this.mapSpareParts(item),
      remarks: this.pickString(sources, ['remarks', 'Remarks']),
      components: this.mapComponents(item),
      selected: false,
    };
  }
}
