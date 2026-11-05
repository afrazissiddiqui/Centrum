import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertService } from '../../../../services/alert.service';
import { AuthService } from '../../../../services/auth.service';
import { OitmItemsService } from '../../../../services/oitm-items.service';
import { WarehouseService } from '../../../../services/warehouse.service';
import { DepartmentsPrService, DepartmentPr } from '../../../../services/departments-pr.service';
import { MiscellaneousLayoutService } from '../../miscellaneous-layout.service';
import { OitmItem } from '../../../../constants/oitm-items';
import { OitmItemPickerDialogComponent } from '../../oitm-item-picker-dialog';
import {
  GoodIssueHeader,
  GoodIssueLine,
  GoodIssueBatchSelection,
  createEmptyGoodIssueHeader,
  createEmptyGoodIssueLine,
  updateGoodIssueLine,
} from '../good-issue.model';
import { GoodIssueService, buildCreateGoodIssuePayload, InventoryAccountOption } from '../good-issue.service';
import { formatApiErrorMessage, formatSapApiFailureMessage } from '../../../../utils/api-error.util';
import { GL_ACCOUNT_BRANCH_OPTIONS } from '../../../setup/gl-account-determination/gl-account-branch.options';

const ISSUE_REASON_ACCOUNT_CODES: Record<string, string> = {
  'Toll to Own Conversion of Goods': 'A02022000100030',
  'Toll to Own Resin Conversion': 'A02022000100140',
  'Msc CGS Receipts Issues': 'C01001000100920',
};

@Component({
  selector: 'app-add-good-issue',
  standalone: true,
  imports: [CommonModule, FormsModule, OitmItemPickerDialogComponent],
  templateUrl: './add-good-issue.html',
  styleUrls: ['../../miscellaneous-form.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AddGoodIssue implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly goodIssueService = inject(GoodIssueService);
  private readonly oitmItemsService = inject(OitmItemsService);
  private readonly warehouseService = inject(WarehouseService);
  readonly warehouseOptions = this.warehouseService.warehouses;
  private readonly departmentsPrService = inject(DepartmentsPrService);
  protected readonly layout = inject(MiscellaneousLayoutService);

  readonly saving = signal(false);
  readonly activeSection = signal<'header' | 'items' | 'footer'>('header');
  readonly itemPickerOpen = signal(false);
  readonly itemPickerRowIndex = signal<number | null>(null);
  readonly submittedBy = signal(this.authService.getSessionUser()?.name ?? '');
  readonly editingId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  readonly pageTitle = computed(() =>
    this.editingId() ? 'Edit Good Issue' : 'Add Good Issue',
  );

  readonly branchOptions = signal(GL_ACCOUNT_BRANCH_OPTIONS);

  readonly headerForm = signal<GoodIssueHeader>(createEmptyGoodIssueHeader());
  readonly contentLines = signal<GoodIssueLine[]>([createEmptyGoodIssueLine()]);
  readonly accountCodeOptions = signal<InventoryAccountOption[]>([]);
  readonly accountCodeOptionsLoading = signal(false);
  readonly accountCodeOptionsError = signal('');
  readonly accountCodeSearchText = signal<{ [key: number]: string }>({});
  readonly openAccountCodeDropdown = signal<number | null>(null);
  readonly departmentOptions = signal<DepartmentPr[]>([]);
  readonly batchSelectionDialogOpen = signal(false);
  readonly activeBatchSelectionLineIndex = signal<number | null>(null);

  readonly totalAmount = computed(() =>
    this.contentLines()
      .map((line) => (line.quantity ?? 0) * (line.unitPrice ?? 0))
      .reduce((sum, amount) => sum + amount, 0),
  );

  ngOnInit(): void {
    this.oitmItemsService.ensureLoaded().subscribe({ error: () => undefined });
    this.warehouseService.ensureLoaded().subscribe({ error: () => undefined });
    this.loadDepartmentOptions();
    this.loadAccountCodeOptions();
  }

  loadDepartmentOptions(): void {
    if (this.departmentOptions().length > 0) {
      return;
    }

    this.departmentsPrService.ensureLoaded().subscribe((options) => {
      this.departmentOptions.set(options);
    });
  }

  private loadAccountCodeOptions(): void {
    const header = this.headerForm();
    const branch = header.branchId.trim();
    const docDate = header.docDate.trim();
    const taxDate = header.taxDate.trim();
    const docDueDate = header.docDueDate.trim();

    if (!branch || !docDate || !taxDate || !docDueDate) {
      this.accountCodeOptions.set([]);
      this.accountCodeOptionsError.set('');
      return;
    }

    this.accountCodeOptionsLoading.set(true);
    this.accountCodeOptionsError.set('');
    this.goodIssueService.listInventoryAccounts(branch, docDate, taxDate, docDueDate).subscribe({
      next: (options) => {
        this.accountCodeOptions.set(options);
        this.accountCodeOptionsLoading.set(false);
      },
      error: () => {
        this.accountCodeOptions.set([]);
        this.accountCodeOptionsError.set('Could not load account codes.');
        this.accountCodeOptionsLoading.set(false);
      },
    });
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
    this.loadAccountCodeOptions();
  }

  updateHeaderField(field: keyof GoodIssueHeader, value: string): void {
    this.headerForm.update((state) => ({ ...state, [field]: value }));
    if (field === 'issueReceiptReason') {
      const defaultLine = createEmptyGoodIssueLine();
      const accountCode = ISSUE_REASON_ACCOUNT_CODES[value] ?? defaultLine.accountCode;
      this.contentLines.update((rows) => rows.map((line) => ({ ...line, accountCode })));
      this.accountCodeSearchText.set({});
      this.openAccountCodeDropdown.set(null);
    }
    if (field === 'docDate' || field === 'taxDate' || field === 'docDueDate') {
      this.loadAccountCodeOptions();
    }
  }

  addContentLine(): void {
    this.contentLines.update((rows) => [...rows, this.createGoodIssueLine()]);
  }

  deleteContentLine(index: number): void {
    this.contentLines.update((lines) => lines.filter((_, i) => i !== index));
  }

  updateContentLine(index: number, field: keyof GoodIssueLine, value: string): void {
    if (field === 'warehouse') {
      const row = this.contentLines()[index];
      if (!row) {
        return;
      }

      const nextRow = { ...row, warehouse: value };
      const selectedItem = this.oitmItemForRow(row.itemCode);
      const matchingBatch = this.findBatchForWarehouse(selectedItem, value);
      if (!matchingBatch) {
        this.removeRowWithAlert(
          index,
          `No batch number found for item ${row.itemCode} in warehouse ${value}.`,
        );
        return;
      }

      this.contentLines.update((rows) =>
        rows.map((existingRow, rowIndex) =>
          rowIndex !== index
            ? existingRow
            : {
                ...nextRow,
                batchSerialNumber: matchingBatch.batchNumber || nextRow.batchSerialNumber,
                manufacturingDate: matchingBatch.manufacturingDate
                  ? String(matchingBatch.manufacturingDate).split(' ')[0]
                  : nextRow.manufacturingDate,
                expiryDate: matchingBatch.expiryDate
                  ? String(matchingBatch.expiryDate).split(' ')[0]
                  : nextRow.expiryDate,
              },
        ),
      );
      return;
    }

    this.contentLines.update((rows) => updateGoodIssueLine(rows, index, field, value));
  }

  getFilteredAccountCodes(searchText: string): InventoryAccountOption[] {
    if (!searchText.trim()) {
      return this.accountCodeOptions();
    }

    const lower = searchText.toLowerCase();
    return this.accountCodeOptions().filter(
      (account) =>
        account.code.toLowerCase().includes(lower) ||
        (account.name && account.name.toLowerCase().includes(lower)),
    );
  }

  getAccountCodeDisplay(code: string): string {
    const account = this.accountCodeOptions().find((option) => option.code.trim() === code.trim());
    if (!account) {
      return code;
    }

    return account.name && account.name !== account.code
      ? `${account.name} (${account.code})`
      : account.code;
  }

  updateAccountCodeSearch(index: number, value: string): void {
    if (!value.trim()) {
      this.updateContentLine(index, 'accountCode', '');
    }

    this.accountCodeSearchText.update((state) => ({
      ...state,
      [index]: value,
    }));
  }

  selectAccountCode(index: number, code: string): void {
    this.updateContentLine(index, 'accountCode', code);
    this.accountCodeSearchText.update((state) => {
      const next = { ...state };
      delete next[index];
      return next;
    });
    this.openAccountCodeDropdown.set(null);
  }

  openAccountCodeSearch(index: number, input: HTMLInputElement): void {
    this.openAccountCodeDropdown.set(index);
    input.select();
  }

  getDropdownStyle(lineIndex: number, input: HTMLInputElement | null): string {
    if (!input) return '';
    const rect = input.getBoundingClientRect();
    return `position: fixed; top: ${rect.bottom + 2}px; left: ${rect.left}px; width: ${rect.width}px; background: white; border: 1px solid #ccc; max-height: 200px; overflow-y: auto; z-index: 10000;`;
  }

  openBatchSelectionDialog(): void {
    const lines = this.contentLines().filter((line) => line.itemCode.trim());
    if (lines.length === 0) {
      void this.alertService.warning('No items added', 'Add at least one item before opening the batch selection modal.');
      return;
    }

    this.contentLines.update((rows) =>
      rows.map((row) => {
        if (!row.itemCode.trim()) {
          return row;
        }

        const availableBatches = row.availableBatches?.length
          ? row.availableBatches
          : this.buildAvailableBatchesForLine(row);
        return {
          ...row,
          availableBatches,
          batchSerialNumber: availableBatches.some((batch) => batch.batchNo === row.batchSerialNumber)
            ? row.batchSerialNumber
            : availableBatches[0]?.batchNo ?? row.batchSerialNumber,
        };
      }),
    );

    const firstBatchLineIndex = this.contentLines().findIndex((line) => line.itemCode.trim());
    this.activeBatchSelectionLineIndex.set(firstBatchLineIndex >= 0 ? firstBatchLineIndex : null);
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

  getActiveBatchSelectionLine(): GoodIssueLine | null {
    const index = this.activeBatchSelectionLineIndex();
    return index === null ? null : this.contentLines()[index] ?? null;
  }

  selectBatchForActiveLine(batch: GoodIssueBatchSelection): void {
    const index = this.activeBatchSelectionLineIndex();
    if (index === null) {
      return;
    }

    this.contentLines.update((rows) => rows.map((row, rowIndex) => rowIndex === index
      ? {
          ...row,
          batchSerialNumber: batch.batchNo,
          availableBatches: (row.availableBatches ?? []).map((availableBatch) => ({
            ...availableBatch,
            issueQuantity: availableBatch.batchNo === batch.batchNo
              ? availableBatch.issueQuantity ?? 0
              : availableBatch.issueQuantity ?? null,
          })),
        }
      : row));
  }

  updateBatchIssueQuantity(batch: GoodIssueBatchSelection, value: string): void {
    const index = this.activeBatchSelectionLineIndex();
    const line = index === null ? null : this.contentLines()[index];
    if (index === null || !line) {
      return;
    }

    const quantity = value === '' ? null : Number(value);
    const normalized = quantity === null || Number.isNaN(quantity) ? null : quantity;
    const maxAllowed = normalized === null ? 0 : this.getMaxAvailableForBatch(batch, line);
    const issueQuantity = normalized === null ? null : Math.min(normalized, maxAllowed);

    this.contentLines.update((rows) => rows.map((row, rowIndex) => rowIndex === index
      ? { ...row, availableBatches: (row.availableBatches ?? []).map((availableBatch) => availableBatch.batchNo === batch.batchNo ? { ...availableBatch, issueQuantity } : availableBatch) }
      : row));
  }

  updateBatchLegacyBatch(batch: GoodIssueBatchSelection, value: string): void {
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

  getMaxAvailableForBatch(batch: GoodIssueBatchSelection, line: GoodIssueLine): number {
    const otherAllocations = (line.availableBatches ?? [])
      .filter((availableBatch) => availableBatch.batchNo !== batch.batchNo)
      .reduce((sum, availableBatch) => sum + (availableBatch.issueQuantity ?? 0), 0);
    return Math.max(0, Math.min(batch.quantity, (line.quantity ?? 0) - otherAllocations));
  }

  isBatchSelectionComplete(line: GoodIssueLine): boolean {
    return (line.availableBatches ?? []).some((batch) => (batch.issueQuantity ?? 0) > 0);
  }

  getRemainingRequiredQuantity(line: GoodIssueLine): number {
    const allocated = (line.availableBatches ?? []).reduce((sum, batch) => sum + (batch.issueQuantity ?? 0), 0);
    return Math.max(0, (line.quantity ?? 0) - allocated);
  }

  getAlreadyIssuedQuantity(line: GoodIssueLine): number {
    return Math.max(0, (line.quantity ?? 0) - this.getRemainingRequiredQuantity(line));
  }

  onBatchIssueQuantityInput(batch: GoodIssueBatchSelection, line: GoodIssueLine, event: Event): void {
    const input = event.target as HTMLInputElement;
    const maxAllowed = this.getMaxAvailableForBatch(batch, line);
    const value = Number(input.value);
    if (Number.isNaN(value) || value < 0) {
      input.value = (batch.issueQuantity ?? 0).toString();
      return;
    }
    if (value > maxAllowed) {
      input.value = maxAllowed.toString();
      this.updateBatchIssueQuantity(batch, input.value);
    }
  }

  private buildAvailableBatchesForLine(line: GoodIssueLine): GoodIssueBatchSelection[] {
    const item = this.oitmItemForRow(line.itemCode);
    const selectedWarehouse = this.resolveWarehouseAliases(line.warehouse);
    return (item?.batches ?? [])
      .filter((batch) => !selectedWarehouse.length || this.resolveWarehouseAliases(batch.warehouse).some((value) => selectedWarehouse.includes(value)))
      .map((batch) => ({
        batchNo: batch.batchNumber.trim(),
        quantity: Number(batch.quantity ?? 0),
        legacyBatch: batch.legacyBatch ?? '',
        issueQuantity: batch.batchNumber.trim() === line.batchSerialNumber.trim() ? line.quantity ?? 0 : null,
      }))
      .filter((batch) => batch.batchNo.length > 0);
  }

  formatAmount(value: number): string {
    return value === 0
      ? '0.00'
      : value.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  }

  scrollTo(section: 'header' | 'items' | 'footer'): void {
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

    const validItems = items;

    this.contentLines.update((rows) => {
      const updated = [...rows];
      const first = validItems[0];
      const firstBatch = this.firstBatchWithNumber(first);
      const selectedUom = first.uom?.trim() || '';
      updated[index] = {
        ...updated[index],
        itemCode: first.itemCode,
        itemDescription: first.itemName,
        warehouse: firstBatch?.warehouse || updated[index].warehouse,
        batchSerialNumber: firstBatch?.batchNumber || '',
        manufacturingDate: firstBatch?.manufacturingDate
          ? String(firstBatch.manufacturingDate).split(' ')[0]
          : '',
        expiryDate: firstBatch?.expiryDate
          ? String(firstBatch.expiryDate).split(' ')[0]
          : createEmptyGoodIssueLine().expiryDate,
        uomCode: selectedUom,
        uomName: selectedUom,
      };

      const extras = validItems.slice(1).map((item) => {
        const batch = this.firstBatchWithNumber(item);
        const selectedUom = item.uom?.trim() || '';
        return {
          ...this.createGoodIssueLine(),
          itemCode: item.itemCode,
          itemDescription: item.itemName,
          warehouse: batch?.warehouse || '',
          batchSerialNumber: batch?.batchNumber || '',
          manufacturingDate: batch?.manufacturingDate
            ? String(batch.manufacturingDate).split(' ')[0]
            : '',
          expiryDate: batch?.expiryDate
            ? String(batch.expiryDate).split(' ')[0]
            : createEmptyGoodIssueLine().expiryDate,
          uomCode: selectedUom,
          uomName: selectedUom,
        };
      });

      return [...updated, ...extras];
    });

    this.itemPickerRowIndex.set(null);
  }

  save(): void {
    if (this.saving()) {
      return;
    }

    const header = this.headerForm();
    if (!header.docDate.trim()) {
      this.alertService.validation('Posting Date is required.');
      return;
    }

    const lines = this.contentLines().filter((line) => line.itemCode.trim());
    if (lines.length === 0) {
      this.alertService.validation('At least one line item is required.');
      return;
    }

    if (lines.some((line) => !line.warehouse.trim())) {
      this.alertService.validation('Warehouse is required for every line item.');
      return;
    }

    if (lines.some((line) => line.quantity == null || line.quantity <= 0)) {
      this.alertService.validation('Quantity is required for every line item.');
      return;
    }

    const payload = buildCreateGoodIssuePayload(header, this.contentLines());

    this.saving.set(true);
    this.goodIssueService.create(payload).subscribe({
      next: (response) => {
        this.saving.set(false);
        const ok = response?.success === true || response?.status === true;
        if (!ok) {
          void this.alertService.error(
            'Save Failed',
            formatSapApiFailureMessage(response, 'Good issue could not be saved.'),
          );
          return;
        }

        const docEntry = response?.docEntry ?? response?.data?.['docEntry'];
        const message =
          response?.message?.trim() ||
          (docEntry != null
            ? `Good issue created (Doc #${docEntry}).`
            : 'Good issue was created successfully.');

        void this.alertService.successAndWait('Success', message).then(() => {
          void this.router.navigate(['/miscellaneous/good-issue']);
        });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        void this.alertService.error(
          'Save Failed',
          formatApiErrorMessage(err, 'Could not save good issue. Make sure the backend is running.'),
        );
      },
    });
  }

  private oitmItemForRow(itemCode: string): OitmItem | undefined {
    return this.oitmItemsService.getCatalog().find((item) => item.itemCode === itemCode);
  }

  private firstBatchWithNumber(item: OitmItem | undefined) {
    return item?.batches?.find((batch) => batch.batchNumber?.trim());
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

  private createGoodIssueLine(): GoodIssueLine {
    const line = createEmptyGoodIssueLine();
    return {
      ...line,
      accountCode: ISSUE_REASON_ACCOUNT_CODES[this.headerForm().issueReceiptReason] ?? line.accountCode,
    };
  }

  private removeRow(index: number): void {
    this.contentLines.update((rows) => {
      if (rows.length <= 1) {
        return [this.createGoodIssueLine()];
      }
      return rows.filter((_, rowIndex) => rowIndex !== index);
    });
  }

  private removeRowWithAlert(index: number, message: string): void {
    this.removeRow(index);
    this.alertService.validation(message);
  }
}