import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { publicApiUrl } from '../../../config/api.config';

type MappingTabKey = 'sap' | 'executive' | 'production' | 'assembly';

interface MappingTab {
  id: MappingTabKey;
  title: string;
  description: string;
  columns: [string, string, string, string, string, string];
}

interface MappingRow {
  id: string;
  tabType: MappingTabKey;
  code: string;
  source: string;
  assignment: string;
  assignmentValue: string;
  employeeId: string | null;
  assignmentOptions: MappingEmployeeOption[];
  branch: string;
  context: string;
  contextLabel: string;
  effectiveFrom: string;
  effectiveFromValue: string;
  status: string;
  sapSlpCode: number | null;
  sapDocEntry: number | null;
  splitPercentage: number;
  meta: Record<string, unknown> | null;
}

interface MappingEmployeeOption {
  id: string;
  code: string;
  label: string;
}

const COMMISSION_MAPPING_LIST_URL = publicApiUrl('commission-mapping-list');
const COMMISSION_MAPPING_SAVE_URL = publicApiUrl('commission-mapping-save');
const COMMISSION_MAPPING_VALIDATE_URL = publicApiUrl('commission-mapping-validate');
const COMMISSION_MAPPING_SYNC_SAP_URL = publicApiUrl('commission-mapping-sync-sap');

@Component({
  selector: 'app-mapping-teams',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './mapping-teams.html',
  styleUrl: './mapping-teams.css',
})
export class MappingTeamsComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly tabs: MappingTab[] = [
    {
      id: 'sap',
      title: 'SAP Employee Mapping',
      description: 'Explicitly link SAP Business One Sales Employees (OSLP) to Payroll Employee IDs before calculation.',
      columns: ['SAP SlpCode', 'SAP Sales Employee', 'Payroll Employee', 'Branch', 'Effective From', 'Status'],
    },
    {
      id: 'executive',
      title: 'Branch-Executive',
      description: 'Assign an executive pool to each branch and keep branch commission splits aligned.',
      columns: ['Branch', 'Executive Pool', 'Assigned Executive', 'Pool Split', 'Effective From', 'Status'],
    },
    {
      id: 'production',
      title: 'Production Allocation',
      description: 'Reconcile finished-goods production quantities to their commission allocation teams.',
      columns: ['Production Order', 'Finished Good', 'Production Line', 'FG Units', 'Effective From', 'Status'],
    },
    {
      id: 'assembly',
      title: 'Assembly Teams',
      description: 'Assign leads to assembly teams and verify team membership and allocation splits.',
      columns: ['Team', 'Assembly Group', 'Team Lead', 'Members / Split', 'Effective From', 'Status'],
    },
  ];

  readonly selectedTab = signal<MappingTabKey>('sap');
  readonly selectedBranch = signal('All Branches');
  readonly notice = signal('');
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly isValidating = signal(false);
  readonly isFetchingSap = signal(false);
  readonly validationMessage = signal('');
  readonly validationWarnings = signal<string[]>([]);
  readonly validationResult = signal<'valid' | 'invalid' | null>(null);
  readonly loadError = signal('');
  readonly branches = signal<string[]>([]);
  readonly rowsByTab = signal<Record<MappingTabKey, MappingRow[]>>({
    sap: [],
    executive: [],
    production: [],
    assembly: [],
  });

  readonly activeTab = computed(
    () => this.tabs.find((tab) => tab.id === this.selectedTab()) ?? this.tabs[0],
  );
  readonly visibleRows = computed(() => {
    const branch = this.selectedBranch();
    return this.rowsByTab()[this.selectedTab()].filter(
      (row) => branch === 'All Branches' || row.branch === branch,
    );
  });
  readonly mappingTotals = computed(() => {
    const sapRows = this.rowsByTab().sap;
    const mapped = sapRows.filter((row) => row.status === 'Mapped').length;
    return { total: sapRows.length, mapped, unmapped: sapRows.length - mapped };
  });
  readonly mappedSalespeople = computed(() => this.mappingTotals().mapped);

  ngOnInit(): void {
    this.loadMappings();
  }

  private loadMappings(onComplete?: (loaded: boolean) => void): void {
    this.isLoading.set(true);
    this.http.get<unknown>(COMMISSION_MAPPING_LIST_URL).subscribe({
      next: (response) => {
        const mapped = this.mapMappingListResponse(response);
        if (mapped === null) {
          this.loadError.set('Mappings could not be loaded. The API response was invalid.');
        } else {
          this.rowsByTab.set(mapped.rowsByTab);
          this.branches.set(mapped.branches);
          this.loadError.set('');
        }
        this.isLoading.set(false);
        onComplete?.(mapped !== null);
      },
      error: () => {
        this.loadError.set('Unable to load mappings and teams. Please try again later.');
        this.isLoading.set(false);
        onComplete?.(false);
      },
    });
  }

  selectTab(tab: MappingTabKey): void {
    this.selectedTab.set(tab);
    this.notice.set('');
  }

  updateAssignment(rowId: string, assignment: string): void {
    this.clearValidationResult();
    const tab = this.selectedTab();
    this.rowsByTab.update((rowsByTab) => ({
      ...rowsByTab,
      [tab]: rowsByTab[tab].map((row) =>
        row.id === rowId ? this.updateRowAssignment(row, assignment) : row,
      ),
    }));
  }

  saveMappings(): void {
    if (this.isSaving() || this.isValidating()) {
      return;
    }
    if (this.isLoading() || this.loadError()) {
      this.notice.set('Mappings cannot be saved until the list loads successfully.');
      return;
    }

    const mappings = Object.entries(this.rowsByTab()).flatMap(([tabType, rows]) =>
      rows.map((row) => this.toApiMapping(row, tabType as MappingTabKey)),
    );
    this.clearValidationResult();
    this.isSaving.set(true);
    this.notice.set('');
    this.http.post<unknown>(COMMISSION_MAPPING_SAVE_URL, { mappings }).subscribe({
      next: (response) => {
        this.isSaving.set(false);
        if (this.isRecord(response) && response['status'] === false) {
          this.notice.set(this.apiMessage(response) || 'Mapping changes could not be saved.');
          return;
        }
        this.notice.set('Mapping changes saved successfully.');
      },
      error: (error: unknown) => {
        this.isSaving.set(false);
        this.notice.set(
          this.apiErrorMessage(error, 'Unable to save mapping changes. Please try again.'),
        );
      },
    });
  }

  validateMappings(): void {
    if (this.isValidating() || this.isSaving()) {
      return;
    }

    this.clearValidationResult();
    this.isValidating.set(true);
    this.http.post<unknown>(COMMISSION_MAPPING_VALIDATE_URL, {}).subscribe({
      next: (response) => {
        this.isValidating.set(false);
        if (!this.isRecord(response)) {
          this.validationResult.set('invalid');
          this.validationMessage.set('Mapping validation returned an invalid response.');
          return;
        }

        const warnings = this.mapValidationWarnings(response['warnings']);
        const isValid = response['status'] !== false && response['valid'] === true && warnings.length === 0;
        this.validationWarnings.set(warnings);
        this.validationResult.set(isValid ? 'valid' : 'invalid');
        this.validationMessage.set(
          this.apiMessage(response) ||
            (isValid
              ? 'All SAP mappings are mapped.'
              : warnings.length
                ? 'Unmapped SAP mappings were found.'
                : 'Mapping validation failed.'),
        );
      },
      error: (error: unknown) => {
        this.isValidating.set(false);
        this.validationResult.set('invalid');
        this.validationMessage.set(
          this.apiErrorMessage(error, 'Unable to validate mappings. Please try again.'),
        );
      },
    });
  }

  fetchSapData(): void {
    if (this.isFetchingSap()) {
      return;
    }

    this.isFetchingSap.set(true);
    this.notice.set('');
    this.http.post<unknown>(COMMISSION_MAPPING_SYNC_SAP_URL, {}).subscribe({
      next: (response) => {
        if (this.isRecord(response) && response['status'] === false) {
          this.isFetchingSap.set(false);
          this.notice.set(this.apiMessage(response) || 'SAP data could not be fetched.');
          return;
        }

        this.loadMappings((loaded) => {
          this.isFetchingSap.set(false);
          this.notice.set(
            loaded
              ? this.apiMessage(this.isRecord(response) ? response : {}) ||
                'SAP data fetched successfully.'
              : 'SAP data was fetched, but mappings and teams could not be refreshed.',
          );
        });
      },
      error: (error: unknown) => {
        this.isFetchingSap.set(false);
        this.notice.set(
          this.apiErrorMessage(error, 'Unable to fetch SAP data. Please try again.'),
        );
      },
    });
  }

  exportSummary(): void {
    const rows = this.visibleRows().map((row) => [
      row.code,
      row.source,
      row.assignment || 'Unmapped',
      row.context,
      row.effectiveFrom,
      row.status,
    ]);
    const csv = [[...this.activeTab().columns], ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'commission-mapping-summary.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  private mapMappingListResponse(response: unknown): {
    rowsByTab: Record<MappingTabKey, MappingRow[]>;
    branches: string[];
  } | null {
    if (
      !this.isRecord(response) ||
      response['status'] === false ||
      !Array.isArray(response['data']) ||
      !response['data'].every((item: unknown) => this.isRecord(item)) ||
      !Array.isArray(response['employees']) ||
      !response['employees'].every((employee: unknown) => this.isRecord(employee))
    ) {
      return null;
    }

    const employeeById = new Map<string, MappingEmployeeOption>();
    const employeeByReference = new Map<string, MappingEmployeeOption>();
    const payrollEmployees = response['employees']
      .map((employee: Record<string, unknown>) => {
        const code = this.valueAsString(employee['code']);
        const name = this.valueAsString(employee['name']);
        const label = [code, name].filter(Boolean).join(' · ');
        const id = this.valueAsString(employee['id']);
        const option = { id, code, label };
        if (id && label) {
          employeeById.set(id, option);
        }
        if (code && label) {
          employeeByReference.set(code, option);
        }
        if (name && label) {
          employeeByReference.set(name, option);
        }
        return option;
      })
      .filter((employee: MappingEmployeeOption, index: number, employees: MappingEmployeeOption[]) =>
        Boolean(employee.label) && employees.findIndex((item) => item.label === employee.label) === index,
      );

    const rowsByTab: Record<MappingTabKey, MappingRow[]> = {
      sap: [],
      executive: [],
      production: [],
      assembly: [],
    };
    const branches = new Set<string>();

    for (const item of response['data'] as Record<string, unknown>[]) {
      const tab = this.mapTabKey(item['tab_type']);
      const id = this.valueAsString(item['id']);
      if (!tab || !id) {
        return null;
      }

      const branch = this.valueAsString(item['branch']);
      if (branch) {
        branches.add(branch);
      }
      const assignmentValue = this.valueAsString(item['assignment_value']);
      const employeeId = this.valueAsString(item['employee_id']);
      const assignedEmployee =
        employeeById.get(employeeId) || employeeByReference.get(assignmentValue);
      const assignment = assignedEmployee?.label || assignmentValue;
      const assignmentOptions =
        assignment && !payrollEmployees.some((employee) => employee.label === assignment)
          ? [...payrollEmployees, {
              id: employeeId,
              code: assignmentValue,
              label: assignment,
            }]
          : payrollEmployees;

      rowsByTab[tab].push({
        id,
        tabType: tab,
        code:
          this.valueAsString(item['code']) ||
          this.valueAsString(item['sap_slp_code']),
        source: this.valueAsString(item['source_label']),
        assignment,
        assignmentValue,
        employeeId: employeeId || null,
        assignmentOptions,
        branch,
        context: this.valueAsString(item['context_label']) || branch,
        contextLabel: this.valueAsString(item['context_label']),
        effectiveFromValue: this.valueAsString(item['effective_from']),
        effectiveFrom: this.formatEffectiveDate(this.valueAsString(item['effective_from'])),
        status: this.valueAsString(item['status']) || (assignment ? 'Mapped' : 'Unmapped'),
        sapSlpCode: this.valueAsNumberOrNull(item['sap_slp_code']),
        sapDocEntry: this.valueAsNumberOrNull(item['sap_doc_entry']),
        splitPercentage: this.valueAsNumberOrNull(item['split_percentage']) ?? 100,
        meta: this.isRecord(item['meta']) ? item['meta'] : null,
      });
    }

    return {
      rowsByTab,
      branches: [...branches].sort((a, b) => a.localeCompare(b)),
    };
  }

  private mapTabKey(value: unknown): MappingTabKey | null {
    if (typeof value !== 'string') {
      return null;
    }
    const key = value.toLowerCase().replace(/[^a-z]/g, '');
    if (key === 'sap' || key === 'sapemployeemapping') {
      return 'sap';
    }
    if (key === 'executive' || key === 'branchexecutive') {
      return 'executive';
    }
    if (key === 'production' || key === 'productionallocation') {
      return 'production';
    }
    if (key === 'assembly' || key === 'assemblyteams') {
      return 'assembly';
    }
    return null;
  }

  private formatEffectiveDate(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00Z`));
  }

  private valueAsString(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private updateRowAssignment(row: MappingRow, assignment: string): MappingRow {
    const employee = row.assignmentOptions.find((option) => option.label === assignment);
    return {
      ...row,
      assignment,
      assignmentValue: employee?.code ?? assignment,
      employeeId: employee?.id || null,
      status: assignment ? 'Mapped' : 'Unmapped',
    };
  }

  private toApiMapping(row: MappingRow, tabType: MappingTabKey): Record<string, unknown> {
    const mapping: Record<string, unknown> = {
      id: this.apiIdentifier(row.id),
      tab_type: tabType,
      code: row.code,
      source_label: row.source,
      employee_id: row.employeeId ? this.apiIdentifier(row.employeeId) : null,
      assignment_value: row.assignmentValue,
      branch: row.branch,
      split_percentage: row.splitPercentage,
    };
    if (row.sapSlpCode !== null) {
      mapping['sap_slp_code'] = row.sapSlpCode;
    }
    if (row.sapDocEntry !== null) {
      mapping['sap_doc_entry'] = row.sapDocEntry;
    }
    if (row.contextLabel) {
      mapping['context_label'] = row.contextLabel;
    }
    if (row.effectiveFromValue) {
      mapping['effective_from'] = row.effectiveFromValue;
    }
    if (row.meta) {
      mapping['meta'] = row.meta;
    }
    return mapping;
  }

  private apiIdentifier(value: string): number | string {
    const parsed = Number(value);
    return value.trim() !== '' && Number.isFinite(parsed) ? parsed : value;
  }

  private valueAsNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private apiErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && this.isRecord(error.error)) {
      const message = this.apiMessage(error.error);
      if (message) {
        return message;
      }
    }
    return fallback;
  }

  private apiMessage(response: Record<string, unknown>): string {
    if (typeof response['message'] === 'string') {
      return response['message'];
    }
    if (this.isRecord(response['errors'])) {
      return Object.values(response['errors'])
        .flatMap((value) =>
          Array.isArray(value)
            ? value.filter((item): item is string => typeof item === 'string')
            : [],
        )
        .join(' ');
    }
    return '';
  }

  private mapValidationWarnings(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((warning: unknown) => {
        if (typeof warning === 'string') {
          return warning;
        }
        if (this.isRecord(warning)) {
          const message =
            this.valueAsString(warning['message']) ||
            this.valueAsString(warning['warning']);
          if (message) {
            return message;
          }
          const code = this.valueAsString(warning['code']);
          const source = this.valueAsString(warning['source_label']);
          return [code, source].filter(Boolean).join(' — ');
        }
        return '';
      })
      .filter(Boolean);
  }

  private clearValidationResult(): void {
    this.validationMessage.set('');
    this.validationWarnings.set([]);
    this.validationResult.set(null);
  }
}
