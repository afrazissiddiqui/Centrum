import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

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

const INITIAL_SCHEMES: CommissionScheme[] = [
  {
    id: '1',
    code: 'SCH-SLS-01',
    type: 'Employee Sales',
    rate: 2,
    rateMode: 'Percentage',
    branch: 'All Branches',
    effectiveFrom: '2026-07-01',
    effectiveTo: '',
    status: 'Active',
    basis: '% of Eligible Amount',
    employeeTeam: 'All Sales Employees',
    minTarget: 100000,
    maxCap: null,
  },
  {
    id: '2',
    code: 'SCH-EXC-01',
    type: 'Executive',
    rate: 1.5,
    rateMode: 'Percentage',
    branch: 'Lahore Main',
    effectiveFrom: '2026-01-01',
    effectiveTo: '',
    status: 'Active',
    basis: '% of Eligible Amount',
    employeeTeam: 'All Executives',
    minTarget: 150000,
    maxCap: 500000,
  },
  {
    id: '3',
    code: 'SCH-PRD-01',
    type: 'Production',
    rate: 5,
    rateMode: 'Fixed amount',
    branch: 'Faisalabad Plant',
    effectiveFrom: '2026-08-01',
    effectiveTo: '',
    status: 'Active',
    basis: 'Per Unit',
    employeeTeam: 'Production Team',
    minTarget: 500,
    maxCap: null,
  },
  {
    id: '4',
    code: 'SCH-ASM-01',
    type: 'Assembly',
    rate: 1,
    rateMode: 'Percentage',
    branch: 'Teams A, B, C',
    effectiveFrom: '2026-09-01',
    effectiveTo: '',
    status: 'Active',
    basis: '% of Eligible Amount',
    employeeTeam: 'Assembly Teams A, B, C',
    minTarget: 80000,
    maxCap: null,
  },
  {
    id: '5',
    code: 'SCH-SLS-00',
    type: 'Employee Sales',
    rate: 1.75,
    rateMode: 'Percentage',
    branch: 'All Branches',
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-06-30',
    status: 'Inactive',
    basis: '% of Eligible Amount',
    employeeTeam: 'All Sales Employees',
    minTarget: 80000,
    maxCap: null,
  },
];

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

const INITIAL_DRAFT: SchemeDraft = {
  code: 'SCH-SLS-01',
  type: 'Employee Sales',
  rate: 2,
  rateMode: 'Percentage',
  branch: 'All Branches',
  effectiveFrom: '2026-07-01',
  effectiveTo: '',
  basis: '% of Eligible Amount',
  employeeTeam: 'All Sales Employees',
  minTarget: 100000,
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
export class SchemaSetupComponent {
  private editorResizeStart: {
    pointerId: number;
    pointerX: number;
    editorWidth: number;
    maxWidth: number;
  } | null = null;

  readonly schemes = signal<CommissionScheme[]>(INITIAL_SCHEMES);
  readonly searchText = signal('');
  readonly selectedCategory = signal('All');
  readonly selectedBranch = signal('All Branches');
  readonly preventOverlap = signal(true);
  readonly notice = signal('');
  readonly draft: SchemeDraft = { ...INITIAL_DRAFT };
  readonly selectedSchemeId = signal<string | null>(INITIAL_SCHEMES[0].id);
  readonly editorWidth = signal(434);
  readonly isResizingEditor = signal(false);
  readonly editorStatus = computed(
    () => this.schemes().find((scheme) => scheme.id === this.selectedSchemeId())?.status ?? 'Active',
  );

  readonly categories = ['All', 'Sales', 'Executive', 'Production', 'Assembly'];
  readonly schemeTypes = ['Employee Sales', 'Executive', 'Production', 'Assembly'];
  readonly branches = ['All Branches', 'Lahore Main', 'Faisalabad Plant', 'Teams A, B, C'];
  readonly calculationBases = ['% of Eligible Amount', 'Flat Amount', 'Per Unit'];
  readonly employeeTeams = [
    'All Sales Employees',
    'All Executives',
    'Production Team',
    'Assembly Teams A, B, C',
  ];

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

    const record: CommissionScheme = {
      id: selectedId ?? `scheme-${Date.now()}`,
      code,
      type: this.draft.type,
      rate: this.draft.rate,
      rateMode: this.draft.rateMode,
      branch: this.draft.branch,
      effectiveFrom: this.draft.effectiveFrom,
      effectiveTo: this.draft.effectiveTo,
      status: this.draft.effectiveTo && this.draft.effectiveTo < this.today() ? 'Inactive' : 'Active',
      basis: this.draft.basis,
      employeeTeam: this.draft.employeeTeam,
      minTarget: this.draft.minTarget ?? 0,
      maxCap: this.draft.maxCap,
    };

    this.schemes.update((schemes) =>
      selectedId
        ? schemes.map((scheme) => (scheme.id === selectedId ? record : scheme))
        : [record, ...schemes],
    );
    this.selectedSchemeId.set(record.id);
    this.copyToDraft(record);
    this.notice.set(`${code} saved successfully.`);
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

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
