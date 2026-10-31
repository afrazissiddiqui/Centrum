import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ColumnResizeDirective } from '../../../../column-resize';
import { PageToolbarComponent } from '../../../page-toolbar/page-toolbar';
import { SidebarComponent, SidebarItem, SidebarSection } from '../../../sidebar/sidebar';
import {
  LeaveApplicationRecord,
  LeaveApplicationService,
} from '../../../../services/leave-application.service';
import { AlertService } from '../../../../services/alert.service';
import { formatApiErrorMessage } from '../../../../utils/api-error.util';
import { buildCompactPageNumbers } from '../../../../utils/pagination.util';
import { displayDateSlash, formatTableCellValue } from '../../../../utils/date-format.util';
import { EMPLOYEE_ACTION_SIDEBAR_ITEMS, EMPLOYEE_ACTION_SIDEBAR_SECTIONS } from '../employee-action-sidebar';
import {
  LEAVE_APPLICATION_TABLE_FILTER,
  TableFilterComponent,
  TableFilterService,
} from '../../../table-filter';
import { ShellbarSearchService } from '../../../../services/shellbar-search.service';
import { connectShellbarSearch } from '../../../../utils/shellbar-search-connect.util';
import { PermissionService } from '../../../../services/permission.service';
import {
  GL_ACCOUNT_BRANCH_OPTIONS,
  resolveBranchCode,
} from '../../../setup/gl-account-determination/gl-account-branch.options';

const LEAVE_APPLICATION_MODULE = 'leave_application_form';

type LeaveColumnKey = Exclude<
  keyof LeaveApplicationRecord,
  'selected' | 'Id' | 'HeaderInfo' | 'LeaveRequest' | 'LeaveBalanceInformation'
>;

@Component({
  selector: 'app-leave-application-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ColumnResizeDirective, SidebarComponent, PageToolbarComponent, TableFilterComponent],
  templateUrl: './leave-application-form.html',
  styleUrls: ['../../Application-Form/Application-Form.css'],
  styles: [`
    :host .table-scroll { overflow-x: auto; }
    :host .mountain-table { width: 100%; min-width: 1100px; table-layout: auto; }
    :host .mountain-table th, :host .mountain-table td {
      min-width: 120px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    :host .mountain-table th:first-child, :host .mountain-table td:first-child {
      min-width: 40px;
      width: 40px;
    }
    :host .mountain-table th:last-child, :host .mountain-table td:last-child {
      position: sticky;
      right: 0;
      z-index: 11;
      background: #ffffff;
      border-left: 1px solid #eee;
      box-shadow: -2px 0 5px rgba(0, 0, 0, 0.05);
    }
    :host .mountain-table thead th:last-child {
      z-index: 12;
      background: #f5f5f5;
    }
    :host .branch-filter {
      height: 32px;
      padding: 0 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #f5f5f5;
      color: #1d2d3e;
    }
  `],
})
export class LeaveApplicationFormComponent implements OnInit {
  readonly leaveTableFilter = LEAVE_APPLICATION_TABLE_FILTER;
  readonly branchOptions = GL_ACCOUNT_BRANCH_OPTIONS;
  private readonly destroyRef = inject(DestroyRef);
  private readonly shellbarSearch = inject(ShellbarSearchService);

  constructor(
    private readonly leaveService: LeaveApplicationService,
    private readonly router: Router,
    private readonly alertService: AlertService,
    readonly tableFilter: TableFilterService,
    private readonly permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    connectShellbarSearch(this.shellbarSearch, this.destroyRef, {
      getSearchText: () => this.searchText,
      setSearchText: (value) => { this.searchText = value; },
      onSearchChange: () => this.onSearchChange(),
    });

    this.leaveService.fetchLeaveApplications().subscribe({
      error: (error: unknown) => {
        this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load leave applications.'),
        );
      },
    });
  }

  Math = Math;

  columns: Array<{ key: LeaveColumnKey; label: string; visible: boolean }> = [
    { key: 'FormNumber', label: 'Form Number', visible: true },
    { key: 'EmployeeId', label: 'Employee ID', visible: true },
    { key: 'EmployeeName', label: 'Employee Name', visible: true },
    { key: 'Department', label: 'Department', visible: true },
    { key: 'LeaveType', label: 'Leave Type', visible: true },
    { key: 'FromDate', label: 'From Date', visible: true },
    { key: 'ToDate', label: 'To Date', visible: true },
    { key: 'TotalLeaveDaysRequested', label: 'Leave Days', visible: true },
    { key: 'RequestStatus', label: 'Request Status', visible: true },
    { key: 'EmployeeCategory', label: 'Employee Category', visible: false },
    { key: 'EmploymentNature', label: 'Employment Nature', visible: false },
    { key: 'EmploymentType', label: 'Employment Status', visible: false },
    { key: 'WorkGradeLevel', label: 'Work Grade Level', visible: false },
    { key: 'JobTitle', label: 'Job Title', visible: false },
    { key: 'Location', label: 'Location', visible: false },
    { key: 'RequestDate', label: 'Request Date', visible: false },
    { key: 'CauseOfLeave', label: 'Cause of Leave', visible: false },
    { key: 'Remarks', label: 'Remarks', visible: false },
    { key: 'TotalLeaves', label: 'Total Leaves', visible: false },
    { key: 'LeavesAvailed', label: 'Leaves Availed', visible: false },
    { key: 'RemainingLeaves', label: 'Remaining Leaves', visible: false },
  ];

  sidebarItems: SidebarItem[] = EMPLOYEE_ACTION_SIDEBAR_ITEMS;
  sidebarSections: SidebarSection[] = EMPLOYEE_ACTION_SIDEBAR_SECTIONS;

  activeSidebarItemId = 'leave-application-form';
  sidebarCollapsed = signal(false);
  searchText = '';
  selectedBranch = '';
  sortColumn: LeaveColumnKey = 'FormNumber';
  sortDirection: 'asc' | 'desc' = 'asc';
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions: number[] = [5, 10, 20, 50];
  showDialog = false;
  activeTab: 'filter' = 'filter';
  readonly showViewDialog = signal(false);
  readonly viewLoading = signal(false);
  readonly selectedRecord = signal<LeaveApplicationRecord | null>(null);

  get leaveList(): LeaveApplicationRecord[] {
    return this.leaveService.leaves();
  }

  get visibleColumns(): Array<{ key: LeaveColumnKey; label: string; visible: boolean }> {
    return this.columns.filter((col) => col.visible);
  }

  get filteredList(): LeaveApplicationRecord[] {
    let list = this.tableFilter.filterItems([...this.leaveList], this.leaveTableFilter);
    if (this.selectedBranch) {
      list = list.filter((item) => resolveBranchCode(item.Location) === this.selectedBranch);
    }
    if (this.searchText) {
      const search = this.searchText.trim().toLowerCase();
      list = list.filter((item) => {
        const haystack = [
          item.FormNumber,
          item.EmployeeId,
          item.EmployeeName,
          item.Department,
          item.LeaveType,
          item.FromDate,
          item.ToDate,
          item.TotalLeaveDaysRequested,
          item.RequestStatus,
          item.CauseOfLeave,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(search);
      });
    }
    list.sort((a, b) => {
      const valueA = a[this.sortColumn];
      const valueB = b[this.sortColumn];
      if (valueA > valueB) return this.sortDirection === 'asc' ? 1 : -1;
      if (valueA < valueB) return this.sortDirection === 'asc' ? -1 : 1;
      return 0;
    });
    return list;
  }

  get paginatedList(): LeaveApplicationRecord[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredList.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredList.length / this.pageSize);
  }

  get pages(): number[] {
    return buildCompactPageNumbers(this.totalPages, this.currentPage);
  }

  toggleAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.filteredList.forEach((item) => (item.selected = checked));
  }

  isAllSelected(): boolean {
    return this.filteredList.length > 0 && this.filteredList.every((item) => item.selected);
  }

  getSelectedCount(): number {
    return this.leaveList.filter((item) => item.selected).length;
  }

  onSearchChange(): void {
    this.shellbarSearch.syncQuery(this.searchText);
    this.currentPage = 1;
  }

  hasActiveListFilters(): boolean {
    return this.tableFilter.hasActive(this.leaveTableFilter) || Boolean(this.selectedBranch);
  }

  onBranchChange(branch: string): void {
    this.selectedBranch = branch;
    this.currentPage = 1;
  }

  onTableFilterApplied(): void {
    this.currentPage = 1;
  }

  sortData(column: LeaveColumnKey): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortColumn = column;
    this.sortDirection = 'asc';
  }

  setPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
  }

  openDialog(): void {
    this.showDialog = true;
  }

  closeDialog(): void {
    this.showDialog = false;
  }

  viewRecord(record: LeaveApplicationRecord): void {
    if (!this.permissionService.assertCan(LEAVE_APPLICATION_MODULE, 'view')) {
      return;
    }

    if (!record.Id) {
      this.alertService.warning('View', 'Unable to view this row: missing leave application id.');
      return;
    }

    this.showViewDialog.set(true);
    this.selectedRecord.set(null);
    this.viewLoading.set(true);

    this.leaveService.fetchLeaveApplicationDetail(record.Id).subscribe({
      next: (detail) => {
        this.selectedRecord.set(detail);
        this.viewLoading.set(false);
      },
      error: (error: unknown) => {
        this.viewLoading.set(false);
        this.showViewDialog.set(false);
        this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load leave application details.'),
        );
      },
    });
  }

  onUpdate(record: LeaveApplicationRecord): void {
    if (!this.permissionService.assertCan(LEAVE_APPLICATION_MODULE, 'update')) {
      return;
    }

    if (!record.Id) {
      this.alertService.warning('Update', 'Unable to update this row: missing leave application id.');
      return;
    }
    void this.router.navigate(['/employee-action/leave-application-form/edit', record.Id]);
  }

  async onDelete(record: LeaveApplicationRecord): Promise<void> {
    if (!this.permissionService.assertCan(LEAVE_APPLICATION_MODULE, 'delete')) {
      return;
    }

    const result = await this.alertService.confirm(
      'Delete leave application?',
      `Remove ${record.EmployeeName} (${record.FormNumber}) from the list?`,
    );
    if (!result.isConfirmed) {
      return;
    }

    if (!record.Id) {
      this.alertService.warning('Delete', 'Unable to delete this row: missing leave application id.');
      return;
    }

    this.leaveService.deleteLeaveApplication(record.Id).subscribe({
      next: () => {
        this.leaveService.removeLeaveRecord(record);
        if (this.paginatedList.length === 0 && this.currentPage > 1) {
          this.currentPage -= 1;
        }
        this.alertService.success('Deleted', 'Leave application removed successfully.');
      },
      error: (error: unknown) => {
        this.alertService.error(
          'Delete Failed',
          formatApiErrorMessage(error, 'Failed to delete leave application.'),
        );
      },
    });
  }

  closeViewDialog(): void {
    this.showViewDialog.set(false);
    this.selectedRecord.set(null);
    this.viewLoading.set(false);
  }

  onFolderSelected(folderId: string): void {
    this.activeSidebarItemId = folderId;
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((state) => !state);
  }

  createNewLeave(): void {
    if (!this.permissionService.assertCan(LEAVE_APPLICATION_MODULE, 'add')) {
      return;
    }

    void this.router.navigateByUrl('/employee-action/leave-application-form/create');
  }

  formatCellValue(record: LeaveApplicationRecord, key: LeaveColumnKey): string {
    return formatTableCellValue(key, record[key]);
  }

  formatDetail(value: string | number | undefined): string {
    if (value === undefined || value === null) {
      return '—';
    }
    const text = String(value).trim();
    return text ? text : '—';
  }

  formatDateDetail(value: string | number | undefined): string {
    return displayDateSlash(value ?? '');
  }
}
