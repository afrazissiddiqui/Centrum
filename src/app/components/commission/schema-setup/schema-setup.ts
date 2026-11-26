import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, CUSTOM_ELEMENTS_SCHEMA, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { publicApiUrl } from '../../../config/api.config';
import { AlertService } from '../../../services/alert.service';

type SchemeStatus = 'Active' | 'Inactive';
type SchemeRateMode = 'Percentage' | 'Fixed amount';

interface CommissionScheme {
  id: string;
  code: string;
  type: string;
  rate: number;
  rateMode: SchemeRateMode;
  branch: string;
  effectiveFrom: string;
  effectiveTo: string;
  status: SchemeStatus;
  basis: string;
  employeeTeam: string;
  minTarget: number;
  maxCap: number | null;
}

interface SchemeDraft {
  code: string;
  type: string;
  rate: number | null;
  rateMode: SchemeRateMode;
  branch: string;
  effectiveFrom: string;
  effectiveTo: string;
  basis: string;
  employeeTeam: string;
  minTarget: number | null;
  maxCap: number | null;
}

const COMMISSION_SCHEME_LIST_URL = publicApiUrl('commission-scheme-list');
const COMMISSION_SCHEME_ADD_URL = publicApiUrl('commission-scheme-add');
const COMMISSION_SCHEME_UPDATE_URL = publicApiUrl('commission-scheme-update');
const COMMISSION_SCHEME_DELETE_URL = publicApiUrl('commission-scheme-delete');

const EMPTY_DRAFT: SchemeDraft = {
  code: '',
  type: 'Employee Sales',
  rate: null,
  rateMode: 'Percentage',
  branch: 'All Branches',
  effectiveFrom: '',
  effectiveTo: '',
  basis: '% of Eligible Amount',
  employeeTeam: 'All Sales Employees',
  minTarget: null,
  maxCap: null,
};

@Component({
  selector: 'app-schema-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './schema-setup.html',
  styleUrl: './schema-setup.css',
})
export class SchemaSetupComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly alertService = inject(AlertService);
  private editorResizeStart: {
    pointerId: number;
    pointerX: number;
    editorWidth: number;
    maxWidth: number;
  } | null = null;

  readonly schemes = signal<CommissionScheme[]>([]);
  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly deletingSchemeId = signal<string | null>(null);
  readonly loadError = signal('');
  readonly searchText = signal('');
  readonly selectedCategory = signal('All');
  readonly selectedBranch = signal('All Branches');
  readonly preventOverlap = signal(true);
  readonly notice = signal('');
  readonly draft: SchemeDraft = { ...EMPTY_DRAFT };
  readonly selectedSchemeId = signal<string | null>(null);
  readonly editorWidth = signal(434);
  readonly isResizingEditor = signal(false);
  readonly editorStatus = computed(
    () => this.schemes().find((scheme) => scheme.id === this.selectedSchemeId())?.status ?? 'Active',
  );

  readonly categories = ['All', 'Sales', 'Executive', 'Production', 'Assembly'];
  readonly schemeTypes = ['Employee Sales', 'Executive', 'Production', 'Assembly'];
  readonly branches = ['All Branches', 'DHA', 'Johar Town', 'MB', 'SAM', 'RUDA'];
  readonly calculationBases = ['% of Eligible Amount', 'Rate', 'Per Unit'];
  readonly employeeTeams = [
    'All Sales Employees',
    'All Executives',
    'Production Team',
    'Assembly Teams A, B, C',
  ];

  ngOnInit(): void {
    this.http.get<unknown>(COMMISSION_SCHEME_LIST_URL).subscribe({
      next: (response) => {
        const schemes = this.mapSchemeListResponse(response);
        if (schemes === null) {
          this.loadError.set('Commission schemes could not be loaded. The API response was invalid.');
        } else {
          this.schemes.set(schemes);
          this.loadError.set('');
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set('Unable to load commission schemes. Please try again later.');
        this.isLoading.set(false);
      },
    });
  }

  startEditorResize(event: PointerEvent): void {
    if (window.matchMedia('(max-width: 1000px)').matches) {
      return;
    }

    const handle = event.currentTarget;
    const layout = handle instanceof HTMLElement
      ? handle.closest('.commission-layout')
      : null;
    if (!(handle instanceof HTMLElement) || !(layout instanceof HTMLElement)) {
      return;
    }

    const availableWidth = layout.clientWidth - 56;
    this.editorResizeStart = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      editorWidth: this.editorWidth(),
      maxWidth: Math.max(360, Math.min(640, availableWidth - 380 - 28)),
    };
    handle.setPointerCapture(event.pointerId);
    this.isResizingEditor.set(true);
    event.preventDefault();
  }

  resizeEditor(event: PointerEvent): void {
    const start = this.editorResizeStart;
    if (!start || event.pointerId !== start.pointerId) {
      return;
    }

    const delta = start.pointerX - event.clientX;
    this.editorWidth.set(Math.max(360, Math.min(start.maxWidth, start.editorWidth + delta)));
  }

  stopEditorResize(event: PointerEvent): void {
    if (this.editorResizeStart?.pointerId !== event.pointerId) {
      return;
    }
    this.editorResizeStart = null;
    this.isResizingEditor.set(false);
  }

  resizeEditorWithKeyboard(event: KeyboardEvent): void {
    const step = 24;
    let nextWidth: number | null = null;
    if (event.key === 'ArrowLeft') {
      nextWidth = this.editorWidth() + step;
    } else if (event.key === 'ArrowRight') {
      nextWidth = this.editorWidth() - step;
    } else if (event.key === 'Home') {
      nextWidth = 360;
    } else if (event.key === 'End') {
      nextWidth = 640;
    }

    if (nextWidth !== null) {
      event.preventDefault();
      this.editorWidth.set(Math.max(360, Math.min(640, nextWidth)));
    }
  }

  readonly filteredSchemes = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const category = this.selectedCategory();
    const branch = this.selectedBranch();

    return this.schemes().filter((scheme) => {
      const matchesCategory =
        category === 'All' ||
        (category === 'Sales' && scheme.type === 'Employee Sales') ||
        scheme.type === category;
      const matchesBranch =
        branch === 'All Branches' || scheme.branch === branch || scheme.branch === 'All Branches';
      const matchesQuery =
        !query ||
        [scheme.code, scheme.type, scheme.branch].some((value) =>
          value.toLowerCase().includes(query),
        );
      return matchesCategory && matchesBranch && matchesQuery;
    });
  });

  countForCategory(category: string): number {
    if (category === 'All') {
      return this.schemes().length;
    }
    return this.schemes().filter((scheme) =>
      category === 'Sales' ? scheme.type === 'Employee Sales' : scheme.type === category,
    ).length;
  }

  editScheme(scheme: CommissionScheme): void {
    this.selectedSchemeId.set(scheme.id);
    this.copyToDraft(scheme);
    this.notice.set('');
  }

  viewScheme(scheme: CommissionScheme): void {
    this.editScheme(scheme);
    this.notice.set(`${scheme.code} loaded in the editor.`);
  }

  resetDraft(): void {
    const selected = this.schemes().find((scheme) => scheme.id === this.selectedSchemeId());
    if (selected) {
      this.copyToDraft(selected);
    } else {
      Object.assign(this.draft, EMPTY_DRAFT);
    }
    this.notice.set('');
  }

  saveScheme(): void {
    if (this.isSaving()) {
      return;
    }

    const code = this.draft.code.trim();
    if (!code || !this.draft.effectiveFrom || this.draft.rate === null || this.draft.rate < 0) {
      this.notice.set('Enter a scheme code, commission rate, and effective-from date.');
      return;
    }
    if (
      this.draft.effectiveTo &&
      this.draft.effectiveTo < this.draft.effectiveFrom
    ) {
      this.notice.set('Effective To must be on or after Effective From.');
      return;
    }

    const selectedId = this.selectedSchemeId();
    const collision = this.schemes().some(
      (scheme) =>
        scheme.id !== selectedId &&
        scheme.status === 'Active' &&
        scheme.type === this.draft.type &&
        (scheme.branch === this.draft.branch ||
          scheme.branch === 'All Branches' ||
          this.draft.branch === 'All Branches') &&
        this.datesOverlap(
          this.draft.effectiveFrom,
          this.draft.effectiveTo,
          scheme.effectiveFrom,
          scheme.effectiveTo,
        ),
    );
    if (this.preventOverlap() && collision) {
      this.notice.set('An active scheme of this type already overlaps this branch and date range.');
      return;
    }

    const payload = {
      code,
      type: this.draft.type,
      basis: this.draft.basis,
      rate: this.draft.rate,
      rate_mode: this.draft.rateMode,
      branch: this.draft.branch,
      employee_team: this.draft.employeeTeam,
      min_target: this.draft.minTarget ?? 0,
      max_cap: this.draft.maxCap,
      effective_from: this.draft.effectiveFrom,
      effective_to: this.draft.effectiveTo || null,
      prevent_overlap: this.preventOverlap(),
      status: 'Active' as SchemeStatus,
    };

    this.isSaving.set(true);
    this.notice.set('');
    const url = selectedId
      ? `${COMMISSION_SCHEME_UPDATE_URL}/${encodeURIComponent(selectedId)}`
      : COMMISSION_SCHEME_ADD_URL;
    this.http.post<unknown>(url, payload).subscribe({
      next: (response) => {
        this.isSaving.set(false);
        if (this.isRecord(response) && response['status'] === false) {
          this.notice.set(this.apiMessage(response) || 'The commission scheme could not be saved.');
          return;
        }

        const record: CommissionScheme = {
          id: selectedId ?? this.savedId(response) ?? `scheme-${Date.now()}`,
          code,
          type: payload.type,
          rate: payload.rate,
          rateMode: payload.rate_mode,
          branch: payload.branch,
          effectiveFrom: payload.effective_from,
          effectiveTo: payload.effective_to ?? '',
          status: payload.status,
          basis: payload.basis,
          employeeTeam: payload.employee_team,
          minTarget: payload.min_target,
          maxCap: payload.max_cap,
        };
        this.schemes.update((schemes) =>
          selectedId
            ? schemes.map((scheme) => (scheme.id === selectedId ? record : scheme))
            : [record, ...schemes],
        );
        this.selectedSchemeId.set(record.id);
        this.copyToDraft(record);
        this.notice.set(`${code} saved successfully.`);
      },
      error: (error: unknown) => {
        this.isSaving.set(false);
        this.notice.set(
          this.apiErrorMessage(error, 'Unable to save the commission scheme. Please try again.'),
        );
      },
    });
  }

  async deleteScheme(scheme: CommissionScheme): Promise<void> {
    if (this.isSaving() || this.deletingSchemeId() !== null) {
      return;
    }
    if (!scheme.id) {
      this.alertService.error('Delete Failed', 'Unable to delete this scheme: missing scheme id.');
      return;
    }

    const confirmation = await this.alertService.confirm(
      'Delete commission scheme?',
      `Remove ${scheme.code} from the configured schemes?`,
    );
    if (!confirmation.isConfirmed) {
      return;
    }

    this.deletingSchemeId.set(scheme.id);
    this.notice.set('');
    this.http.delete<unknown>(
      `${COMMISSION_SCHEME_DELETE_URL}/${encodeURIComponent(scheme.id)}`,
    ).subscribe({
      next: (response) => {
        this.deletingSchemeId.set(null);
        if (this.isRecord(response) && response['status'] === false) {
          this.alertService.error(
            'Delete Failed',
            this.apiMessage(response) || 'The commission scheme could not be deleted.',
          );
          return;
        }

        this.schemes.update((schemes) => schemes.filter((item) => item.id !== scheme.id));
        if (this.selectedSchemeId() === scheme.id) {
          this.selectedSchemeId.set(null);
          Object.assign(this.draft, EMPTY_DRAFT);
        }
        this.alertService.success('Deleted', `${scheme.code} removed successfully.`);
      },
      error: (error: unknown) => {
        this.deletingSchemeId.set(null);
        this.alertService.error(
          'Delete Failed',
          this.apiErrorMessage(error, 'Unable to delete the commission scheme. Please try again.'),
        );
      },
    });
  }

  fetchSapData(): void {
    this.notice.set('SAP data fetch is a demo placeholder; no SAP connection is configured.');
  }

  exportSummary(): void {
    const headers = ['Code', 'Type', 'Rate', 'Branch / Scope', 'Effective From', 'Effective To', 'Status'];
    const rows = this.filteredSchemes().map((scheme) => [
      scheme.code,
      scheme.type,
      this.rateLabel(scheme),
      scheme.branch,
      scheme.effectiveFrom,
      scheme.effectiveTo || 'Open',
      scheme.status,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'commission-scheme-summary.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  rateLabel(scheme: CommissionScheme): string {
    return scheme.rateMode === 'Percentage' ? `${scheme.rate.toFixed(1)}%` : `PKR ${scheme.rate}`;
  }

  validityLabel(scheme: CommissionScheme): string {
    return `${this.formatDate(scheme.effectiveFrom)} – ${
      scheme.effectiveTo ? this.formatDate(scheme.effectiveTo) : 'Open'
    }`;
  }

  private copyToDraft(scheme: CommissionScheme): void {
    Object.assign(this.draft, {
      code: scheme.code,
      type: scheme.type,
      rate: scheme.rate,
      rateMode: scheme.rateMode,
      branch: scheme.branch,
      effectiveFrom: scheme.effectiveFrom,
      effectiveTo: scheme.effectiveTo,
      basis: scheme.basis,
      employeeTeam: scheme.employeeTeam,
      minTarget: scheme.minTarget,
      maxCap: scheme.maxCap,
    });
  }

  private mapSchemeListResponse(response: unknown): CommissionScheme[] | null {
    if (
      !this.isRecord(response) ||
      response['status'] === false ||
      !Array.isArray(response['data']) ||
      !response['data'].every((item: unknown) => this.isRecord(item))
    ) {
      return null;
    }

    return response['data'].map((item: Record<string, unknown>) => ({
      id: this.valueAsString(item['id']),
      code: this.valueAsString(item['code']),
      type: this.valueAsString(item['type']),
      rate: this.valueAsNumber(item['rate']),
      rateMode: item['rate_mode'] === 'Fixed amount' ? 'Fixed amount' : 'Percentage',
      branch: this.valueAsString(item['branch']),
      effectiveFrom: this.valueAsString(item['effective_from']),
      effectiveTo: this.valueAsString(item['effective_to']),
      status: item['status'] === 'Inactive' ? 'Inactive' : 'Active',
      basis: this.valueAsString(item['basis']),
      employeeTeam: this.valueAsString(item['employee_team']),
      minTarget: this.valueAsNumber(item['min_target']),
      maxCap: item['max_cap'] === null ? null : this.valueAsNumber(item['max_cap']),
    }));
  }

  private valueAsString(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  private valueAsNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private savedId(response: unknown): string | null {
    if (!this.isRecord(response)) {
      return null;
    }
    const data = this.isRecord(response['data']) ? response['data'] : response;
    return data['id'] === null || data['id'] === undefined ? null : String(data['id']);
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
      const messages = Object.values(response['errors']).flatMap((value) =>
        Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [],
      );
      return messages.join(' ');
    }
    return '';
  }

  private datesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
    return startA <= (endB || '9999-12-31') && startB <= (endA || '9999-12-31');
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00Z`));
  }

}
