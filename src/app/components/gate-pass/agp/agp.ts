import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ColumnResizeDirective } from '../../../column-resize';
import { PageToolbarComponent } from '../../page-toolbar/page-toolbar';
import { AlertService } from '../../../services/alert.service';
import { formatApiErrorMessage } from '../../../utils/api-error.util';
import { GatePassLayoutService } from '../gate-pass-layout.service';
import { gatePassWarehouseLabel } from '../gate-pass-warehouse.options';
import { compareGatePassListRecords, formatGatePassListCell } from '../gate-pass-list-display.util';
import { AgpRecord, AgpService } from './agp.service';
import { ShellbarSearchService } from '../../../services/shellbar-search.service';
import { connectShellbarSearch } from '../../../utils/shellbar-search-connect.util';
import { buildCompactPageNumbers } from '../../../utils/pagination.util';

type AgpSortableKey = Exclude<keyof AgpRecord, 'lines' | 'selected'>;

interface ColumnConfig {
  key: AgpSortableKey;
  label: string;
  visible: boolean;
}

@Component({
  selector: 'app-agp',
  standalone: true,
  imports: [CommonModule, FormsModule, ColumnResizeDirective, PageToolbarComponent],
  templateUrl: './agp.html',
  styleUrl: '../igp/igp.css',
})
export class AgpComponent implements OnInit {
  readonly warehouseLabel = gatePassWarehouseLabel;
  readonly listLoading = signal(true);
  private readonly destroyRef = inject(DestroyRef);
  private readonly shellbarSearch = inject(ShellbarSearchService);
  private readonly document = inject(DOCUMENT);

  constructor(
    private readonly router: Router,
    private readonly agpService: AgpService,
    private readonly layout: GatePassLayoutService,
    private readonly alertService: AlertService,
  ) {}

  formatCell(record: AgpRecord, key: AgpSortableKey): string {
    return formatGatePassListCell(record[key] as string | number | null | undefined, key);
  }

  ngOnInit(): void {
    connectShellbarSearch(this.shellbarSearch, this.destroyRef, {
      getSearchText: () => this.searchText,
      setSearchText: (value) => { this.searchText = value; },
      onSearchChange: () => this.onSearchChange(),
    });

    this.listLoading.set(true);
    this.agpService.fetchArticleGatePasses().subscribe({
      next: () => this.listLoading.set(false),
      error: (error: unknown) => {
        this.listLoading.set(false);
        this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load AGP records.'),
        );
      },
    });
  }

  Math = Math;

  columns: ColumnConfig[] = [
    { key: 'referenceNo', label: 'AGP no.', visible: true },
    { key: 'baseDocNo', label: 'Base doc no.', visible: true },
    { key: 'type', label: 'Type', visible: true },
    { key: 'submittedDate', label: 'Date', visible: true },
    { key: 'businessPartnerName', label: 'Business partner', visible: true },
    { key: 'requestingDepartment', label: 'Department', visible: true },
    { key: 'vehicleNo', label: 'Vehicle no.', visible: true },
    { key: 'location', label: 'Branch', visible: true },
    { key: 'totalQtySent', label: 'Qty sent', visible: true },
    { key: 'totalQtyReceived', label: 'Qty received', visible: true },
    { key: 'status', label: 'Status', visible: true },
  ];

  get rows(): AgpRecord[] {
    return this.agpService.records();
  }

  get visibleColumnCount(): number {
    return this.columns.filter((col) => col.visible).length;
  }

  searchText = '';
  sortColumn: AgpSortableKey = 'submittedDate';
  sortDirection: 'asc' | 'desc' = 'desc';
  currentPage = 1;
  pageSize = 10;
  pageSizeOptions: number[] = [5, 10, 20, 50];

  showDialog = false;
  readonly showDetailDialog = signal(false);
  readonly detailLoading = signal(false);
  readonly selectedRow = signal<AgpRecord | null>(null);
  readonly skeletonDetailFields = Array.from({ length: 12 }, (_, index) => index);
  readonly skeletonLineRows = Array.from({ length: 3 }, (_, index) => index);
  readonly skeletonLineColumns = Array.from({ length: 8 }, (_, index) => index);
  activeTab: 'sort' | 'filter' | 'group' = 'filter';

  openDialog(): void {
    this.showDialog = true;
  }

  closeDialog(): void {
    this.showDialog = false;
  }

  viewDetails(record: AgpRecord): void {
    if (!record.Id) {
      this.alertService.warning('View', 'Unable to view this row: missing AGP id.');
      return;
    }

    this.showDetailDialog.set(true);
    this.selectedRow.set(record);
    this.detailLoading.set(true);

    this.agpService.fetchArticleGatePassDetail(record.Id).subscribe({
      next: (detail) => {
        this.selectedRow.set(detail);
        this.detailLoading.set(false);
      },
      error: (error: unknown) => {
        const cached = this.agpService.findCachedRecord(record.Id) ?? record;
        this.selectedRow.set(cached);
        this.detailLoading.set(false);
        this.alertService.warning(
          'Detail unavailable',
          formatApiErrorMessage(error, 'Showing list data — full detail could not be loaded.'),
        );
      },
    });
  }

  onUpdate(record: AgpRecord): void {
    if (!record.Id) {
      this.alertService.warning('Update', 'Unable to update this row: missing AGP id.');
      return;
    }

    void this.router.navigate(['/gate-pass/agp/edit', record.Id]);
  }

  async onDelete(record: AgpRecord): Promise<void> {
    const result = await this.alertService.confirm(
      'Delete AGP?',
      `Remove ${record.referenceNo} (${record.businessPartnerName}) from the list?`,
    );
    if (!result.isConfirmed) {
      return;
    }

    if (!record.Id) {
      this.alertService.warning('Delete', 'Unable to delete this row: missing AGP id.');
      return;
    }

    this.agpService.deleteArticleGatePass(record.Id).subscribe({
      next: (response) => {
        if (response?.status === false || response?.success === false) {
          this.alertService.error(
            'Delete Failed',
            response.message || 'Failed to delete AGP record.',
          );
          return;
        }

        this.agpService.removeAgpRecord(record);
        if (this.paginatedList.length === 0 && this.currentPage > 1) {
          this.currentPage -= 1;
        }
        this.alertService.success('Deleted', response?.message || 'AGP record removed successfully.');
      },
      error: (error: unknown) => {
        this.alertService.error(
          'Delete Failed',
          formatApiErrorMessage(error, 'Failed to delete AGP record.'),
        );
      },
    });
  }

  closeDetailDialog(): void {
    this.selectedRow.set(null);
    this.showDetailDialog.set(false);
    this.detailLoading.set(false);
  }

  printRecord(record: AgpRecord): void {
    if (!record.Id) {
      this.alertService.warning('Print', 'Unable to print this row: missing AGP id.');
      return;
    }

    const printWindow = this.document.defaultView?.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      this.alertService.warning('Print', 'Your browser blocked the print window. Please allow pop-ups and try again.');
      return;
    }

    const content = this.buildPrintableDocument(record);
    printWindow.document.write(content);
    printWindow.document.close();

    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 250);
    };
  }

  buildPrintableDocument(record: AgpRecord): string {
    const headerFields = [
      ['AGP no.', record.referenceNo],
      ['Date', record.submittedDate],
      ['Type', record.type],
      ['Business partner', record.businessPartnerName],
      ['Requesting department', record.requestingDepartment],
      ['Vehicle', record.vehicleNo],
      ['Status', record.status],
      ['Total qty sent', record.totalQtySent],
      ['Total qty received', record.totalQtyReceived],
    ];

    const lineItems = (record.lines ?? [])
      .map((line, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${this.escapeHtml(line.itemCode ?? '—')}</td>
          <td>${this.escapeHtml(line.itemName ?? '—')}</td>
          <td>${this.escapeHtml(line.serialNumbers ?? '—')}</td>
          <td>${this.escapeHtml(line.category ?? '—')}</td>
          <td>${this.escapeHtml(line.packingCondition ?? '—')}</td>
          <td>${this.escapeHtml(line.productQuality ?? '—')}</td>
          <td>${this.escapeHtml(line.qtySent ?? '—')}</td>
          <td>${this.escapeHtml(line.qtyReceived ?? '—')}</td>
        </tr>`)
      .join('');

    const remarks = this.escapeHtml(record.remarks ?? '—');

    return `<!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>AGP Print - ${this.escapeHtml(record.referenceNo ?? 'AGP')}</title>
        <style>
          :root { color-scheme: light; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 24px; background: #fff; color: #1d2d3e; }
          .print-shell { max-width: 900px; margin: 0 auto; border: 1px solid #dbe4ee; border-radius: 14px; overflow: hidden; box-shadow: 0 12px 28px rgba(0,0,0,0.08); }
          .print-header { background: linear-gradient(135deg, #0a6ed1, #004d9f); color: #fff; padding: 24px 28px; }
          .print-header h1 { margin: 0 0 6px; font-size: 24px; }
          .print-header p { margin: 0; opacity: 0.92; }
          .print-body { padding: 24px 28px 28px; }
          .print-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px 18px; margin-bottom: 22px; }
          .print-field { background: #f7f9fc; border: 1px solid #e7edf4; border-radius: 8px; padding: 10px 12px; }
          .print-field strong { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #5d6874; margin-bottom: 4px; }
          .print-field span { font-size: 14px; color: #17212b; }
          .print-section { margin-top: 18px; }
          .print-section h2 { font-size: 15px; margin: 0 0 10px; color: #0a6ed1; border-bottom: 2px solid #eef5ff; padding-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { border: 1px solid #e5eaf0; padding: 8px 10px; text-align: left; }
          th { background: #f3f7fb; color: #3c4858; font-weight: 700; }
          .remarks-box { background: #f9fbfe; border: 1px solid #e7edf4; border-radius: 8px; padding: 12px; color: #394651; line-height: 1.5; }
          @page { margin: 10mm; size: auto; }
          @media print { body { padding: 0; } .print-shell { box-shadow: none; border-color: #b9c4cf; } }
        </style>
      </head>
      <body>
        <div class="print-shell">
          <div class="print-header">
            <h1>Article Gate Pass</h1>
            <p>Posted line printout for ${this.escapeHtml(record.referenceNo ?? 'AGP')}</p>
          </div>
          <div class="print-body">
            <div class="print-grid">
              ${headerFields.map(([label, value]) => `
                <div class="print-field">
                  <strong>${this.escapeHtml(label)}</strong>
                  <span>${this.escapeHtml(value ?? '—')}</span>
                </div>`).join('')}
            </div>
            <div class="print-section">
              <h2>Remarks</h2>
              <div class="remarks-box">${remarks}</div>
            </div>
            <div class="print-section">
              <h2>Line items</h2>
              <table>
                <thead>
                  <tr>
                    <th>Sr.#</th>
                    <th>Item code</th>
                    <th>Item name</th>
                    <th>Batch #</th>
                    <th>Category</th>
                    <th>Packing</th>
                    <th>Quality</th>
                    <th>Qty sent</th>
                    <th>Qty received</th>
                  </tr>
                </thead>
                <tbody>${lineItems || '<tr><td colspan="9">No line items available.</td></tr>'}</tbody>
              </table>
            </div>
          </div>
        </div>
        <script>
          window.onload = function () {
            setTimeout(function () {
              window.focus();
              window.print();
            }, 250);
          };
        </script>
      </body>
      </html>`;
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  toggleAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.filteredList.forEach((s) => (s.selected = checked));
  }

  isAllSelected(): boolean {
    return this.filteredList.length > 0 && this.filteredList.every((s) => s.selected);
  }

  getSelectedCount(): number {
    return this.rows.filter((x) => x.selected).length;
  }

  get filteredList(): AgpRecord[] {
    let list = [...this.rows];

    if (this.searchText) {
      const search = this.searchText.toLowerCase();
      list = list.filter((item) => {
        const hay = [
          item.title,
          item.requestingDepartment,
          item.department,
          item.referenceNo,
          item.status,
          item.type,
          item.businessPartnerName,
          item.businessPartnerCode,
          item.baseDocNo,
          item.vehicleNo,
          String(item.Id),
          String(item.totalQtySent ?? ''),
          String(item.totalQtyReceived ?? ''),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(search);
      });
    }

    list.sort((a, b) => compareGatePassListRecords(a, b, this.sortColumn, this.sortDirection));

    return list;
  }

  get paginatedList(): AgpRecord[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredList.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredList.length / this.pageSize);
  }

  get pages(): number[] {
    return buildCompactPageNumbers(this.totalPages, this.currentPage);
  }

  onSearchChange(): void {
    this.shellbarSearch.syncQuery(this.searchText);
    this.currentPage = 1;
  }

  sortData(column: AgpSortableKey): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
  }

  setPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
  }

  createNew(): void {
    void this.router.navigateByUrl('/gate-pass/agp/create');
  }

  toggleSidebar(): void {
    this.layout.toggleSidebar();
  }
}
