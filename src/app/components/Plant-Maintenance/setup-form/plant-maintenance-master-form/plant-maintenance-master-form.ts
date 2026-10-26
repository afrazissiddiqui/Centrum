import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ColumnResizeDirective } from '../../../../column-resize';
import { AlertService } from '../../../../services/alert.service';
import { formatApiErrorMessage } from '../../../../utils/api-error.util';
import { buildCompactPageNumbers } from '../../../../utils/pagination.util';
import { PageToolbarComponent } from '../../../page-toolbar/page-toolbar';
import { PlantMaintenanceMainLayoutService } from '../../main-form/plant-maintenance-main-layout.service';
import {
  filterPlantMaintenanceViewableComponents,
  PlantMaintenanceMasterFormService,
  PlantMaintenanceMasterRecord,
} from './plant-maintenance-master-form.service';

type MasterTableColumnKey =
  | 'machineId'
  | 'machineName'
  | 'machineType'
  | 'maintenanceNature'
  | 'plantMaintenanceFrequency'
  | 'plantMaintenanceType'
  | 'status';

type RowActionKey = 'view' | 'update' | 'delete';

@Component({
  selector: 'app-plant-maintenance-master-form',
  standalone: true,
  imports: [CommonModule, FormsModule, PageToolbarComponent, ColumnResizeDirective],
  templateUrl: './plant-maintenance-master-form.html',
  styleUrls: [
    '../../../HR-Portal/Application-Form/Application-Form.css',
    './plant-maintenance-master-form.css',
  ],
})
export class PlantMaintenanceMasterFormComponent implements OnInit {
  private readonly layout = inject(PlantMaintenanceMainLayoutService);
  private readonly masterService = inject(PlantMaintenanceMasterFormService);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  readonly Math = Math;
  readonly loading = signal(true);
  readonly skeletonRows = [1, 2, 3, 4, 5, 6];

  searchText = '';
  sortColumn: MasterTableColumnKey = 'machineId';
  sortDirection: 'asc' | 'desc' = 'asc';
  currentPage = 1;
  pageSize = 15;
  pageSizeOptions: number[] = [5, 10, 15, 20, 50];
  showDialog = false;
  readonly showViewDialog = signal(false);
  readonly detailLoading = signal(false);
  readonly selectedRecord = signal<PlantMaintenanceMasterRecord | null>(null);
  activeTab: 'sort' | 'filter' | 'group' = 'filter';

  ngOnInit(): void {
    this.loadPage(1, this.pageSize);
  }

  readonly rowActions: RowActionKey[] = ['view', 'update', 'delete'];

  readonly columns: Array<{ key: MasterTableColumnKey; label: string; visible: boolean }> = [
    { key: 'machineId', label: 'Machine ID', visible: true },
    { key: 'machineName', label: 'Machine Name', visible: true },
    { key: 'machineType', label: 'Machine Type', visible: true },
    { key: 'maintenanceNature', label: 'Maintenance Nature', visible: true },
    { key: 'plantMaintenanceFrequency', label: 'Plant Maintenance Frequency', visible: true },
    { key: 'plantMaintenanceType', label: 'Plant Maintenance Type', visible: true },
    { key: 'status', label: 'Status', visible: true },
  ];

  get showActionsColumn(): boolean {
    return this.rowActions.length > 0;
  }

  hasRowAction(action: RowActionKey): boolean {
    return this.rowActions.includes(action);
  }

  get machineList(): PlantMaintenanceMasterRecord[] {
    return this.masterService.records();
  }

  get pagination() {
    return this.masterService.pagination();
  }

  get filteredList(): PlantMaintenanceMasterRecord[] {
    let list = [...this.machineList];
    const search = this.searchText.trim().toLowerCase();

    if (search) {
      list = list.filter(
        (item) =>
          item.machineId.toLowerCase().includes(search) ||
          item.machineName.toLowerCase().includes(search) ||
          item.machineType.toLowerCase().includes(search) ||
          item.maintenanceNature.toLowerCase().includes(search) ||
          item.plantMaintenanceFrequency.toLowerCase().includes(search) ||
          item.plantMaintenanceType.toLowerCase().includes(search) ||
          item.remarks.toLowerCase().includes(search) ||
          (item.components ?? []).some(
            (c) =>
              c.name.toLowerCase().includes(search) ||
              c.inspectionLines.some(
                (line) =>
                  line.status.toLowerCase().includes(search) ||
                  (line.recommendation ?? '').toLowerCase().includes(search) ||
                  line.itemsToBeInspected.toLowerCase().includes(search) ||
                  line.whatToCheck.toLowerCase().includes(search) ||
                  line.instructions.toLowerCase().includes(search),
              ),
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

  get paginatedList(): PlantMaintenanceMasterRecord[] {
    return this.filteredList;
  }

  get totalPages(): number {
    return Math.max(1, this.pagination.lastPage);
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

  addMachine(): void {
    void this.router.navigate([
      '/plant-maintenance/main-form/plant-maintenance-master-form/create',
    ]);
  }

  viewRecord(item: PlantMaintenanceMasterRecord): void {
    if (!item.id) {
      void this.alertService.warning('View', 'Unable to view this row: missing record id.');
      return;
    }

    this.showViewDialog.set(true);
    this.selectedRecord.set(null);
    this.detailLoading.set(true);

    this.masterService.fetchPlantMaintenanceMasterFormDetail(item.id).subscribe({
      next: (detail) => {
        this.selectedRecord.set(detail);
        this.detailLoading.set(false);
      },
      error: (error: unknown) => {
        this.detailLoading.set(false);
        this.showViewDialog.set(false);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load plant maintenance master form details.'),
        );
      },
    });
  }

  closeViewDialog(): void {
    this.showViewDialog.set(false);
    this.selectedRecord.set(null);
    this.detailLoading.set(false);
  }

  get viewableComponents() {
    return filterPlantMaintenanceViewableComponents(this.selectedRecord()?.components);
  }

  updateRecord(item: PlantMaintenanceMasterRecord): void {
    if (!item.id) {
      void this.alertService.warning('Update', 'Unable to update this row: missing record id.');
      return;
    }
    void this.router.navigate([
      '/plant-maintenance/main-form/plant-maintenance-master-form/edit',
      item.id,
    ]);
  }

  async deleteRecord(item: PlantMaintenanceMasterRecord): Promise<void> {
    const result = await this.alertService.confirm(
      'Delete machine?',
      `Remove ${item.machineId} — ${item.machineName} from the list?`,
    );
    if (!result.isConfirmed) {
      return;
    }

    if (!item.id) {
      void this.alertService.warning('Delete', 'Unable to delete this row: missing record id.');
      return;
    }

    this.masterService.deletePlantMaintenanceMasterForm(item.id).subscribe({
      next: () => {
        this.masterService.removePlantMaintenanceMasterRecord(item);
        if (this.paginatedList.length === 0 && this.currentPage > 1) {
          this.currentPage -= 1;
        }
        this.loadPage(this.currentPage, this.pageSize);
        void this.alertService.success('Deleted', 'Plant maintenance master form removed successfully.');
      },
      error: (error: unknown) => {
        void this.alertService.error(
          'Delete Failed',
          formatApiErrorMessage(error, 'Failed to delete plant maintenance master form.'),
        );
      },
    });
  }

  getCellValue(item: PlantMaintenanceMasterRecord, columnKey: MasterTableColumnKey): string {
    if (columnKey === 'status') {
      const statuses = (item.components ?? []).flatMap((c) =>
        c.inspectionLines.map((line) => line.status?.trim()).filter(Boolean),
      );
      return statuses.length ? statuses.join(', ') : '';
    }
    return item[columnKey] ?? '';
  }

  onHeaderClick(columnKey: MasterTableColumnKey): void {
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
    this.masterService.setAllSelected(checked, ids);
  }

  isAllSelected(): boolean {
    return (
      this.filteredList.length > 0 && this.filteredList.every((item) => item.selected)
    );
  }

  onRowSelectChange(item: PlantMaintenanceMasterRecord, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.masterService.updateSelection(item.id, checked);
  }

  getSelectedCount(): number {
    return this.machineList.filter((item) => item.selected).length;
  }

  onSearchChange(): void {
    this.currentPage = 1;
  }

  setPage(page: number): void {
    if (
      this.loading() ||
      page < 1 ||
      page > this.totalPages ||
      page === this.currentPage
    ) {
      return;
    }
    this.loadPage(page, this.pageSize);
  }

  onPageSizeChange(pageSize: number): void {
    if (this.loading()) {
      return;
    }
    this.pageSize = pageSize;
    this.loadPage(1, pageSize);
  }

  private loadPage(page: number, perPage: number): void {
    this.loading.set(true);
    this.masterService.fetchPlantMaintenanceMasterFormPage(page, perPage).subscribe({
      next: () => {
        this.currentPage = this.pagination.currentPage;
        this.pageSize = this.pagination.perPage;
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load plant maintenance master forms.'),
        );
      },
    });
  }

  openDialog(): void {
    this.showDialog = true;
  }

  closeDialog(): void {
    this.showDialog = false;
  }
}