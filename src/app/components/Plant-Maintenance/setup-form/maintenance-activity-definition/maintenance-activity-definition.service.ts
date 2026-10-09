import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { apiUrl } from '../../../../config/api.config';
import {
  PlantMaintenanceMachineRecordBase,
  resolveMachineIdentity,
} from '../plant-maintenance-machine.model';

export interface MaintenanceActivityInspectionLine {
  itemsToBeInspected: string;
  whatToCheck: string;
  instructions: string;
}

export interface MaintenanceActivityInspectionLinePayload {
  itemsToBeInspected: string;
  whatToCheck: string;
  instructions: string;
}

export interface MaintenanceActivityComponent {
  name: string;
  inspectionLines: MaintenanceActivityInspectionLine[];
}

export interface MaintenanceActivityMachineRecord extends PlantMaintenanceMachineRecordBase {
  maintenanceNature: string;
  plantMaintenanceFrequency: string;
  plantMaintenanceType: string;
  components: MaintenanceActivityComponent[];
}

export interface MaintenanceActivityMatchCriteria {
  machineId: string;
  machineName?: string;
  machineType: string;
  maintenanceNature: string;
  plantMaintenanceFrequency: string;
  plantMaintenanceType: string;
}

type MaintenanceActivityProfileField =
  | 'machineType'
  | 'maintenanceNature'
  | 'plantMaintenanceFrequency'
  | 'plantMaintenanceType';

export interface MaintenanceActivityDefinitionInput {
  machineId: string;
  machineName: string;
  /** Required by API; resolved from SAP item or existing record, not shown in the form. */
  machineType?: string;
  location?: string;
  maintenanceNature: string;
  plantMaintenanceFrequency: string;
  plantMaintenanceType: string;
  components: MaintenanceActivityComponent[];
}

export interface MaintenanceActivityDefinitionPayload {
  machine_id: string;
  machine_name: string;
  machine_type: string;
  location?: string;
  maintenance_nature: string;
  plant_maintenance_frequency: string;
  plant_maintenance_type: string;
  components: Array<{
    name: string;
    inspectionLines: MaintenanceActivityInspectionLinePayload[];
  }>;
}

export interface MaintenanceActivityApiResponse {
  status?: boolean;
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

const MAINTENANCE_ACTIVITY_DEFINITION_LIST_URL = apiUrl('maintenance-activity-definition-list');
const MAINTENANCE_ACTIVITY_DEFINITION_ADD_URL = apiUrl('maintenance-activity-definition-add');
const MAINTENANCE_ACTIVITY_DEFINITION_DETAIL_URL = apiUrl('maintenance-activity-definition-detail');
const MAINTENANCE_ACTIVITY_DEFINITION_UPDATE_URL = apiUrl('maintenance-activity-definition-update');
const MAINTENANCE_ACTIVITY_DEFINITION_DELETE_URL = apiUrl('maintenance-activity-definition-delete');

function mapInspectionLineForPayload(
  line: MaintenanceActivityInspectionLine,
): MaintenanceActivityInspectionLinePayload {
  return {
    itemsToBeInspected: line.itemsToBeInspected.trim(),
    whatToCheck: line.whatToCheck.trim(),
    instructions: line.instructions.trim(),
  };
}

function mapInspectionLinesForPayload(
  lines: MaintenanceActivityInspectionLine[],
): MaintenanceActivityInspectionLinePayload[] {
  return lines
    .map((line) => mapInspectionLineForPayload(line))
    .filter((line) => line.itemsToBeInspected || line.whatToCheck || line.instructions);
}

export function buildMaintenanceActivityPayload(
  entry: MaintenanceActivityDefinitionInput,
): MaintenanceActivityDefinitionPayload {
  return {
    machine_id: entry.machineId.trim(),
    machine_name: entry.machineName.trim(),
    machine_type: (entry.machineType ?? '').trim(),
    location: (entry.location ?? '').trim(),
    maintenance_nature: entry.maintenanceNature.trim(),
    plant_maintenance_frequency: entry.plantMaintenanceFrequency.trim(),
    plant_maintenance_type: entry.plantMaintenanceType.trim(),
    components: entry.components
      .filter((component) => component.name.trim())
      .map((component) => ({
        name: component.name.trim(),
        inspectionLines: mapInspectionLinesForPayload(component.inspectionLines),
      })),
  };
}

@Injectable({ providedIn: 'root' })
export class MaintenanceActivityDefinitionService {
  private readonly http = inject(HttpClient);
  private readonly _records = signal<MaintenanceActivityMachineRecord[]>([]);

  readonly records = this._records.asReadonly();

  fetchMaintenanceActivityDefinitions(): Observable<MaintenanceActivityMachineRecord[]> {
    return this.http.get<unknown>(MAINTENANCE_ACTIVITY_DEFINITION_LIST_URL).pipe(
      map((response) => this.extractApiItems(response).map((item) => this.mapApiItemToRecord(item))),
      tap((records) => this._records.set(records)),
    );
  }

  fetchMaintenanceActivityDefinitionDetail(
    id: string | number,
  ): Observable<MaintenanceActivityMachineRecord> {
    const identifier = encodeURIComponent(String(id));
    return this.http
      .get<unknown>(`${MAINTENANCE_ACTIVITY_DEFINITION_DETAIL_URL}/${identifier}`)
      .pipe(map((response) => this.mapDetailResponse(response, id)));
  }

  addMaintenanceActivityDefinition(
    entry: MaintenanceActivityDefinitionInput,
  ): Observable<MaintenanceActivityApiResponse> {
    return this.http.post<MaintenanceActivityApiResponse>(
      MAINTENANCE_ACTIVITY_DEFINITION_ADD_URL,
      buildMaintenanceActivityPayload(entry),
    );
  }

  updateMaintenanceActivityDefinition(
    id: string | number,
    entry: MaintenanceActivityDefinitionInput,
  ): Observable<MaintenanceActivityApiResponse> {
    const identifier = encodeURIComponent(String(id));
    return this.http.post<MaintenanceActivityApiResponse>(
      `${MAINTENANCE_ACTIVITY_DEFINITION_UPDATE_URL}/${identifier}`,
      buildMaintenanceActivityPayload(entry),
    );
  }

  deleteMaintenanceActivityDefinition(
    id: string | number,
  ): Observable<MaintenanceActivityApiResponse> {
    const identifier = encodeURIComponent(String(id));
    return this.http.delete<MaintenanceActivityApiResponse>(
      `${MAINTENANCE_ACTIVITY_DEFINITION_DELETE_URL}/${identifier}`,
    );
  }

  removeMaintenanceActivityRecord(record: MaintenanceActivityMachineRecord): void {
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

  getById(id: string): MaintenanceActivityMachineRecord | undefined {
    return this._records().find((r) => r.id === id);
  }

  getByMachineId(machineId: string): MaintenanceActivityMachineRecord | undefined {
    return this.getAllByMachineId(machineId)[0];
  }

  getAllByMachineId(machineId: string, machineName = ''): MaintenanceActivityMachineRecord[] {
    const identity = resolveMachineIdentity(machineId, machineName);
    const idKey = identity.machineId.toLowerCase();
    const nameKey = identity.machineName.toLowerCase();
    return this._records().filter((r) => {
      const existing = resolveMachineIdentity(r.machineId, r.machineName);
      return (
        existing.machineId.toLowerCase() === idKey ||
        existing.machineName.toLowerCase() === nameKey
      );
    });
  }

  findByCriteria(
    criteria: MaintenanceActivityMatchCriteria,
  ): MaintenanceActivityMachineRecord | undefined {
    const identity = resolveMachineIdentity(criteria.machineId, criteria.machineName ?? '');
    const idKey = identity.machineId.toLowerCase();
    const nameKey = identity.machineName.toLowerCase();
    return this._records().find((r) => {
      const existing = resolveMachineIdentity(r.machineId, r.machineName);
      const sameMachine =
        existing.machineId.toLowerCase() === idKey ||
        existing.machineName.toLowerCase() === nameKey;
      if (!sameMachine) {
        return false;
      }
      return (
        this.normalizeKey(r.machineType) === this.normalizeKey(criteria.machineType) &&
        this.normalizeKey(r.maintenanceNature) === this.normalizeKey(criteria.maintenanceNature) &&
        this.normalizeKey(r.plantMaintenanceFrequency) ===
          this.normalizeKey(criteria.plantMaintenanceFrequency) &&
        this.normalizeKey(r.plantMaintenanceType) ===
          this.normalizeKey(criteria.plantMaintenanceType)
      );
    });
  }

  getProfileFieldValues(
    records: MaintenanceActivityMachineRecord[],
    field: MaintenanceActivityProfileField,
    filters: Partial<Record<MaintenanceActivityProfileField, string>> = {},
  ): string[] {
    const filtered = records.filter((record) =>
      (Object.entries(filters) as Array<[MaintenanceActivityProfileField, string]>).every(
        ([key, value]) => !value.trim() || this.normalizeKey(record[key]) === this.normalizeKey(value),
      ),
    );
    const values = filtered.map((record) => record[field].trim()).filter(Boolean);
    return [...new Set(values)];
  }

  private normalizeKey(value: string): string {
    return value.trim().toLowerCase();
  }

  private mapDetailResponse(
    response: unknown,
    id: string | number,
  ): MaintenanceActivityMachineRecord {
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

    throw new Error('Maintenance activity definition not found');
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
      'maintenance_activity_definitions',
      'maintenanceActivityDefinitions',
      'maintenanceActivityDefinitionList',
      'maintenance_activity_definition_list',
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

    if (
      obj['machine_id'] ||
      obj['machineId'] ||
      obj['machine_name'] ||
      obj['machineName']
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

  private mapInspectionLine(raw: Record<string, unknown>): MaintenanceActivityInspectionLine {
    return {
      itemsToBeInspected: this.pickString([raw], [
        'itemsToBeInspected',
        'items_to_be_inspected',
        'ItemsToBeInspected',
      ]),
      whatToCheck: this.pickString([raw], ['whatToCheck', 'what_to_check', 'WhatToCheck']),
      instructions: this.pickString([raw], ['instructions', 'Instructions']),
    };
  }

  private mapComponents(item: Record<string, unknown>): MaintenanceActivityComponent[] {
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

  private mapApiItemToRecord(item: Record<string, unknown>): MaintenanceActivityMachineRecord {
    const sources = [item];
    const id = this.pickString(sources, [
      'id',
      'Id',
      'maintenance_activity_definition_id',
      'maintenanceActivityDefinitionId',
    ]);

    return {
      id,
      machineId: this.pickString(sources, ['machine_id', 'machineId', 'MachineId']) || '—',
      machineName: this.pickString(sources, ['machine_name', 'machineName', 'MachineName']) || '—',
      machineType: this.pickString(sources, ['machine_type', 'machineType', 'MachineType']) || '—',
      location:
        this.pickString(sources, ['location', 'Location', 'machine_location', 'machineLocation', 'MachineLocation']) ||
        '—',
      maintenanceNature:
        this.pickString(sources, ['maintenance_nature', 'maintenanceNature', 'MaintenanceNature']) ||
        '—',
      plantMaintenanceFrequency:
        this.pickString(sources, [
          'plant_maintenance_frequency',
          'plantMaintenanceFrequency',
          'PlantMaintenanceFrequency',
        ]) || '—',
      plantMaintenanceType:
        this.pickString(sources, [
          'plant_maintenance_type',
          'plantMaintenanceType',
          'PlantMaintenanceType',
        ]) || '—',
      components: this.mapComponents(item),
      selected: false,
    };
  }
}
