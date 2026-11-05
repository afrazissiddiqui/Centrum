import { Component, DestroyRef, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { ColumnResizeDirective } from '../../../column-resize';
import { PageToolbarComponent } from '../../page-toolbar/page-toolbar';
import { SidebarComponent, SidebarItem, SidebarSection } from '../../sidebar/sidebar';
import { AlertService } from '../../../services/alert.service';
import {
  ApplicationFormAttachmentMeta,
  ApplicationFormRemuneration,
  ApplicationFormRecord,
  ApplicationFormService,
} from '../../../services/application-form.service';
import { ShellbarSearchService } from '../../../services/shellbar-search.service';
import { buildCompactPageNumbers } from '../../../utils/pagination.util';
import { connectShellbarSearch } from '../../../utils/shellbar-search-connect.util';
import { displayDateOnly } from '../../../utils/date-format.util';
import { glAccountBranchLabel } from '../../setup/gl-account-determination/gl-account-branch.options';
import { PermissionService } from '../../../services/permission.service';
import {
  APPLICATION_FORM_TABLE_FILTER,
  TableFilterComponent,
  TableFilterService,
} from '../../table-filter';

const APPLICATION_FORM_MODULE = 'application_form';

type ApplicationFormColumnKey = Exclude<keyof ApplicationFormRecord, 'detail' | 'selected'>;

interface ColumnConfig {
  key: ApplicationFormColumnKey;
  label: string;
  visible: boolean;
}

interface ApplicationDetailViewState {
  open: boolean;
  loading: boolean;
  record: ApplicationFormRecord | null;
}

@Component({
  selector: 'app-recruitment',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ColumnResizeDirective,
    SidebarComponent,
    PageToolbarComponent,
    TableFilterComponent,
  ],
  templateUrl: './Application-Form.html',
  styleUrls: ['./Application-Form.css'],
})
export class RecruitmentComponent implements OnInit {

  readonly applicationFormTableFilter = APPLICATION_FORM_TABLE_FILTER;

  readonly loading = signal(true);
  readonly skeletonRows = [1, 2, 3, 4, 5, 6];
  private readonly destroyRef = inject(DestroyRef);
  private readonly shellbarSearch = inject(ShellbarSearchService);
  readonly detailViewState$ = new BehaviorSubject<ApplicationDetailViewState>({
    open: false,
    loading: false,
    record: null,
  });

  constructor(
    private applicationFormService: ApplicationFormService,
    private readonly alertService: AlertService,
    private readonly permissionService: PermissionService,
    readonly tableFilter: TableFilterService,
  ) {
    connectShellbarSearch(this.shellbarSearch, this.destroyRef, {
      getSearchText: () => this.searchText,
      setSearchText: (value) => { this.searchText = value; },
      onSearchChange: () => this.onSearchChange(),
    });
  }

  get canAddApplication(): boolean {
    return this.permissionService.can(APPLICATION_FORM_MODULE, 'add');
  }

  get canViewApplication(): boolean {
    return this.permissionService.can(APPLICATION_FORM_MODULE, 'view');
  }

  get canUpdateApplication(): boolean {
    return this.permissionService.can(APPLICATION_FORM_MODULE, 'update');
  }

  get canDeleteApplication(): boolean {
    return this.permissionService.can(APPLICATION_FORM_MODULE, 'delete');
  }

  get showApplicationActions(): boolean {
    return this.canViewApplication || this.canUpdateApplication || this.canDeleteApplication;
  }

  ngOnInit(): void {
    this.loading.set(true);
    this.applicationFormService.fetchEmployeeProfiles().subscribe({
      next: () => this.loading.set(false),
      error: () => {
        this.loading.set(false);
        this.alertService.error('Error', 'Under Construction');
      },
    });
  }

  Math = Math;

  sidebarItems: SidebarItem[] = [
    {
      id: 'recruitment-list',
      label: 'Recruitment List',
      route: '/recruitment',
      access: { moduleSlug: APPLICATION_FORM_MODULE, action: 'list' },
    },
  ];

  sidebarSections: SidebarSection[] = [
    {
      id: 'recruitment-actions',
      title: 'Recruitment Actions',
      items: [
        {
          id: 'Job-Specification-Form',
          label: 'Job Specification Form',
          route: '/job-specification-form',
          access: { moduleSlug: 'job_specification', action: 'list' },
        },
        {
          id: 'create-requisition',
          label: 'Application Form / Employee Profile',
          route: '/recruitment',
          access: { moduleSlug: APPLICATION_FORM_MODULE, action: 'list' },
        },
      ],
    },
  ];

  activeSidebarItemId = 'recruitment-list';
  sidebarCollapsed = signal(false);

  columns: ColumnConfig[] = [
    { key: 'EmployeeCode', label: 'Employee ID', visible: true },
    { key: 'EmployeeName', label: 'Person Name', visible: true },
    { key: 'Department', label: 'Department', visible: true },
    { key: 'EmployeeNature', label: 'Employee Nature', visible: true },
    { key: 'Designation', label: 'Designation', visible: true },
    { key: 'ReportingManager', label: 'Reporting Manager', visible: true },
    { key: 'EmploymentStatus', label: 'Employment Status', visible: true },
    { key: 'EmploymentCategory', label: 'Employment Category', visible: true },
    { key: 'status', label: 'Status', visible: true },

  ];

  get sirList(): ApplicationFormRecord[] {
    return this.applicationFormService.getApplicationRecords();
  }

  get visibleColumns(): ColumnConfig[] {
    return this.columns.filter((col) => col.visible);
  }

  // Searching, Sorting, Pagination State
  searchText: string = '';
  sortColumn: ApplicationFormColumnKey = 'EmployeeCode';
  sortDirection: 'asc' | 'desc' = 'asc';
  currentPage: number = 1;
  pageSize: number = 10;
  pageSizeOptions: number[] = [5, 10, 20, 50];

  showColumnPanel = false;
  showDialog = false;
  activeTab: 'columns' = 'columns';

  toggleColumnPanel() {
    this.showColumnPanel = !this.showColumnPanel;
  }

  openDialog() {
    this.showDialog = true;
  }

  closeDialog() {
    this.showDialog = false;
  }

  toggleAll(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.filteredList.forEach(s => s.selected = checked);
  }

  isAllSelected(): boolean {
    return this.filteredList.length > 0 && this.filteredList.every(s => s.selected);
  }

  getSelectedCount(): number {
    return this.sirList.filter(x => x.selected).length;
  }

  // Getters for searching, sorting, and pagination
  get filteredList(): ApplicationFormRecord[] {
    let list = this.tableFilter.filterItems([...this.sirList], this.applicationFormTableFilter);

    // Search
    if (this.searchText) {
      const search = this.searchText.toLowerCase();
      list = list.filter(item =>
        String(item.EmployeeCode ?? '').toLowerCase().includes(search) ||
        String(item.EmployeeName ?? '').toLowerCase().includes(search) ||
        String(item.detail?.personalInfo?.personName ?? '').toLowerCase().includes(search) ||
        String(item.Department ?? '').toLowerCase().includes(search) ||
        String(item.EmployeeNature ?? '').toLowerCase().includes(search) ||
        String(item.Designation ?? '').toLowerCase().includes(search) ||
        String(item.ReportingManager ?? '').toLowerCase().includes(search) ||
        String(item.EmploymentStatus ?? '').toLowerCase().includes(search) ||
        String(item.EmploymentCategory ?? '').toLowerCase().includes(search)
      );
    }

    // Sort
    list.sort((a, b) => {
      const valA = a[this.sortColumn];
      const valB = b[this.sortColumn];

      if (valA === undefined || valB === undefined) return 0;

      let comparison = 0;
      if (valA > valB) comparison = 1;
      else if (valA < valB) comparison = -1;

      return this.sortDirection === 'asc' ? comparison : -comparison;
    });

    return list;
  }

  get paginatedList(): ApplicationFormRecord[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredList.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredList.length / this.pageSize);
  }

  get pages(): number[] {
    return buildCompactPageNumbers(this.totalPages, this.currentPage);
  }

  // Actions
  onSearchChange() {
    this.shellbarSearch.syncQuery(this.searchText);
    this.currentPage = 1; // Reset to first page on search
  }

  onTableFilterApplied(): void {
    this.currentPage = 1;
  }

  hasActiveListFilters(): boolean {
    return this.tableFilter.hasActive(this.applicationFormTableFilter);
  }

  sortData(column: ApplicationFormColumnKey) {

    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
  }

  setPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  onPageSizeChange() {
    this.currentPage = 1;
  }

  openApplicationDetail(record: ApplicationFormRecord) {
    if (!this.permissionService.assertCan(APPLICATION_FORM_MODULE, 'view')) {
      return;
    }

    const viewId = record.apiId ?? record.EmployeeCode;
    this.detailViewState$.next({ open: true, loading: true, record });

    this.applicationFormService.fetchEmployeeProfileDetail(viewId).subscribe({
      next: (fullRecord) => {
        this.detailViewState$.next({
          open: true,
          loading: false,
          record: {
            ...fullRecord,
            selected: record.selected,
          },
        });
      },
      error: (error: unknown) => {
        this.detailViewState$.next({ open: false, loading: false, record: null });
        const errorMessage =
          (error as { error?: { message?: string } })?.error?.message ||
          (error as { message?: string })?.message ||
          'Failed to load employee details.';
        this.alertService.error('Load Failed', errorMessage);
      },
    });
  }

  closeApplicationDetail() {
    this.detailViewState$.next({ open: false, loading: false, record: null });
  }

  displayDash(value: string | number | undefined | null): string {
    if (value === undefined || value === null) {
      return '—';
    }
    const s = String(value).trim();
    return s === '' ? '—' : s;
  }

  private parseCurrencyNumber(value: string | number | undefined | null): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const sanitized = String(value).replace(/,/g, '').trim();
    if (!sanitized) {
      return null;
    }
    const parsed = Number.parseFloat(sanitized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private formatCurrencyNumber(value: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }

  displayBankSalaryPercentage(remuneration: ApplicationFormRemuneration): string {
    const explicit = remuneration.taxPercentage?.trim();
    if (explicit) {
      return this.displayDash(explicit);
    }
    const bankPercent = this.parseCurrencyNumber(remuneration.taxPercentage);
    const cashPercent = this.parseCurrencyNumber(remuneration.cashSalaryPercentage);
    if (bankPercent !== null && cashPercent !== null) {
      return this.displayDash(String(bankPercent));
    }
    if (cashPercent !== null) {
      return this.displayDash(String(100 - cashPercent));
    }
    return '—';
  }

  displayCashSalaryPercentage(remuneration: ApplicationFormRemuneration): string {
    const explicit = remuneration.cashSalaryPercentage?.trim();
    if (explicit) {
      return this.displayDash(explicit);
    }
    const bankPercent = this.parseCurrencyNumber(remuneration.taxPercentage);
    if (bankPercent !== null) {
      const remaining = Math.max(0, 100 - bankPercent);
      return this.displayDash(String(remaining));
    }
    return '—';
  }

  displayBankSalaryAmount(remuneration: ApplicationFormRemuneration): string {
    const salary = this.parseCurrencyNumber(remuneration.basicSalary);
    const bankPercent = this.parseCurrencyNumber(remuneration.taxPercentage);
    if (salary === null || bankPercent === null) {
      return '—';
    }
    const amount = (salary * bankPercent) / 100;
    return this.displayDash(this.formatCurrencyNumber(amount));
  }

  displayCashSalaryAmount(remuneration: ApplicationFormRemuneration): string {
    const salary = this.parseCurrencyNumber(remuneration.basicSalary);
    const bankPercent = this.parseCurrencyNumber(remuneration.taxPercentage);
    if (salary === null || bankPercent === null) {
      return '—';
    }
    const amount = salary - (salary * bankPercent) / 100;
    return this.displayDash(this.formatCurrencyNumber(amount));
  }

  branchLabel(code: string | undefined | null): string {
    const label = glAccountBranchLabel(code ?? '');
    return label ? this.displayDash(label) : this.displayDash(code);
  }

  resolveAttachmentFor(attachment: ApplicationFormAttachmentMeta): string {
    return this.applicationFormService.resolveAttachmentForLabel(attachment);
  }

  displayMaximumLoanCapacity(remuneration: ApplicationFormRemuneration): string {
    const value =
      remuneration.loanAmountAllowed?.trim() || remuneration.maximumLoanCapacity?.trim() || '';
    return this.displayDash(value);
  }

  displayMaximumAdvanceCapacity(remuneration: ApplicationFormRemuneration): string {
    return this.displayDash(this.applicationFormService.resolveMaximumAdvanceCapacity(remuneration));
  }

  displayDate(value: string | number | undefined | null): string {
    return displayDateOnly(value);
  }

  displayPersonName(record: ApplicationFormRecord): string {
    const personName = record.detail?.personalInfo?.personName?.trim();
    if (personName) {
      return personName;
    }
    const name = record.EmployeeName?.trim();
    return name && name !== '—' ? name : '—';
  }

  maskedPassword(password: string | undefined): string {
    if (!password || !String(password).trim()) {
      return '—';
    }
    return '••••••••';
  }


  createNewSIR(): void {
    if (!this.permissionService.assertCan(APPLICATION_FORM_MODULE, 'add')) {
      return;
    }

    this.alertService.error('Error', 'Under Construction');
  }

  onUpdate(_record: ApplicationFormRecord): void {
    if (!this.permissionService.assertCan(APPLICATION_FORM_MODULE, 'update')) {
      return;
    }

    this.alertService.error('Error', 'Under Construction');
  }

  onDelete(_record: ApplicationFormRecord): void {
    if (!this.permissionService.assertCan(APPLICATION_FORM_MODULE, 'delete')) {
      return;
    }

    this.alertService.error('Error', 'Under Construction');
  }

  // Sidebar event handlers
  onFolderSelected(folder: string): void {
    this.activeSidebarItemId = folder;
  }

  onManageFolders(): void {
    console.log('Manage folders clicked');
    // Handle manage folders action
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(s => !s);
  }

}