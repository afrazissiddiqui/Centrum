import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertService } from '../../../../services/alert.service';
import { AuthService } from '../../../../services/auth.service';
import { OitmItemsService } from '../../../../services/oitm-items.service';
import { WarehouseService } from '../../../../services/warehouse.service';
import { MiscellaneousLayoutService } from '../../miscellaneous-layout.service';
import { OitmItem } from '../../../../constants/oitm-items';
import { OitmItemPickerDialogComponent } from '../../oitm-item-picker-dialog';
import { WarehouseSearchSelectComponent } from '../../warehouse-search-select';
import {
  InventoryTransferHeader,
  InventoryTransferLine,
  createEmptyInventoryTransferHeader,
  createEmptyInventoryTransferLine,
} from '../inventory-transfer.model';
import {
  buildCreateInventoryTransferPayload,
  InventoryTransferRequestRecord,
  InventoryTransferService,
} from '../inventory-transfer.service';
import { formatApiErrorMessage, formatSapApiFailureMessage } from '../../../../utils/api-error.util';
import { resolveBranchNameFromBplId } from '../../../../utils/branch-name.util';

export function resolveInventoryTransferBranchName(value: string | number | undefined | null): string {
  return resolveBranchNameFromBplId(value);
}

@Component({
  selector: 'app-add-inventory-transfer',
  standalone: true,
  imports: [CommonModule, FormsModule, OitmItemPickerDialogComponent, WarehouseSearchSelectComponent],
  templateUrl: './add-inventory-transfer.html',
  styleUrls: ['../../miscellaneous-form.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AddInventoryTransfer implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly inventoryTransferService = inject(InventoryTransferService);
  private readonly oitmItemsService = inject(OitmItemsService);
  private readonly warehouseService = inject(WarehouseService);
  protected readonly layout = inject(MiscellaneousLayoutService);

  readonly saving = signal(false);
  readonly activeSection = signal<'header' | 'items' | 'footer'>('header');
  readonly itemPickerOpen = signal(false);
  readonly itemPickerRowIndex = signal<number | null>(null);
  readonly submittedBy = signal(this.authService.getSessionUser()?.name ?? '');
  readonly itrDialogOpen = signal(false);
  readonly itrRequests = signal<InventoryTransferRequestRecord[]>([]);
  readonly itrRequestsLoading = signal(false);
  readonly itrRequestsError = signal<string | null>(null);
  readonly selectedItrRequest = signal<InventoryTransferRequestRecord | null>(null);

  readonly editingId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  readonly pageTitle = computed(() =>
    this.editingId() ? 'Edit Inventory Transfer' : 'Add Inventory Transfer',
  );

  readonly branchOptions = signal([
    { code: '1', name: 'AHCP_Peshawar' },
    { code: '2', name: 'AHCP_HO' },
    { code: '3', name: 'AHCP_Faisalabad' },
  ]);
  readonly selectedBranchCode = signal('1');
  readonly inventoryTransferUomMap = signal<Record<string, string>>({});

  readonly headerForm = signal<InventoryTransferHeader>(createEmptyInventoryTransferHeader());
  readonly contentLines = signal<InventoryTransferLine[]>([createEmptyInventoryTransferLine()]);

  ngOnInit(): void {
    this.oitmItemsService.ensureLoaded().subscribe({ error: () => undefined });
    this.warehouseService.ensureLoaded().subscribe({ error: () => undefined });
    this.inventoryTransferService.list().subscribe({
      next: (transfers) => {
        const uomMap = transfers.reduce<Record<string, string>>((acc, transfer) => {
          transfer.items.forEach((line) => {
            const itemCode = line.itemCode?.trim().toLowerCase();
            const uomCode = line.uomCode?.trim();
            if (itemCode && uomCode) {
              acc[itemCode] = uomCode;
            }
          });
          return acc;
        }, {});
        this.inventoryTransferUomMap.set(uomMap);
      },
      error: () => this.inventoryTransferUomMap.set({}),
    });
  }

  updateHeaderField(field: keyof InventoryTransferHeader, value: string): void {
    if (field === 'postingDate') {
      this.headerForm.update((state) => ({ ...state, postingDate: value, taxDate: value }));
      return;
    }

    if (field === 'fromWarehouse') {
      const selectedCode = value.trim();
      const matchedWarehouse = this.warehouseService
        .getCatalog()
        .find((warehouse) =>
          warehouse.warehouseCode.trim().toLowerCase() === selectedCode.toLowerCase(),
        );
      const branchName = this.resolveBranchFromWarehouseSelection(selectedCode, matchedWarehouse);

      this.headerForm.update((state) => ({
        ...state,
        fromWarehouse: value,
        fromBranch: branchName || state.fromBranch,
      }));
      return;
    }

    if (field === 'fromBranch') {
      const branchName = resolveInventoryTransferBranchName(value.trim()) || value;
      this.headerForm.update((state) => ({ ...state, fromBranch: branchName }));
      this.selectedBranchCode.set(this.resolveBranchCode(value));
      this.applyBranchWarehouses(this.selectedBranchCode());
      return;
    }

    this.headerForm.update((state) => ({ ...state, [field]: value }));
  }

  selectBranch(value: string): void {
    const branchCode = this.resolveBranchCode(value);
    const branchOption = this.branchOptions().find((option) => option.code === branchCode);
    const branchName = branchOption?.name || resolveInventoryTransferBranchName(value) || value;

    this.selectedBranchCode.set(branchCode);
    this.headerForm.update((state) => ({ ...state, fromBranch: branchName }));
    this.applyBranchWarehouses(branchCode);
  }


  private resolveBranchCode(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return '';
    }

    const directMatch = this.branchOptions().find((option) => option.code === normalized);
    if (directMatch) {
      return directMatch.code;
    }

    const branchNameMatch = this.branchOptions().find((option) =>
      option.name.toLowerCase() === normalized || option.name.toLowerCase().includes(normalized),
    );
    if (branchNameMatch) {
      return branchNameMatch.code;
    }

    if (normalized.includes('peshawar') || normalized.includes('psh')) {
      return '1';
    }
    if (normalized.includes('ho') || normalized.includes('head office') || normalized.includes('headoffice')) {
      return '2';
    }
    if (normalized.includes('faisalabad') || normalized.includes('fsd')) {
      return '3';
    }

    return '';
  }

  private resolveBranchCodeFromWarehouse(fromWarehouse: string, toWarehouse: string): string {
    const warehouseCandidates = [fromWarehouse, toWarehouse]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    for (const warehouse of warehouseCandidates) {
      if (warehouse.includes('peshawar') || warehouse.includes('psh')) {
        return '1';
      }
      if (warehouse.includes('ho') || warehouse.includes('head office') || warehouse.includes('headoffice')) {
        return '2';
      }
      if (warehouse.includes('faisalabad') || warehouse.includes('fsd')) {
        return '3';
      }
    }

    return '';
  }

  private applyBranchWarehouses(branchCode: string): void {
    const warehouseCodes = this.resolveBranchWarehouseCodes(branchCode);
    if (warehouseCodes.length === 0) {
      return;
    }

    const fromWarehouse = warehouseCodes[0] ?? '';
    const toWarehouse = warehouseCodes[1] ?? fromWarehouse;

    this.headerForm.update((state) => ({
      ...state,
      fromWarehouse: fromWarehouse || state.fromWarehouse,
      toWarehouse: toWarehouse || state.toWarehouse,
    }));
  }

  private resolveBranchWarehouseCodes(branchCode: string): string[] {
    const catalog = this.warehouseService.getCatalog();
    const branchPatterns: Record<string, string[]> = {
      '1': ['peshawar', 'psh', 'ahcp peshawar', 'psh-wh'],
      '2': ['ho', 'head office', 'headoffice', 'head-office', 'general warehouse ho'],
      '3': ['faisalabad', 'fsd', 'ahcp faisalabad', 'fsd-wh'],
    };

    const branchKeywords = branchPatterns[branchCode] ?? [];
    const matchedWarehouses = catalog.filter((warehouse) => {
      const label = `${warehouse.warehouseCode} ${warehouse.warehouseName}`.toLowerCase();
      return branchKeywords.some((keyword) => label.includes(keyword));
    });

    if (matchedWarehouses.length > 0) {
      return matchedWarehouses.slice(0, 2).map((warehouse) => warehouse.warehouseCode);
    }

    const fallbackCodes: Record<string, string[]> = {
      '1': ['PSH-WH01', 'PSH-WH02'],
      '2': ['01', '02'],
      '3': ['FSD-WH01', 'FSD-WH02'],
    };

    return fallbackCodes[branchCode] ?? [];
  }

  private resolveBranchFromWarehouseSelection(
    value: string,
    matchedWarehouse?: { warehouseCode: string; warehouseName: string } | null,
  ): string {
    const candidates = [value, matchedWarehouse?.warehouseCode ?? '', matchedWarehouse?.warehouseName ?? '']
      .map((candidate) => candidate.trim())
      .filter(Boolean);

    for (const candidate of candidates) {
      const resolved = resolveInventoryTransferBranchName(candidate);
      if (resolved) {
        return resolved;
      }
    }

    return '';
  }

  addContentLine(): void {
    const header = this.headerForm();
    this.contentLines.update((rows) => [
      ...rows,
      createEmptyInventoryTransferLine(header.fromWarehouse, header.toWarehouse),
    ]);
  }

  deleteContentLine(index: number): void {
    this.contentLines.update((rows) => rows.filter((_, i) => i !== index));
  }

  updateContentLine(index: number, field: keyof InventoryTransferLine, value: string): void {
    if (field === 'quantity') {
      this.contentLines.update((rows) =>
        rows.map((row, rowIndex) => {
          if (rowIndex !== index) {
            return row;
          }
          const numericValue = value === '' ? null : Number(value);
          return { ...row, quantity: Number.isNaN(numericValue) ? null : numericValue };
        }),
      );
      return;
    }

    if (field === 'fromWarehouse' || field === 'itemCode') {
      this.contentLines.update((rows) =>
        rows.map((row, rowIndex) => {
          if (rowIndex !== index) {
            return row;
          }
          const nextRow = { ...row, [field]: value };
          const options = this.batchOptionsForLine(nextRow);
          const nextBatch = options.includes(nextRow.batchNumber) ? nextRow.batchNumber : '';
          return { ...nextRow, batchNumber: nextBatch };
        }),
      );
      return;
    }

    this.contentLines.update((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)),
    );
  }

  batchOptionsForLine(line: InventoryTransferLine): string[] {
    if (!line.itemCode.trim()) {
      return [];
    }

    const item = this.oitmItemsService.getCatalog().find((entry) => entry.itemCode === line.itemCode);
    if (!item?.batches?.length) {
      return [];
    }

    const selectedWarehouse = this.resolveWarehouseAliases(line.fromWarehouse);
    const filtered = selectedWarehouse.length
      ? item.batches.filter((batch) => {
          const batchWarehouse = this.resolveWarehouseAliases(batch.warehouse);
          return batchWarehouse.some((value) => selectedWarehouse.includes(value));
        })
      : item.batches;

    return [...new Set(filtered.map((batch) => batch.batchNumber.trim()).filter(Boolean))];
  }

  scrollTo(section: 'header' | 'items' | 'footer'): void {
    this.activeSection.set(section);
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' });
  }

  openItemPicker(index: number): void {
    this.itemPickerRowIndex.set(index);
    this.itemPickerOpen.set(true);
  }

  openItrDialog(): void {
    this.itrDialogOpen.set(true);
    this.itrRequestsLoading.set(true);
    this.itrRequestsError.set(null);

    this.inventoryTransferService.listRequests().subscribe({
      next: (requests) => {
        this.itrRequests.set(
          requests.filter((request) => request.docStatus.trim().toUpperCase() === 'O'),
        );
        this.itrRequestsLoading.set(false);
      },
      error: () => {
        this.itrRequests.set([]);
        this.itrRequestsLoading.set(false);
        this.itrRequestsError.set('Could not load inventory transfer requests.');
      },
    });
  }

  closeItrDialog(): void {
    this.itrDialogOpen.set(false);
    this.selectedItrRequest.set(null);
  }

  chooseItrRequest(request: InventoryTransferRequestRecord): void {
    this.selectedItrRequest.set(request);
  }

  async copyFromItrRequest(): Promise<void> {
    const request = this.selectedItrRequest();
    if (!request) {
      return;
    }

    const currentBranchCode = this.selectedBranchCode();
    const requestBranchCode = this.resolveBranchCodeFromWarehouse(request.fromWarehouse, request.toWarehouse);

    if (currentBranchCode && requestBranchCode && currentBranchCode !== requestBranchCode) {
      const result = await this.alertService.confirm(
        'Branch mismatch',
        'This ITR belongs to a different branch. Do you want to continue and use the same branch selection?',
      );

      if (!result?.isConfirmed) {
        return;
      }
    }

    this.applyItrRequest(request);
  }

  applyItrRequest(request: InventoryTransferRequestRecord): void {

    const firstLine = request.items[0];

    // determine branch code from warehouses and resolve branch name
    const requestBranchCode = this.resolveBranchCodeFromWarehouse(request.fromWarehouse, request.toWarehouse);
    const requestBranchName = resolveInventoryTransferBranchName(requestBranchCode) || '';

    this.headerForm.update((state) => ({
      ...state,
      docDate: request.docDate || state.docDate,
      postingDate: request.taxDate || request.docDate || state.postingDate,
      taxDate: request.taxDate || request.docDate || state.taxDate,
      fromWarehouse: request.fromWarehouse || firstLine?.fromWarehouse || state.fromWarehouse,
      toWarehouse: request.toWarehouse || firstLine?.toWarehouse || state.toWarehouse,
      fromBranch: requestBranchName || state.fromBranch,
      baseItrDocEntry: request.docEntry,
      baseItrDocNum: request.docNum,
    }));

    // set selected branch code so warehouse selectors filter correctly
    if (requestBranchCode) {
      this.selectedBranchCode.set(requestBranchCode);
    }

    this.contentLines.set(
      request.items.length > 0
        ? request.items.map((line) => {
            const lineUomCode = line.uomCode.trim() || this.resolveUomCodeForItem(line.itemCode, line.uomName || '');
            const lineUomName = line.uomName.trim() || lineUomCode;
            const lineBranchCode = this.resolveBranchCodeFromWarehouse(line.fromWarehouse, line.toWarehouse);
            const lineToBranchName = resolveInventoryTransferBranchName(lineBranchCode) || '';

            return {
              itemCode: line.itemCode,
              itemDescription: line.itemDescription,
              itemCost: '',
              uomCode: lineUomCode,
              uomName: lineUomName,
              distrRule: '',
              fromWarehouse: line.fromWarehouse,
              fromBinLocation: '',
              toWarehouse: line.toWarehouse,
              firstToBinLocation: '',
              toBranch: lineToBranchName,
              quantity: line.quantity,
              batchNumber: line.batchNumber,
              baseEntry: line.docEntry,
              baseLine: line.lineNum,
            };
          })
        : [
            createEmptyInventoryTransferLine(request.fromWarehouse, request.toWarehouse),
          ].map((line) => ({
            ...line,
            baseEntry: request.docEntry,
          })),
    );

    this.closeItrDialog();
  }

  onItemsSelected(items: OitmItem[]): void {
    const index = this.itemPickerRowIndex();
    if (index === null || items.length === 0) {
      return;
    }

    const fromWarehouse = this.headerForm().fromWarehouse.trim();
    const validItems = items.filter((item) => this.findBatchForWarehouse(item, fromWarehouse));
    const invalidItems = items.filter((item) => !this.findBatchForWarehouse(item, fromWarehouse));

    if (invalidItems.length > 0) {
      const codes = invalidItems.map((item) => item.itemCode).join(', ');
      this.alertService.validation(
        fromWarehouse
          ? `No batch found for: ${codes} in warehouse ${fromWarehouse}. Those items were not added.`
          : `Select From Warehouse first. Items not added: ${codes}.`,
      );
    }

    if (validItems.length === 0) {
      if (items.length > 0 && !fromWarehouse) {
        this.itemPickerRowIndex.set(null);
        return;
      }
      this.removeRow(index);
      this.itemPickerRowIndex.set(null);
      return;
    }

    this.contentLines.update((rows) => {
      const updated = [...rows];
      const first = validItems[0];
      const firstBatch = this.findBatchForWarehouse(first, fromWarehouse);
      const firstUomCode = this.resolveUomCodeForItem(first.itemCode, first.uom || '');
      updated[index] = {
        ...updated[index],
        itemCode: first.itemCode,
        itemDescription: first.itemName,
        uomCode: firstUomCode,
        uomName: firstUomCode,
        fromWarehouse: updated[index]?.fromWarehouse || fromWarehouse,
        toWarehouse: updated[index]?.toWarehouse || this.headerForm().toWarehouse,
        batchNumber: firstBatch?.batchNumber || '',
        baseEntry: updated[index]?.baseEntry || '',
        baseLine: updated[index]?.baseLine || '',
      };

      const extras = validItems.slice(1).map((item) => {
        const batch = this.findBatchForWarehouse(item, fromWarehouse);
        const uomCode = this.resolveUomCodeForItem(item.itemCode, item.uom || '');
        return {
          ...createEmptyInventoryTransferLine(fromWarehouse, this.headerForm().toWarehouse),
          itemCode: item.itemCode,
          itemDescription: item.itemName,
          uomCode,
          uomName: uomCode,
          batchNumber: batch?.batchNumber || '',
        };
      });

      return [...updated, ...extras];
    });

    this.itemPickerRowIndex.set(null);
  }

  private resolveUomCodeForItem(itemCode: string, fallback = ''): string {
    const normalized = itemCode.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }

    const fromApi = this.inventoryTransferUomMap()[normalized];
    if (fromApi?.trim()) {
      return fromApi.trim();
    }

    return fallback;
  }

  private findBatchForWarehouse(item: OitmItem | undefined, warehouseValue: string) {
    if (!item || !warehouseValue.trim()) {
      return undefined;
    }

    const selectedWarehouse = this.resolveWarehouseAliases(warehouseValue);
    return item.batches?.find((batch) => {
      const batchWarehouse = this.resolveWarehouseAliases(batch.warehouse);
      return batchWarehouse.some((value) => selectedWarehouse.includes(value));
    });
  }

  private resolveWarehouseAliases(value: string): string[] {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    const aliases = new Set([normalized]);
    const warehouse = this.warehouseService.getCatalog().find((entry) => {
      const code = entry.warehouseCode.trim().toLowerCase();
      const name = entry.warehouseName.trim().toLowerCase();
      return code === normalized || name === normalized;
    });

    if (warehouse) {
      aliases.add(warehouse.warehouseCode.trim().toLowerCase());
      aliases.add(warehouse.warehouseName.trim().toLowerCase());
    }

    return [...aliases];
  }

  private removeRow(index: number): void {
    this.contentLines.update((rows) => {
      if (rows.length <= 1) {
        return [
          createEmptyInventoryTransferLine(
            this.headerForm().fromWarehouse,
            this.headerForm().toWarehouse,
          ),
        ];
      }

      return rows.filter((_, rowIndex) => rowIndex !== index);
    });
  }

  save(): void {
    if (this.saving()) {
      return;
    }

    const header = this.headerForm();
    if (!header.docDate.trim()) {
      this.alertService.validation('Doc Date is required.');
      return;
    }

    if (!header.taxDate.trim()) {
      this.alertService.validation('Tax Date is required.');
      return;
    }

    if (!header.fromWarehouse.trim()) {
      this.alertService.validation('From Warehouse is required.');
      return;
    }

    if (!header.toWarehouse.trim()) {
      this.alertService.validation('To Warehouse is required.');
      return;
    }

    const lines = this.contentLines().filter((line) => line.itemCode.trim());
    if (lines.length === 0) {
      this.alertService.validation('At least one line item is required.');
      return;
    }

    const missingQuantity = lines.some((line) => line.quantity == null || line.quantity <= 0);
    if (missingQuantity) {
      this.alertService.validation('Quantity is required for every line item.');
      return;
    }

    const missingWarehouse = lines.some(
      (line) => !line.fromWarehouse.trim() || !line.toWarehouse.trim(),
    );
    if (missingWarehouse) {
      this.alertService.validation('From Warehouse and To Warehouse are required for every line item.');
      return;
    }

    const missingBatch = lines.some((line) => !line.batchNumber.trim());
    if (missingBatch) {
      this.alertService.validation('Batch Number is required for every line item.');
      return;
    }

    const missingUomCode = lines.some((line) => !line.uomCode.trim());
    if (missingUomCode) {
      this.alertService.validation('UoM Code is required for every line item.');
      return;
    }

    const payload = buildCreateInventoryTransferPayload(header, lines);

    this.saving.set(true);
    this.inventoryTransferService.create(payload).subscribe({
      next: (response) => {
        this.saving.set(false);
        const ok = response?.success === true || response?.status === true;
        if (!ok) {
          void this.alertService.error(
            'Save Failed',
            formatSapApiFailureMessage(response, 'Inventory transfer could not be saved.'),
          );
          return;
        }

        const message =
          response?.message?.trim() ||
          (response?.docEntry != null
            ? `Inventory transfer created (Doc #${response.docEntry}).`
            : response?.data?.['docEntry'] != null
              ? `Inventory transfer created (Doc #${response.data['docEntry']}).`
              : 'Inventory transfer was created successfully.');

        void this.alertService.successAndWait('Success', message).then(() => {
          void this.router.navigate(['/miscellaneous/inventory-transfer']);
        });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        void this.alertService.error(
          'Save Failed',
          formatApiErrorMessage(err, 'Could not save inventory transfer. Make sure the backend is running.'),
        );
      },
    });
  }
}
