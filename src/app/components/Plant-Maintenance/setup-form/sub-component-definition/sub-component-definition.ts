import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ColumnResizeDirective } from '../../../../column-resize';
import { AlertService } from '../../../../services/alert.service';
import { formatApiErrorMessage } from '../../../../utils/api-error.util';
import { buildCompactPageNumbers } from '../../../../utils/pagination.util';
import { PageToolbarComponent } from '../../../page-toolbar/page-toolbar';
import { PlantMaintenanceSetupLayoutService } from '../plant-maintenance-setup-layout.service';
import {
  SubComponentDefinitionService,
  SubComponentMachineRecord,
} from './sub-component-definition.service';

type MachineTableColumnKey = 'machineId' | 'machineName' | 'machineType';

@Component({
  selector: 'app-sub-component-definition',
  standalone: true,
  imports: [CommonModule, FormsModule, PageToolbarComponent, ColumnResizeDirective],
  templateUrl: './sub-component-definition.html',
  styleUrls: [
    '../../../HR-Portal/Application-Form/Application-Form.css',
    '../plant-maintenance-setup-form.css',
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
export class SubComponentDefinitionComponent implements OnInit {
  private readonly layout = inject(PlantMaintenanceSetupLayoutService);
  private readonly subComponentService = inject(SubComponentDefinitionService);
  private readonly alertService = inject(AlertService);
  private readonly router = inject(Router);

  readonly Math = Math;

  searchText = '';
  sortColumn: MachineTableColumnKey = 'machineId';
  sortDirection: 'asc' | 'desc' = 'asc';
  currentPage = 1;
  pageSize = 15;
  pageSizeOptions: number[] = [5, 10, 15, 20, 50];
  showDialog = false;
  readonly showViewDialog = signal(false);
  readonly detailLoading = signal(false);
  readonly machinesLoading = signal(false);
  readonly selectedRecord = signal<SubComponentMachineRecord | null>(null);
  activeTab: 'sort' | 'filter' | 'group' = 'filter';

  ngOnInit(): void {
    this.loadMachines();
  }

  readonly columns: Array<{ key: MachineTableColumnKey; label: string; visible: boolean }> = [
    { key: 'machineId', label: 'Machine ID', visible: true },
    { key: 'machineName', label: 'Machine Name', visible: true },
    { key: 'machineType', label: 'Machine Type', visible: true },
  ];

  get machineList(): SubComponentMachineRecord[] {
    return this.subComponentService.records();
  }

  get pagination() {
    return this.subComponentService.pagination;
  }

  get filteredList(): SubComponentMachineRecord[] {
    let list = [...this.machineList];
    const search = this.searchText.trim().toLowerCase();

    if (search) {
      list = list.filter(
        (item) =>
          item.machineId.toLowerCase().includes(search) ||
          item.machineName.toLowerCase().includes(search) ||
          item.machineType.toLowerCase().includes(search),
      );
    }

    list.sort((a, b) => {
      const valueA = a[this.sortColumn];
      const valueB = b[this.sortColumn];
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

  get paginatedList(): SubComponentMachineRecord[] {
    return this.filteredList;
  }

  get totalPages(): number {
    return Math.max(1, this.pagination().lastPage);
  }

  get pages(): number[] {
    return buildCompactPageNumbers(this.totalPages, this.currentPage);
  }

  get visibleColumnCount(): number {
    return this.columns.filter((c) => c.visible).length + 2;
  }

  toggleSidebar(): void {
    this.layout.toggleSidebar();
  }

  addMachine(): void {
    void this.router.navigate([
      '/plant-maintenance/setup-form/sub-component-definition/create',
    ]);
  }

  viewRecord(item: SubComponentMachineRecord): void {
    if (!item.id) {
      void this.alertService.warning('View', 'Unable to view this row: missing machine id.');
      return;
    }

    this.showViewDialog.set(true);
    this.selectedRecord.set(null);
    this.detailLoading.set(true);

    this.subComponentService.fetchMachineDetail(item.id).subscribe({
      next: (detail) => {
        this.selectedRecord.set(detail);
        this.detailLoading.set(false);
      },
      error: (error: unknown) => {
        this.detailLoading.set(false);
        this.showViewDialog.set(false);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load machine details.'),
        );
      },
    });
  }

  closeViewDialog(): void {
    this.showViewDialog.set(false);
    this.selectedRecord.set(null);
    this.detailLoading.set(false);
  }

  updateRecord(item: SubComponentMachineRecord): void {
    if (!item.id) {
      void this.alertService.warning('Update', 'Unable to update this row: missing machine id.');
      return;
    }
    void this.router.navigate([
      '/plant-maintenance/setup-form/sub-component-definition/edit',
      item.id,
    ]);
  }

  async deleteRecord(item: SubComponentMachineRecord): Promise<void> {
    const result = await this.alertService.confirm(
      'Delete machine?',
      `Remove ${item.machineId} — ${item.machineName} from the list?`,
    );
    if (!result.isConfirmed) {
      return;
    }

    if (!item.id) {
      void this.alertService.warning('Delete', 'Unable to delete this row: missing machine id.');
      return;
    }

    this.subComponentService.deleteMachine(item.id).subscribe({
      next: () => {
        this.subComponentService.removeMachineRecord(item);
        if (this.paginatedList.length === 0 && this.currentPage > 1) {
          this.currentPage -= 1;
        }
        this.loadMachines(
          this.subComponentService.buildPageUrl(this.currentPage, this.pageSize),
        );
        void this.alertService.success('Deleted', 'Machine removed successfully.');
      },
      error: (error: unknown) => {
        void this.alertService.error(
          'Delete Failed',
          formatApiErrorMessage(error, 'Failed to delete machine.'),
        );
      },
    });
  }

  getCellValue(item: SubComponentMachineRecord, columnKey: MachineTableColumnKey): string {
    return item[columnKey] ?? '';
  }

  onHeaderClick(columnKey: MachineTableColumnKey): void {
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
    this.subComponentService.setAllSelected(checked, ids);
  }

  isAllSelected(): boolean {
    return (
      this.filteredList.length > 0 && this.filteredList.every((item) => item.selected)
    );
  }

  onRowSelectChange(item: SubComponentMachineRecord, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.subComponentService.updateSelection(item.id, checked);
  }

  getSelectedCount(): number {
    return this.machineList.filter((item) => item.selected).length;
  }

  setPage(page: number): void {
    if (
      this.machinesLoading() ||
      page < 1 ||
      page > this.totalPages ||
      page === this.currentPage
    ) {
      return;
    }
    this.loadMachines(this.subComponentService.buildPageUrl(page, this.pageSize));
  }

  goToPreviousPage(): void {
    if (this.machinesLoading()) {
      return;
    }
    const pageUrl = this.pagination().prevPageUrl;
    if (pageUrl) {
      this.loadMachines(pageUrl);
    }
  }

  goToNextPage(): void {
    if (this.machinesLoading()) {
      return;
    }
    const pageUrl = this.pagination().nextPageUrl;
    if (pageUrl) {
      this.loadMachines(pageUrl);
    }
  }

  onPageSizeChange(pageSize: number): void {
    if (this.machinesLoading()) {
      return;
    }
    this.pageSize = pageSize;
    this.loadMachines(this.subComponentService.buildPageUrl(1, pageSize));
  }

  private loadMachines(pageUrl?: string, recoverEmptyPage = true): void {
    if (this.machinesLoading()) {
      return;
    }
    this.machinesLoading.set(true);
    this.fetchMachines(pageUrl, recoverEmptyPage);
  }

  private fetchMachines(pageUrl: string | undefined, recoverEmptyPage: boolean): void {
    this.subComponentService.fetchMachines(pageUrl).subscribe({
      next: (records) => {
        const pagination = this.subComponentService.pagination();
        if (records.length === 0 && pagination.total > 0 && recoverEmptyPage) {
          const firstPageUrl =
            pagination.firstPageUrl ??
            this.subComponentService.buildPageUrl(1, this.pageSize);
          if (
            pagination.currentPage > 1 ||
            (pageUrl !== undefined && pageUrl !== firstPageUrl)
          ) {
            this.fetchMachines(firstPageUrl, false);
            return;
          }
        }
        this.currentPage = pagination.currentPage;
        this.pageSize = pagination.perPage;
        this.machinesLoading.set(false);
      },
      error: (error: unknown) => {
        this.machinesLoading.set(false);
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load machines.'),
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
