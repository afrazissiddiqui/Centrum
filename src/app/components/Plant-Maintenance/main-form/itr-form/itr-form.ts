import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ColumnResizeDirective } from '../../../../column-resize';
import { AlertService } from '../../../../services/alert.service';
import { formatApiErrorMessage } from '../../../../utils/api-error.util';
import { buildCompactPageNumbers } from '../../../../utils/pagination.util';
import { PageToolbarComponent } from '../../../page-toolbar/page-toolbar';
import { PlantMaintenanceMainLayoutService } from '../plant-maintenance-main-layout.service';
import { ItrFormRecord, ItrFormService } from './itr-form.service';

type ItrTableColumnKey =
  | 'machineId'
  | 'machineName'
  | 'maintenanceType'
  | 'maintenanceFrequency'
  | 'serialNo'
  | 'moldNo'
  | 'hotRunnerJobNo'
  | 'hourMeterReading'
  | 'robotSerialNo'
  | 'inspector'
  | 'inspectionDate'
  | 'submitDate'
  | 'documentNo'
  | 'status';

type RowActionKey = 'view' | 'update' | 'delete';

@Component({
  selector: 'app-itr-form',
  standalone: true,
  imports: [CommonModule, FormsModule, PageToolbarComponent, ColumnResizeDirective],
  templateUrl: './itr-form.html',
  styleUrls: [
    '../../../HR-Portal/Application-Form/Application-Form.css',
    '../../setup-form/plant-maintenance-setup-form.css',
  ],
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        width: 100%;
      }
    `,
  ],
})
export class ItrFormComponent implements OnInit {
  private readonly layout = inject(PlantMaintenanceMainLayoutService);
  private readonly itrService = inject(ItrFormService);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  readonly Math = Math;
  readonly loading = signal(true);
  readonly skeletonRows = [1, 2, 3, 4, 5, 6];

  searchText = '';
  sortColumn: ItrTableColumnKey = 'machineId';
  sortDirection: 'asc' | 'desc' = 'asc';
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions: number[] = [5, 10, 20, 50];
  showDialog = false;
  readonly showViewDialog = signal(false);
  readonly detailLoading = signal(false);
  readonly selectedRecord = signal<ItrFormRecord | null>(null);
  activeTab: 'sort' | 'filter' | 'group' = 'filter';

  ngOnInit(): void {
    this.itrService.fetchItrForms().subscribe({
      next: () => {
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load ITR Forms.'),
        );
      },
    });
  }

  readonly rowActions: RowActionKey[] = ['view', 'update', 'delete'];

  readonly columns: Array<{ key: ItrTableColumnKey; label: string; visible: boolean }> = [
    { key: 'machineId', label: 'Machine ID', visible: true },
    { key: 'machineName', label: 'Machine Name', visible: true },
    { key: 'maintenanceType', label: 'Maintenance Type', visible: true },
    { key: 'maintenanceFrequency', label: 'Maintenance Frequency', visible: true },
    { key: 'serialNo', label: 'SN# (Machine Serial No.)', visible: true },
    { key: 'moldNo', label: 'Mold #', visible: true },
    { key: 'hotRunnerJobNo', label: 'Hot Runner Job #', visible: false },
    { key: 'hourMeterReading', label: 'Hour Meter Reading', visible: false },
    { key: 'robotSerialNo', label: 'Robot Serial #', visible: false },
    { key: 'inspector', label: 'Inspector', visible: true },
    { key: 'inspectionDate', label: 'Inspection Date', visible: true },
    { key: 'submitDate', label: 'Submit Date', visible: true },
    { key: 'documentNo', label: 'Document No.', visible: true },
    { key: 'status', label: 'Status', visible: true },
  ];

  get showActionsColumn(): boolean {
    return this.rowActions.length > 0;
  }

  hasRowAction(action: RowActionKey): boolean {
    return this.rowActions.includes(action);
  }

  get recordList(): ItrFormRecord[] {
    return this.itrService.records();
  }

  get filteredList(): ItrFormRecord[] {
    let list = [...this.recordList];
    const search = this.searchText.trim().toLowerCase();

    if (search) {
      list = list.filter((item) =>
        Object.values(item).some((value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(search),
        ),
      );
    }

    list.sort((a, b) => {
      const valueA = this.getCellValue(a, this.sortColumn);
      const valueB = this.getCellValue(b, this.sortColumn);
      if (valueA > valueB) {
        return this.sortDirection === 'asc' ? 1 : -1;
      }
      if (valueA < valueB) {
        return this.sortDirection === 'asc' ? -1 : 1;
      }
      return 0;
    });

    return list;
  }

  get paginatedList(): ItrFormRecord[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredList.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredList.length / this.pageSize));
  }

  get pages(): number[] {
    return buildCompactPageNumbers(this.totalPages, this.currentPage);
  }

  get visibleColumnCount(): number {
    let count = this.columns.filter((c) => c.visible).length + 1;
    if (this.showActionsColumn) {
      count += 1;
    }
    return count;
  }

  toggleSidebar(): void {
    this.layout.toggleSidebar();
  }

  addRecord(): void {
    void this.router.navigate(['/plant-maintenance/main-form/itr-form/create']);
  }

  viewRecord(item: ItrFormRecord): void {
    if (!item.id) {
      void this.alertService.warning('View', 'Unable to view this row: missing record id.');
      return;
    }

    this.showViewDialog.set(true);
    this.selectedRecord.set(null);
    this.detailLoading.set(true);

    this.itrService.fetchItrFormDetail(item.id).subscribe({
      next: (detail) => {
        this.selectedRecord.set(detail);
        this.detailLoading.set(false);
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.selectedRecord.set(item);
          this.detailLoading.set(false);
          return;
        }

        this.detailLoading.set(false);
        this.showViewDialog.set(false);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load ITR Form details.'),
        );
      },
    });
  }

  closeViewDialog(): void {
    this.showViewDialog.set(false);
    this.selectedRecord.set(null);
    this.detailLoading.set(false);
  }

  updateRecord(item: ItrFormRecord): void {
    if (!item.id) {
      void this.alertService.warning('Update', 'Unable to update this row: missing record id.');
      return;
    }
    void this.router.navigate(['/plant-maintenance/main-form/itr-form/edit', item.id]);
  }

  async deleteRecord(item: ItrFormRecord): Promise<void> {
    const result = await this.alertService.confirm(
      'Delete record?',
      `Remove ${item.documentNo || item.machineId} — ${item.machineName} from the list?`,
    );
    if (!result.isConfirmed) {
      return;
    }

    if (!item.id) {
      void this.alertService.warning('Delete', 'Unable to delete this row: missing record id.');
      return;
    }

    this.itrService.deleteItrForm(item.id).subscribe({
      next: () => {
        this.itrService.removeItrFormRecord(item);
        if (this.paginatedList.length === 0 && this.currentPage > 1) {
          this.currentPage -= 1;
        }
        void this.alertService.success('Deleted', 'ITR Form removed successfully.');
      },
      error: (error: unknown) => {
        void this.alertService.error(
          'Delete Failed',
          formatApiErrorMessage(error, 'Failed to delete ITR Form.'),
        );
      },
    });
  }

  getCellValue(item: ItrFormRecord, columnKey: ItrTableColumnKey): string {
    return item[columnKey] ?? '';
  }

  onHeaderClick(columnKey: ItrTableColumnKey): void {
    if (this.sortColumn === columnKey) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    this.sortColumn = columnKey;
    this.sortDirection = 'asc';
  }

  toggleAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const ids = this.filteredList.map((r) => r.id);
    this.itrService.setAllSelected(checked, ids);
  }

  isAllSelected(): boolean {
    return this.filteredList.length > 0 && this.filteredList.every((item) => item.selected);
  }

  onRowSelectChange(item: ItrFormRecord, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.itrService.updateSelection(item.id, checked);
  }

  getSelectedCount(): number {
    return this.recordList.filter((item) => item.selected).length;
  }

  onSearchChange(): void {
    this.currentPage = 1;
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
}
