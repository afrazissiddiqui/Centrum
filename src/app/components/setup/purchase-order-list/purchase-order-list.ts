import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MiscellaneousLayoutService } from '../../miscellaneous/miscellaneous-layout.service';
import { OpenBaseDocumentsService, type OpenBaseDocument } from '../../gate-pass/open-base-documents.service';
import { displayDateSlash } from '../../../utils/date-format.util';
import { AlertService } from '../../../services/alert.service';

interface PurchaseOrderListColumn {
  key: 'docNum' | 'docDate' | 'vendor' | 'warehouse' | 'itemCount' | 'status';
  label: string;
  visible: boolean;
}

interface PurchaseOrderListItem {
  docNum: string;
  docDate: string;
  docType: string;
  vendor: string;
  warehouse: string;
  itemCount: number;
  total: number;
  status: string;
  remarks?: string;
  items: Array<{
    itemCode: string;
    itemDescription: string;
    vendor: string;
    department: string;
    glAccount: string;
    taxCode: string;
    requiredDate: string;
    warehouse: string;
    remarks: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    batchNumber?: string;
  }>;
}

@Component({
  selector: 'app-purchase-order-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './purchase-order-list.html',
  styleUrls: ['../../miscellaneous/miscellaneous-list.css', '../../sample-inspection-request/sample-inspection-request.css'],
})
export class PurchaseOrderListComponent implements OnInit {
  private readonly router = inject(Router);
  protected readonly layout = inject(MiscellaneousLayoutService);
  private readonly openBaseDocumentsService = inject(OpenBaseDocumentsService);
  private readonly alertService = inject(AlertService);

  readonly searchText = signal('');
  readonly currentPage = signal(1);
  readonly showDialog = signal(false);
  readonly showDetailDialog = signal(false);
  readonly selectedRow = signal<PurchaseOrderListItem | null>(null);
  readonly orders = signal<PurchaseOrderListItem[]>([]);

  readonly columns = signal<PurchaseOrderListColumn[]>([
    { key: 'docNum', label: 'Order No', visible: true },
    { key: 'docDate', label: 'Posting Date', visible: true },
    { key: 'vendor', label: 'Vendor', visible: true },
    { key: 'warehouse', label: 'Warehouse', visible: true },
    { key: 'itemCount', label: 'Items', visible: true },
    { key: 'status', label: 'Status', visible: true },
  ]);

  readonly filteredOrders = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    if (!term) {
      return this.orders();
    }

    return this.orders().filter(
      (row) =>
        row.docNum.toLowerCase().includes(term) ||
        row.vendor.toLowerCase().includes(term) ||
        row.warehouse.toLowerCase().includes(term) ||
        row.status.toLowerCase().includes(term),
    );
  });

  readonly pageSize = 10;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredOrders().length / this.pageSize)));
  readonly paginatedOrders = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredOrders().slice(start, start + this.pageSize);
  });
  readonly paginationEnd = computed(() => Math.min(this.currentPage() * this.pageSize, this.filteredOrders().length));

  ngOnInit(): void {
    this.loadSubmittedPurchaseRequests();
  }

  private loadSubmittedPurchaseRequests(): void {
    this.openBaseDocumentsService.fetchPurchaseRequests().subscribe({
      next: (documents) => {
        const mapped = documents.map((document) => this.mapOpenDocumentToListItem(document));
        this.orders.set(mapped.length > 0 ? mapped : []);
      },
      error: () => {
        this.orders.set([]);
      },
    });
  }

  private mapOpenDocumentToListItem(document: OpenBaseDocument): PurchaseOrderListItem {
    const rawDocument = document as unknown as Record<string, unknown>;
    const items = (document.lines ?? []).map((line, index) => {
      const record = line as unknown as Record<string, unknown>;
      const itemCode = this.asString(
        record['itemCode'] ?? record['ItemCode'] ?? record['code'] ?? record['Code'] ?? `${index + 1}`,
      );
      const itemDescription = this.asString(
        record['itemName'] ?? record['ItemName'] ?? record['description'] ?? record['Description'] ?? record['Dscription'] ?? '—',
      );
      const lineVendor = this.asString(record['vendor'] ?? record['Vendor'] ?? record['CardName'] ?? record['cardName']);
      const department = this.asString(record['department'] ?? record['Department'] ?? record['DepartmentName']);
      const glAccount = this.asString(
        record['accountCode'] ?? record['AccountCode'] ?? record['glAccount'] ?? record['GLAccount'] ?? record['AcctCode'],
      );
      const taxCode = this.asString(record['taxCode'] ?? record['TaxCode'] ?? record['VatGroup'] ?? record['vatGroup']);
      const requiredDate = this.asString(record['requiredDate'] ?? record['RequiredDate'] ?? record['ReqDate'] ?? record['reqDate']);
      const warehouse = this.asString(
        record['warehouse'] ?? record['Warehouse'] ?? record['warehouseCode'] ?? record['WarehouseCode'] ??
          record['whsCode'] ?? record['WhsCode'] ?? document.store ?? '',
      );
      const remarks = this.asString(record['remarks'] ?? record['Remarks'] ?? record['Comments'] ?? record['U_Remarks']);
      const quantity = this.toNumber(record['quantity'] ?? record['Quantity'] ?? record['qty'] ?? record['Qty'] ?? 0);
      const unitPrice = this.toNumber(record['unitPrice'] ?? record['UnitPrice'] ?? record['infoPrice'] ?? record['InfoPrice'] ?? 0);
      const lineTotal = this.toNumber(record['lineTotal'] ?? record['LineTotal'] ?? record['total'] ?? record['Total'] ?? quantity * unitPrice);
      const batchNumber = this.asString(record['batchNumber'] ?? record['BatchNumber'] ?? record['batch'] ?? record['Batch'] ?? '');

      return {
        itemCode,
        itemDescription,
        vendor: lineVendor || this.asString(document.businessPartnerName ?? document.partner ?? document.businessPartnerCode ?? '—'),
        department,
        glAccount,
        taxCode,
        requiredDate,
        warehouse,
        remarks,
        quantity,
        unitPrice,
        lineTotal,
        batchNumber: batchNumber || undefined,
      };
    });

    const docNum = this.asString(
      rawDocument['DocNum'] ?? rawDocument['docNum'] ?? document.docNum ?? document.number ?? '—',
    );
    const docDate = this.asString(
      rawDocument['DocDate'] ?? rawDocument['docDate'] ?? document.docDate ?? document.date ?? '',
    );
    const vendor = this.asString(
      rawDocument['CardName'] ?? rawDocument['cardName'] ?? document.businessPartnerName ?? document.partner ?? document.businessPartnerCode ?? '—',
    );
    const docType = this.normalizeDocType(rawDocument['DocType'] ?? rawDocument['docType'] ?? document.docType);

    return {
      docNum,
      docDate: displayDateSlash(docDate),
      docType,
      vendor,
      warehouse: this.asString(document.store ?? ''),
      itemCount: items.length,
      total: items.reduce((sum, item) => sum + item.lineTotal, 0),
      status: this.normalizeStatus(document.status ?? 'O'),
      remarks: this.asString(document.remarks ?? ''),
      items,
    };
  }

  private normalizeDocType(value: unknown): string {
    const normalized = this.asString(value).trim().toUpperCase();
    if (!normalized) {
      return '';
    }
    if (normalized === 'SERVICE' || normalized === 'SERVICE REQUEST' || normalized.startsWith('SERVICE')) {
      return 'S';
    }
    if (normalized === 'PURCHASE REQUEST' || normalized === 'PURCHASE ORDER' || normalized.startsWith('PURCHASE')) {
      return normalized.slice(0, 1);
    }
    return normalized;
  }

  private normalizeStatus(value: unknown): string {
    const normalized = this.asString(value).trim().toUpperCase();
    if (!normalized) {
      return 'O';
    }
    const closedValues = ['C', 'CLOSED', 'CLOSE', 'BOST_CLOSED'];
    const openValues = ['O', 'OPEN', 'BOST_OPEN'];
    if (closedValues.includes(normalized)) {
      return 'C';
    }
    if (openValues.includes(normalized)) {
      return 'O';
    }
    return normalized.startsWith('C') ? 'C' : 'O';
  }

  private asString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  onAddNew(): void {
    void this.router.navigate(['/setup/purchase-request']);
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

  isColumnVisible(key: PurchaseOrderListColumn['key']): boolean {
    return this.columns().find((column) => column.key === key)?.visible !== false;
  }

  toggleColumnVisibility(key: PurchaseOrderListColumn['key'], visible: boolean): void {
    this.columns.update((columns) => columns.map((column) => (column.key === key ? { ...column, visible } : column)));
  }

  viewDetails(row: PurchaseOrderListItem): void {
    this.selectedRow.set(row);
    this.showDetailDialog.set(true);
  }

  printRequest(row: PurchaseOrderListItem): void {
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      this.alertService.warning('Print', 'Your browser blocked the print window. Please allow pop-ups and try again.');
      return;
    }

    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
    printWindow.document.write(this.buildPurchaseRequestPrintDocument(row));
    printWindow.document.close();
  }

  private buildPurchaseRequestPrintDocument(row: PurchaseOrderListItem): string {
    const escapeHtml = (value: string | number | null | undefined): string =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    const displayValue = (value: string | number | null | undefined): string =>
      escapeHtml(value === null || value === undefined || value === '' ? '—' : value);
    const headers = row.docType === 'S'
      ? ['Sr. No', 'Description', 'Vendor', 'Department', 'GL Account', 'Tax Code', 'Required Date', 'Warehouse', 'Remarks', 'Total']
      : ['Sr. No', 'Item Code', 'Description', 'Vendor', 'Department', 'Tax Code', 'Required Date', 'Warehouse', 'Remarks', 'Quantity', 'Unit Price', 'Batch', 'Line Total'];
    const itemRows = row.items.map((item, index) => {
      const values = row.docType === 'S'
        ? [
            index + 1,
            item.itemDescription,
            item.vendor || row.vendor,
            item.department,
            item.glAccount,
            item.taxCode,
            item.requiredDate,
            item.warehouse || row.warehouse,
            item.remarks || row.remarks,
            this.formatAmount(item.lineTotal),
          ]
        : [
            index + 1,
            item.itemCode,
            item.itemDescription,
            item.vendor || row.vendor,
            item.department,
            item.taxCode,
            item.requiredDate,
            item.warehouse || row.warehouse,
            item.remarks || row.remarks,
            item.quantity,
            this.formatAmount(item.unitPrice),
            item.batchNumber,
            this.formatAmount(item.lineTotal),
          ];
      return `<tr>${values.map((value) => `<td>${displayValue(value)}</td>`).join('')}</tr>`;
    }).join('');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Purchase Request #${escapeHtml(row.docNum)}</title>
  <style>
    body { color: #172b4d; font: 12px Arial, sans-serif; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 18px; }
    h2 { font-size: 15px; margin: 24px 0 10px; }
    .details { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .detail { border-bottom: 1px solid #d8dee8; padding: 6px 0; }
    .detail strong { color: #53647b; display: block; font-size: 10px; margin-bottom: 4px; }
    .remarks { margin-top: 12px; }
    table { border-collapse: collapse; font-size: 10px; width: 100%; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #eef3fb; }
    tfoot td { font-weight: 700; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>Purchase Request #${escapeHtml(row.docNum)}</h1>
  <div class="details">
    <div class="detail"><strong>Posting Date</strong>${displayValue(row.docDate)}</div>
    <div class="detail"><strong>Vendor</strong>${displayValue(row.vendor)}</div>
    <div class="detail"><strong>Warehouse</strong>${displayValue(row.warehouse)}</div>
    <div class="detail"><strong>Status</strong>${escapeHtml(this.statusLabel(row.status))}</div>
  </div>
  <div class="remarks"><strong>Remarks:</strong> ${displayValue(row.remarks)}</div>
  <h2>Line Items (${row.items.length})</h2>
  <table>
    <thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
    <tbody>${itemRows || `<tr><td colspan="${headers.length}">No line items</td></tr>`}</tbody>
    <tfoot><tr><td colspan="${headers.length - 1}">Total</td><td>${this.formatAmount(row.total)}</td></tr></tfoot>
  </table>
</body>
</html>`;
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
    return this.normalizeStatus(status) === 'C' ? 'Close' : 'Open';
  }

  isClosed(status: string): boolean {
    return this.normalizeStatus(status) === 'C';
  }

  formatAmount(value: number): string {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
