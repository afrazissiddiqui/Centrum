import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MiscellaneousLayoutService } from '../../miscellaneous/miscellaneous-layout.service';
import { OpenBaseDocumentsService, type OpenBaseDocument } from '../../gate-pass/open-base-documents.service';
import { displayDateSlash } from '../../../utils/date-format.util';

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
