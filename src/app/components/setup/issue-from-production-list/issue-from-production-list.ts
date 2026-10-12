import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { formatBranchNameForDisplay } from '../../../utils/branch-name.util';
import { GoodIssueListItem, GoodIssueService } from '../../miscellaneous/good-issue/good-issue.service';
import { MiscellaneousLayoutService } from '../../miscellaneous/miscellaneous-layout.service';

interface IssueFromProductionListColumn {
  key: 'docNum' | 'docDate' | 'fromWarehouse' | 'issuedTo' | 'itemCount' | 'status';
  label: string;
  visible: boolean;
}

@Component({
  selector: 'app-issue-from-production-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './issue-from-production-list.html',
  styleUrls: ['../../miscellaneous/miscellaneous-list.css', '../../sample-inspection-request/sample-inspection-request.css'],
})
export class IssueFromProductionListComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly goodIssueService = inject(GoodIssueService);
  protected readonly layout = inject(MiscellaneousLayoutService);

  readonly searchText = signal('');
  readonly currentPage = signal(1);
  readonly showDialog = signal(false);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly showDetailDialog = signal(false);
  readonly selectedRow = signal<GoodIssueListItem | null>(null);
  readonly branchNameForDisplay = formatBranchNameForDisplay;
  readonly issues = signal<GoodIssueListItem[]>([]);
  readonly columns = signal<IssueFromProductionListColumn[]>([
    { key: 'docNum', label: 'Issue No', visible: true },
    { key: 'docDate', label: 'Posting Date', visible: true },
    { key: 'fromWarehouse', label: 'From Warehouse', visible: true },
    { key: 'issuedTo', label: 'Issued To', visible: true },
    { key: 'itemCount', label: 'Items', visible: true },
    { key: 'status', label: 'Status', visible: true },
  ]);

  readonly filteredIssues = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    if (!term) {
      return this.issues();
    }

    return this.issues().filter(
      (row) =>
        row.docNum.toLowerCase().includes(term) ||
        row.fromWarehouse.toLowerCase().includes(term) ||
        row.issuedTo.toLowerCase().includes(term) ||
        row.status.toLowerCase().includes(term),
    );
  });

  readonly pageSize = 10;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredIssues().length / this.pageSize)));
  readonly paginatedIssues = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredIssues().slice(start, start + this.pageSize);
  });
  readonly paginationEnd = computed(() => Math.min(this.currentPage() * this.pageSize, this.filteredIssues().length));

  ngOnInit(): void {
    this.loadIssues();
  }

  onAddNew(): void {
    void this.router.navigate(['/setup/issue-from-production']);
  }

  toggleSidebar(): void {
    this.layout.toggleSidebar();
  }

  onSearchChange(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(1);
  }

  openDialog(): void {
    this.showDialog.set(true);
  }

  closeDialog(): void {
    this.showDialog.set(false);
  }

  isColumnVisible(key: IssueFromProductionListColumn['key']): boolean {
    return this.columns().find((column) => column.key === key)?.visible !== false;
  }

  toggleColumnVisibility(key: IssueFromProductionListColumn['key'], visible: boolean): void {
    this.columns.update((columns) => columns.map((column) => (column.key === key ? { ...column, visible } : column)));
  }

  viewDetails(row: GoodIssueListItem): void {
    this.selectedRow.set(row);
    this.showDetailDialog.set(true);
  }

  closeDetailDialog(): void {
    this.selectedRow.set(null);
    this.showDetailDialog.set(false);
  }

  setPage(page: number): void {
    if (page < 1 || page > this.totalPages()) {
      return;
    }
    this.currentPage.set(page);
  }

  statusLabel(status: string): string {
    return status === 'C' ? 'Close' : 'Open';
  }

  isClosed(status: string): boolean {
    return status === 'C';
  }

  formatAmount(value: number): string {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  loadIssues(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.goodIssueService.list().subscribe({
      next: (rows) => {
        this.issues.set(rows);
        this.currentPage.set(1);
        this.loading.set(false);
      },
      error: () => {
        this.issues.set([]);
        this.currentPage.set(1);
        this.loading.set(false);
        this.loadError.set('Could not load issue for production records.');
      },
    });
  }
}
