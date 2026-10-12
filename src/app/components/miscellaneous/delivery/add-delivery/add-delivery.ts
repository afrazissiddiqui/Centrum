import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertService } from '../../../../services/alert.service';
import { AuthService } from '../../../../services/auth.service';
import { OitmItemsService } from '../../../../services/oitm-items.service';
import { TaxCode, TaxCodesService } from '../../../../services/tax-codes.service';
import { SalesOrderAddress, SalesOrderRecord, SalesOrderService } from '../../../../services/sales-order.service';
import { MiscellaneousLayoutService } from '../../miscellaneous-layout.service';
import { OitmItem } from '../../../../constants/oitm-items';
import { OitmItemPickerDialogComponent } from '../../oitm-item-picker-dialog';
import { WarehouseSearchSelectComponent } from '../../warehouse-search-select';
import { resolveBranchNameFromBplId } from '../../../../utils/branch-name.util';
import { GatePassBusinessPartner, GatePassBusinessPartnerService } from '../../../gate-pass/gate-pass-business-partner.service';
import {
  DeliveryHeader,
  DeliveryLine,
  DeliveryAddress,
  createEmptyDeliveryHeader,
  createEmptyDeliveryAddress,
  createEmptyDeliveryLine,
  updateDeliveryLine,
} from '../delivery.model';
import { DeliveryService, DeliveryVendor, buildCreateDeliveryPayload } from '../delivery.service';
import { formatApiErrorMessage, formatSapApiFailureMessage } from '../../../../utils/api-error.util';

interface DeliveryTab {
  key: 'contents';
  label: string;
}

interface DeliveryBatchSelection {
  batchNo: string;
  quantity: number;
  issueQuantity?: number | null;
  legacyBatch?: string;
}

@Component({
  selector: 'app-add-delivery',
  standalone: true,
  imports: [CommonModule, FormsModule, OitmItemPickerDialogComponent, WarehouseSearchSelectComponent],
  templateUrl: './add-delivery.html',
  styleUrls: ['../../miscellaneous-form.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AddDelivery {
  private readonly router = inject(Router);
  private readonly alertService = inject(AlertService);
  private readonly authService = inject(AuthService);
  private readonly deliveryService = inject(DeliveryService);
  private readonly oitmItemsService = inject(OitmItemsService);
  private readonly taxCodesService = inject(TaxCodesService);
  private readonly salesOrderService = inject(SalesOrderService);
  private readonly businessPartnerService = inject(GatePassBusinessPartnerService);
  protected readonly layout = inject(MiscellaneousLayoutService);
  readonly saving = signal(false);
  readonly activeSection = signal<'header' | 'logistics' | 'items' | 'shipTo' | 'footer'>('header');
  readonly itemPickerOpen = signal(false);
  readonly itemPickerRowIndex = signal<number | null>(null);
  readonly submittedBy = signal(this.authService.getSessionUser()?.name ?? '');
  readonly salesOrderDialogOpen = signal(false);
  readonly salesOrders = signal<SalesOrderRecord[]>([]);
  readonly salesOrderSearchQuery = signal('');
  readonly salesOrderSearchResults = signal<SalesOrderRecord[]>([]);
  readonly salesOrdersLoading = signal(false);
  readonly salesOrdersError = signal<string | null>(null);
  readonly deliveryVendors = signal<DeliveryVendor[]>([]);
  readonly deliveryVendorsLoading = signal(false);
  readonly transporterSuggestionsOpen = signal(false);
  readonly selectedSalesOrders = signal<Set<string>>(new Set());
  readonly customerDialogOpen = signal(false);
  readonly customerSearchQuery = signal('');
  readonly customerSearchResults = signal<GatePassBusinessPartner[]>([]);
  readonly customersLoading = signal(false);
  readonly customersError = signal<string | null>(null);
  readonly selectedCustomer = signal<GatePassBusinessPartner | null>(null);
  readonly batchSelectionDialogOpen = signal(false);
  readonly activeBatchSelectionLineIndex = signal<number | null>(null);

  readonly branchOptions = signal([
    { code: '1', name: 'AHCP_Peshawar' },
    { code: '2', name: 'AHCP_HO' },
    { code: '3', name: 'AHCP_Faisalabad' },
  ]);

  readonly taxCodeOptions = signal<TaxCode[]>([]);

  readonly deliveryMethodOptions = signal([
    'Standard Delivery',
    'Express Delivery',
    'Self Pickup',
    'Third Party Courier',
  ]);

  readonly tabs: DeliveryTab[] = [{ key: 'contents', label: 'Contents' }];

  readonly editingId = signal<string | null>(null);
  readonly pageTitle = computed(() =>
    this.editingId() ? 'Edit Delivery' : 'Add Delivery',
  );
  readonly headerForm = signal<DeliveryHeader>(createEmptyDeliveryHeader());
  readonly selectedShipToAddressIndex = signal(0);
  readonly selectedShipToAddress = computed(() =>
    this.headerForm().shipToAddresses[this.selectedShipToAddressIndex()] ?? createEmptyDeliveryAddress(),
  );
  readonly contentLines = signal<DeliveryLine[]>([createEmptyDeliveryLine()]);
  readonly filteredTransporterSuggestions = computed(() => {
    const query = this.headerForm().transporterName.trim().toLowerCase();
    if (!query) {
      return this.deliveryVendors();
    }

    return this.deliveryVendors().filter((vendor) => `${vendor.code} ${vendor.name}`.toLowerCase().includes(query));
  });

  readonly totals = computed(() => {
    const beforeDiscount = this.contentLines()
      .map((line) => this.computeLineQuantity(line) * (line.unitPrice ?? 0))
      .reduce((sum, amount) => sum + amount, 0);

    const afterDiscount = this.contentLines()
      .map((line) => this.calculateLineTotal(line))
      .reduce((sum, amount) => sum + amount, 0);

    return {
      beforeDiscount,
      afterDiscount,
    };
  });

  constructor() {
    this.oitmItemsService.ensureLoaded().subscribe({ error: () => undefined });
    this.taxCodesService.ensureLoaded().subscribe((taxCodes) => {
      this.taxCodeOptions.set(
        taxCodes.filter((taxCode) => taxCode.code.trim().toUpperCase().startsWith('S')),
      );
    });
    this.loadDeliveryVendors();
  }

  private loadDeliveryVendors(): void {
    this.deliveryVendorsLoading.set(true);
    this.deliveryService.getDeliveryVendors().subscribe({
      next: (vendors) => {
        this.deliveryVendors.set(vendors);
        this.deliveryVendorsLoading.set(false);
      },
      error: () => {
        this.deliveryVendors.set([]);
        this.deliveryVendorsLoading.set(false);
      },
    });
  }

  openTransporterSuggestions(): void {
    this.transporterSuggestionsOpen.set(true);
  }

  closeTransporterSuggestions(): void {
    window.setTimeout(() => this.transporterSuggestionsOpen.set(false), 150);
  }

  selectTransporter(vendor: DeliveryVendor): void {
    this.updateHeaderField('transporterName', vendor.name || vendor.code);
    this.transporterSuggestionsOpen.set(false);
  }

  updateBranch(value: string): void {
    const selected = this.branchOptions().find((branch) => branch.code === value);
    if (!selected) {
      return;
    }
    this.headerForm.update((state) => ({
      ...state,
      branchId: selected.code,
      branchName: selected.name,
    }));
  }

  updateHeaderField(field: keyof DeliveryHeader, value: string): void {
    this.headerForm.update((state) => ({ ...state, [field]: value }));
  }

  updateIntegerHeaderField(field: keyof DeliveryHeader, value: string): void {
    this.updateHeaderField(field, value.replace(/\D/g, '').slice(0, 11));
  }

  updateShipToAddress(field: keyof DeliveryAddress, value: string): void {
    this.headerForm.update((state) => ({
      ...state,
      shipToAddresses: state.shipToAddresses.map((address, index) =>
        index === this.selectedShipToAddressIndex() ? { ...address, [field]: value } : address,
      ),
    }));
  }

  selectShipToAddress(index: number): void {
    const address = this.headerForm().shipToAddresses[index];
    if (!address) {
      return;
    }

    this.selectedShipToAddressIndex.set(index);
    this.updateHeaderField('shipToAddress', address.address);
  }

  addContentLine(): void {
    this.contentLines.update((lines) => [...lines, createEmptyDeliveryLine()]);
  }

  deleteContentLine(index: number): void {
    this.contentLines.update((lines) => lines.filter((_, i) => i !== index));
  }

  updateContentLine(index: number, field: keyof DeliveryLine, value: string): void {
    this.contentLines.update((rows) => updateDeliveryLine(rows, index, field, value));
  }

  private resolveBranchFromWarehouseCode(value: string): { code: string; name: string } | null {
    const raw = value.trim();
    if (!raw) {
      return null;
    }

    const normalized = raw.toLowerCase();
    const branchMap: Record<string, { code: string; name: string }> = {
      '1': { code: '1', name: 'AHCP_Peshawar' },
      '2': { code: '2', name: 'AHCP_HO' },
      '3': { code: '3', name: 'AHCP_Faisalabad' },
      psh: { code: '1', name: 'AHCP_Peshawar' },
      peshawar: { code: '1', name: 'AHCP_Peshawar' },
      ho: { code: '2', name: 'AHCP_HO' },
      'head office': { code: '2', name: 'AHCP_HO' },
      fsd: { code: '3', name: 'AHCP_Faisalabad' },
      faisalabad: { code: '3', name: 'AHCP_Faisalabad' },
    };

    if (branchMap[normalized]) {
      return branchMap[normalized];
    }

    const prefix = normalized.split(/[-_\s]/, 1)[0];
    if (prefix && branchMap[prefix]) {
      return branchMap[prefix];
    }

    if (normalized.includes('psh')) {
      return branchMap['psh'];
    }
    if (normalized.includes('fsd') || normalized.includes('faisalabad')) {
      return branchMap['fsd'];
    }
    if (normalized.includes('ho') || normalized.includes('head office')) {
      return branchMap['ho'];
    }

    return null;
  }

  batchOptionsForLine(line: DeliveryLine): DeliveryBatchSelection[] {
    if (!line.itemCode.trim()) {
      return [];
    }

    const item = this.oitmItemsService.getCatalog().find((entry) => entry.itemCode === line.itemCode);
    if (!item?.batches?.length) {
      return [];
    }

    const selectedWarehouse = line.warehouse.trim().toLowerCase();
    const filtered = selectedWarehouse
      ? item.batches.filter((batch) => batch.warehouse.trim().toLowerCase() === selectedWarehouse)
      : item.batches;

    return filtered.map((batch) => ({
      batchNo: batch.batchNumber.trim(),
      quantity: Number(batch.quantity ?? 0),
      legacyBatch: batch.legacyBatch ?? '',
      issueQuantity: line.batchSerialNumber && batch.batchNumber.trim() === line.batchSerialNumber.trim()
        ? line.quantity ?? 0
        : null,
    })).filter((batch) => batch.batchNo.trim() !== '');
  }

  formatAmount(value: number): string {
    return value === 0
      ? '0.00'
      : value.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  }

  salesOrderItemDescriptions(order: SalesOrderRecord): string {
    return order.items
      .map((item) => item.itemDescription.trim())
      .filter((description) => description.length > 0)
      .join(', ') || '—';
  }

  totalAmount(): number {
    return this.totals().beforeDiscount;
  }

  discountAdjustedTotal(): number {
    return this.totals().afterDiscount;
  }

  calculateLineTotal(line: DeliveryLine): number {
    const grossAmount = this.computeLineQuantity(line) * (line.unitPrice ?? 0);
    const discountPercent = Math.max(0, Math.min(100, line.discountPercent ?? 0));
    const netAmount = grossAmount * (1 - discountPercent / 100);
    return netAmount;
  }

  computeLineQuantity(line: DeliveryLine): number {
    const per = line.qtyPerJumboCarton ?? 0;
    const count = line.jumboCartonsCount ?? 0;
    if (per > 0 && count > 0) {
      return per * count;
    }
    return line.quantity ?? 0;
  }

  trackByIndex(index: number): number {
    return index;
  }

  scrollTo(section: 'header' | 'logistics' | 'items' | 'shipTo' | 'footer'): void {
    this.activeSection.set(section);
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' });
  }

  openItemPicker(index: number): void {
    this.itemPickerRowIndex.set(index);
    this.itemPickerOpen.set(true);
  }

  onItemsSelected(items: OitmItem[]): void {
    const index = this.itemPickerRowIndex();
    if (index === null || items.length === 0) {
      return;
    }

    this.contentLines.update((rows) => {
      const updated = [...rows];
      const first = items[0];
      updated[index] = {
        ...updated[index],
        itemCode: first.itemCode,
        itemDescription: first.itemName,
        unitOfMeasure: first.uom,
      };

      const extras = items.slice(1).map((item) => ({
        ...createEmptyDeliveryLine(),
        itemCode: item.itemCode,
        itemDescription: item.itemName,
        unitOfMeasure: item.uom,
      }));

      return [...updated, ...extras];
    });

    this.itemPickerRowIndex.set(null);
  }

  openSalesOrderDialog(): void {
    if (!this.headerForm().customer.trim()) {
      this.alertService.validation('Select Customer First.');
      return;
    }

    this.salesOrderDialogOpen.set(true);
    this.salesOrdersLoading.set(true);
    this.salesOrdersError.set(null);
    this.salesOrderSearchQuery.set('');
    this.selectedSalesOrders.set(new Set());

    this.salesOrderService.list().subscribe({
      next: (orders) => {
        const selectedCustomerCode = this.headerForm().customer.trim().toLowerCase();
        const filteredOrders = selectedCustomerCode
          ? orders.filter((order) => (order.cardCode || '').trim().toLowerCase() === selectedCustomerCode)
          : orders;

        this.salesOrders.set(filteredOrders);
        this.salesOrderSearchResults.set(filteredOrders);
        this.salesOrdersLoading.set(false);
      },
      error: () => {
        this.salesOrders.set([]);
        this.salesOrderSearchResults.set([]);
        this.salesOrdersLoading.set(false);
        this.salesOrdersError.set('Could not load sales orders.');
      },
    });
  }

  isSalesOrderSelected(order: SalesOrderRecord): boolean {
    return this.selectedSalesOrders().has(order.docEntry);
  }

  openCustomerDialog(): void {
    this.customerDialogOpen.set(true);
    this.customerSearchQuery.set('');
    this.customersLoading.set(true);
    this.customersError.set(null);

    this.businessPartnerService.ensureCustomersLoaded().subscribe({
      next: (partners) => {
        this.customerSearchResults.set(partners);
        this.customersLoading.set(false);
      },
      error: () => {
        this.customerSearchResults.set([]);
        this.customersLoading.set(false);
        this.customersError.set('Could not load customer accounts.');
      },
    });
  }

  closeCustomerDialog(): void {
    this.customerDialogOpen.set(false);
    this.selectedCustomer.set(null);
    this.customerSearchQuery.set('');
  }

  searchCustomers(searchText: string): void {
    this.customerSearchQuery.set(searchText);
    const query = this.customerSearchQuery().trim();
    this.customerSearchResults.set(this.businessPartnerService.searchCustomers(query));
  }

  chooseCustomer(partner: GatePassBusinessPartner): void {
    this.selectedCustomer.set(partner);
  }

  applyCustomer(partner: GatePassBusinessPartner): void {
    this.headerForm.update((state) => ({
      ...state,
      customer: partner.code,
      customerName: partner.name,
    }));

    this.closeCustomerDialog();
  }

  searchSalesOrders(searchText: string): void {
    this.salesOrderSearchQuery.set(searchText);
    const query = this.salesOrderSearchQuery().trim().toLowerCase();
    if (!query) {
      this.salesOrderSearchResults.set(this.salesOrders());
      return;
    }

    this.salesOrderSearchResults.set(
      this.salesOrders().filter((order) => {
        const haystack = [
          order.docNum,
          order.cardCode,
          order.cardName,
          order.branchId,
          order.customerPoNo,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(query);
      }),
    );
  }

  closeSalesOrderDialog(): void {
    this.salesOrderDialogOpen.set(false);
    this.selectedSalesOrders.set(new Set());
  }

  openBatchSelectionDialog(): void {
    const lines = this.contentLines().filter((line) => line.itemCode.trim());
    if (lines.length === 0) {
      void this.alertService.warning('No items added', 'Add at least one item before opening the batch selection modal.');
      return;
    }

    this.oitmItemsService.ensureLoaded().subscribe({
      next: () => this.prepareBatchSelectionDialog(),
      error: () => this.prepareBatchSelectionDialog(),
    });
  }

  private prepareBatchSelectionDialog(): void {
    this.contentLines.update((rows) =>
      rows.map((row) => {
        if (!row.itemCode.trim()) {
          return row;
        }

        const normalizedAvailable = row.availableBatches?.length
          ? row.availableBatches
          : this.buildAvailableBatchesForLine(row);

        return {
          ...row,
          availableBatches: normalizedAvailable,
          batchSerialNumber: normalizedAvailable.some((batch) => batch.batchNo === row.batchSerialNumber)
            ? row.batchSerialNumber
            : normalizedAvailable[0]?.batchNo ?? row.batchSerialNumber,
        };
      }),
    );

    const firstBatchLineIndex = this.contentLines().findIndex((line) => line.itemCode.trim() && (line.availableBatches?.length ?? 0) > 0);
    this.activeBatchSelectionLineIndex.set(firstBatchLineIndex >= 0 ? firstBatchLineIndex : 0);
    this.batchSelectionDialogOpen.set(true);
  }

  closeBatchSelectionDialog(): void {
    this.batchSelectionDialogOpen.set(false);
    this.activeBatchSelectionLineIndex.set(null);
  }

  saveFromBatchSelectionDialog(): void {
    this.closeBatchSelectionDialog();
    this.save();
  }

  selectBatchSelectionLine(index: number): void {
    this.activeBatchSelectionLineIndex.set(index);
  }

  getActiveBatchSelectionLine(): DeliveryLine | null {
    const index = this.activeBatchSelectionLineIndex();
    if (index === null) {
      return null;
    }

    return this.contentLines()[index] ?? null;
  }

  private buildAvailableBatchesForLine(line: DeliveryLine): DeliveryBatchSelection[] {
    if (!line.itemCode.trim()) {
      return [];
    }

    const item = this.oitmItemsService.getCatalog().find((entry) => entry.itemCode === line.itemCode);
    if (!item?.batches?.length) {
      return [];
    }

    const selectedWarehouse = line.warehouse.trim().toLowerCase();
    const filtered = selectedWarehouse
      ? item.batches.filter((batch) => batch.warehouse.trim().toLowerCase() === selectedWarehouse)
      : item.batches;

    return filtered
      .map((batch) => ({
        batchNo: batch.batchNumber.trim(),
        quantity: Number(batch.quantity ?? 0),
        legacyBatch: batch.legacyBatch ?? '',
        issueQuantity: line.batchSerialNumber && batch.batchNumber.trim() === line.batchSerialNumber.trim()
          ? line.quantity ?? 0
          : null,
      }))
      .filter((batch) => batch.batchNo.trim() !== '');
  }

  getMaxAvailableForBatch(batch: DeliveryBatchSelection, line: DeliveryLine): number {
    const batchAvailable = batch.quantity;
    const requiredQty = line.quantity ?? 0;
    const totalIssueInForm = (line.availableBatches ?? [])
      .filter((currentBatch) => currentBatch.batchNo !== batch.batchNo)
      .reduce((sum, currentBatch) => sum + (currentBatch.issueQuantity ?? 0), 0);

    const remainingRequired = requiredQty - totalIssueInForm;
    const maxAllowed = Math.min(batchAvailable, Math.max(remainingRequired, 0));

    return Math.max(maxAllowed, 0);
  }

  isBatchSelectionComplete(line: DeliveryLine): boolean {
    return (line.availableBatches ?? []).some((batch) => (batch.issueQuantity ?? 0) > 0);
  }

  getRemainingRequiredQuantity(line: DeliveryLine): number {
    const totalIssuedInForm = (line.availableBatches ?? []).reduce((sum, batch) => sum + (batch.issueQuantity ?? 0), 0);
    const remaining = (line.quantity ?? 0) - totalIssuedInForm;
    return Math.max(0, remaining);
  }

  getAlreadyIssuedQuantity(line: DeliveryLine): number {
    return Math.max(0, (line.quantity ?? 0) - this.getRemainingRequiredQuantity(line));
  }

  getTotalIssuedInForm(line: DeliveryLine): number {
    return (line.availableBatches ?? []).reduce((sum, batch) => sum + (batch.issueQuantity ?? 0), 0);
  }

  updateBatchIssueQuantity(batch: DeliveryBatchSelection, value: string): void {
    const index = this.activeBatchSelectionLineIndex();
    if (index === null) {
      return;
    }

    const row = this.contentLines()[index];
    if (!row) {
      return;
    }

    const quantity = value === '' ? null : Number(value);
    const normalizedQuantity = Number.isNaN(quantity) ? null : quantity;

    if (normalizedQuantity == null) {
      this.contentLines.update((rows) =>
        rows.map((item, rowIndex) => {
          if (rowIndex !== index) {
            return item;
          }

          const updatedBatches = (item.availableBatches ?? []).map((availableBatch) => {
            if (availableBatch.batchNo !== batch.batchNo) {
              return availableBatch;
            }
            return { ...availableBatch, issueQuantity: null };
          });

          return {
            ...item,
            availableBatches: updatedBatches,
          };
        }),
      );
      return;
    }

    const maxAllowed = this.getMaxAvailableForBatch(batch, row);
    const clampedQuantity = Math.min(normalizedQuantity, maxAllowed);

    this.contentLines.update((rows) =>
      rows.map((item, rowIndex) => {
        if (rowIndex !== index) {
          return item;
        }

        const updatedBatches = (item.availableBatches ?? []).map((availableBatch) => {
          if (availableBatch.batchNo !== batch.batchNo) {
            return availableBatch;
          }
          return { ...availableBatch, issueQuantity: clampedQuantity };
        });

        return {
          ...item,
          availableBatches: updatedBatches,
        };
      }),
    );
  }

  validateBatchIssueQuantity(batch: DeliveryBatchSelection, line: DeliveryLine): void {
    const maxAvailable = this.getMaxAvailableForBatch(batch, line);
    const currentValue = batch.issueQuantity ?? 0;
    if (currentValue > maxAvailable) {
      const index = this.activeBatchSelectionLineIndex();
      if (index !== null) {
        this.contentLines.update((rows) =>
          rows.map((item, rowIndex) => {
            if (rowIndex !== index) {
              return item;
            }

            const updatedBatches = (item.availableBatches ?? []).map((availableBatch) => {
              if (availableBatch.batchNo !== batch.batchNo) {
                return availableBatch;
              }
              return { ...availableBatch, issueQuantity: maxAvailable };
            });

            return {
              ...item,
              availableBatches: updatedBatches,
            };
          }),
        );
      }
    }
  }

  onBatchIssueQuantityInput(batch: DeliveryBatchSelection, line: DeliveryLine, event: Event): void {
    const input = event.target as HTMLInputElement;
    const maxAvailable = this.getMaxAvailableForBatch(batch, line);
    const currentValue = Number(input.value);

    if (Number.isNaN(currentValue) || currentValue < 0) {
      input.value = (batch.issueQuantity ?? 0).toString();
      return;
    }

    if (currentValue > maxAvailable) {
      input.value = maxAvailable.toString();
      this.updateBatchIssueQuantity(batch, maxAvailable.toString());
      return;
    }
  }

  selectBatchForActiveLine(batch: DeliveryBatchSelection): void {
    const index = this.activeBatchSelectionLineIndex();
    if (index === null) {
      return;
    }

    this.contentLines.update((rows) =>
      rows.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }

        const updatedBatches = (row.availableBatches ?? []).map((availableBatch) => ({
          ...availableBatch,
          issueQuantity: availableBatch.batchNo === batch.batchNo ? availableBatch.issueQuantity ?? 0 : availableBatch.issueQuantity ?? null,
        }));

        return {
          ...row,
          batchSerialNumber: batch.batchNo,
          availableBatches: updatedBatches,
        };
      }),
    );
  }

  chooseSalesOrder(order: SalesOrderRecord): void {
    const next = new Set(this.selectedSalesOrders());
    if (next.has(order.docEntry)) {
      next.delete(order.docEntry);
    } else {
      next.add(order.docEntry);
    }
    this.selectedSalesOrders.set(next);
  }

  copyFromSalesOrder(): void {
    const selected = this.salesOrders().filter((order) => this.selectedSalesOrders().has(order.docEntry));
    if (selected.length === 0) {
      return;
    }

    this.applySalesOrders(selected);
  }

  applySalesOrders(orders: SalesOrderRecord[]): void {
    const [firstOrder] = orders;
    if (!firstOrder) {
      return;
    }

    const shipToAddresses = Array.from(new Map(
      orders
        .flatMap((order) => order.shipToAddresses.length > 0
          ? order.shipToAddresses.map((address) => this.toDeliveryAddress(address))
          : [{ ...createEmptyDeliveryAddress(), address: order.address.trim() }])
        .filter((address) => address.address.length > 0)
        .map((address) => [this.addressKey(address), address]),
    ).values());
    const nextShipToAddresses = shipToAddresses.length > 0
      ? shipToAddresses
      : [createEmptyDeliveryAddress()];

    this.selectedShipToAddressIndex.set(0);
    this.headerForm.update((state) => ({
      ...state,
      branchId: firstOrder.branchId || state.branchId,
      branchName: resolveBranchNameFromBplId(firstOrder.branchId) || state.branchName,
      customer: firstOrder.cardCode,
      customerName: firstOrder.cardName,
      customerRefNo: firstOrder.customerPoNo || state.customerRefNo,
      baseSalesOrderNumber: orders.map((order) => order.docNum).filter(Boolean).join(', '),
      baseSalesOrderDocEntry: firstOrder.docEntry,
      shipToAddress: firstOrder.address,
      shipToAddresses: nextShipToAddresses,
      driver: firstOrder.driverName || state.driver,
      vehicleNumber: firstOrder.vehicleNo || state.vehicleNumber,
      postingDate: firstOrder.docDate || state.postingDate,
      documentDate: firstOrder.docDueDate || firstOrder.docDate || state.documentDate,
    }));

    const mergedLines = orders.flatMap((order) =>
      order.items.length > 0
        ? order.items.map((line) => ({
            ...createEmptyDeliveryLine(),
            itemCode: line.itemCode,
            itemDescription: line.itemDescription,
            baseDocEntry: line.docEntry || order.docEntry,
            baseLine: line.lineNum,
            quantity: line.quantity,
            warehouse: line.warehouse,
            unitOfMeasure: line.uom || this.oitmItemsService.getCatalog()
              .find((item) => item.itemCode.trim().toLowerCase() === line.itemCode.trim().toLowerCase())?.uom || '',
            unitPrice: line.unitPrice,
            batchSerialNumber: '',
            taxCode: '',
            qtyPerJumboCarton: line.qtyPerJumboCarton ?? null,
            jumboCartonsCount: line.jumboCartonsCount ?? null,
            branch: resolveBranchNameFromBplId(order.branchId) || '',
          }))
        : [createEmptyDeliveryLine()],
    );

    this.contentLines.set(mergedLines.length > 0 ? mergedLines : [createEmptyDeliveryLine()]);
    this.closeSalesOrderDialog();
  }

  private toDeliveryAddress(address: SalesOrderAddress): DeliveryAddress {
    return {
      address: address.address,
      street: address.street,
      streetNo: address.streetNo,
      block: address.block,
      building: address.building,
      city: address.city,
      zipCode: address.zipCode,
      state: address.state,
      country: address.country,
    };
  }

  private addressKey(address: DeliveryAddress): string {
    return [
      address.address,
      address.street,
      address.streetNo,
      address.block,
      address.building,
      address.city,
      address.zipCode,
      address.state,
      address.country,
    ].join('|').toLowerCase();
  }

  cancel(): void {
    void this.router.navigate(['/miscellaneous']);
  }

  save(): void {
    if (this.saving()) {
      return;
    }

    const header = this.headerForm();
    if (!header.customer.trim()) {
      this.alertService.validation('Customer code is required. Select a Sales Order first.');
      return;
    }

    if (!header.baseSalesOrderDocEntry.trim()) {
      this.alertService.validation('Base Sales Order is required. Use Copy From SO.');
      return;
    }

    if (!header.documentDate.trim()) {
      this.alertService.validation('Doc Date is required.');
      return;
    }

    if (!header.postingDate.trim()) {
      this.alertService.validation('Posting Date is required.');
      return;
    }

    const lines = this.contentLines().filter((line) => line.itemCode.trim());
    if (lines.length === 0) {
      this.alertService.validation('At least one line item is required.');
      return;
    }

    const missingWarehouse = lines.some((line) => !line.warehouse.trim());
    if (missingWarehouse) {
      this.alertService.validation('Warehouse is required for every line item.');
      return;
    }

    const missingQty = lines.some((line) => line.quantity == null || line.quantity <= 0);
    if (missingQty) {
      this.alertService.validation('Quantity is required for every line item.');
      return;
    }

    const payload = buildCreateDeliveryPayload(header, lines);

    this.saving.set(true);
    this.deliveryService.create(payload).subscribe({
      next: (response) => {
        this.saving.set(false);
        const ok = response?.success === true || response?.status === true;
        if (!ok) {
          void this.alertService.error(
            'Save Failed',
            formatSapApiFailureMessage(response, 'Delivery could not be saved.'),
          );
          return;
        }

        const message =
          response?.message?.trim() ||
          (response?.docEntry != null
            ? `Delivery created (Doc #${response.docEntry}).`
            : response?.data?.['docEntry'] != null
              ? `Delivery created (Doc #${response.data['docEntry']}).`
              : 'Delivery was created successfully.');

        void this.alertService.successAndWait('Success', message).then(() => {
          void this.router.navigate(['/miscellaneous/delivery']);
        });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        void this.alertService.error(
          'Save Failed',
          formatApiErrorMessage(err, 'Could not save delivery. Make sure the backend is running.'),
        );
      },
    });
  }

  updateBatchLegacyBatch(batch: DeliveryBatchSelection, value: string): void {
    const index = this.activeBatchSelectionLineIndex();
    if (index === null) {
      return;
    }

    this.contentLines.update((rows) => rows.map((row, rowIndex) => rowIndex === index
      ? {
          ...row,
          availableBatches: (row.availableBatches ?? []).map((availableBatch) => availableBatch.batchNo === batch.batchNo
            ? { ...availableBatch, legacyBatch: value }
            : availableBatch),
        }
      : row));
  }
}
