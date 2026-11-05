import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertService } from '../../../../services/alert.service';
import { AuthService } from '../../../../services/auth.service';
import { GoodReceiptService, buildCreateGoodReceiptPayload, InventoryAccountOption } from '../good-receipt.service';
import { DepartmentsPrService, DepartmentPr } from '../../../../services/departments-pr.service';
import { WarehouseOption, WarehouseService } from '../../../../services/warehouse.service';
import { formatApiErrorMessage, formatSapApiFailureMessage } from '../../../../utils/api-error.util';
import { MiscellaneousLayoutService } from '../../miscellaneous-layout.service';
import { OitmItem } from '../../../../constants/oitm-items';
import { OitmItemPickerDialogComponent } from '../../oitm-item-picker-dialog';
import {
  GoodReceiptHeader,
  GoodReceiptLine,
  createEmptyGoodReceiptHeader,
  createEmptyGoodReceiptLine,
  updateGoodReceiptLine,
} from '../good-receipt.model';
import { GL_ACCOUNT_BRANCH_OPTIONS } from '../../../setup/gl-account-determination/gl-account-branch.options';

const RECEIPT_REASON_ACCOUNT_CODES: Record<string, string> = {
  'Toll to Own Conversion of Goods': 'A02022000100030',
  'Toll to Own Resin Conversion': 'A02022000100140',
  'Msc CGS Receipts Issues': 'C01001000100920',
};

@Component({
  selector: 'app-add-good-receipt',
  standalone: true,
  imports: [CommonModule, FormsModule, OitmItemPickerDialogComponent],
  templateUrl: './add-good-receipt.html',
  styleUrls: ['../../miscellaneous-form.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AddGoodReceipt implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly goodReceiptService = inject(GoodReceiptService);
  private readonly departmentsPrService = inject(DepartmentsPrService);
  private readonly warehouseService = inject(WarehouseService);
  protected readonly layout = inject(MiscellaneousLayoutService);

  readonly saving = signal(false);
  readonly activeSection = signal<'header' | 'items' | 'footer'>('header');
  readonly itemPickerOpen = signal(false);
  readonly itemPickerRowIndex = signal<number | null>(null);
  readonly submittedBy = signal(this.authService.getSessionUser()?.name ?? '');

  readonly branchOptions = signal(GL_ACCOUNT_BRANCH_OPTIONS);
  readonly warehouseOptions = signal<WarehouseOption[]>([]);

  readonly pageTitle = computed(() => 'Good Receipt');

  readonly headerForm = signal<GoodReceiptHeader>(createEmptyGoodReceiptHeader());
  readonly contentLines = signal<GoodReceiptLine[]>([createEmptyGoodReceiptLine()]);
  readonly accountCodeOptions = signal<InventoryAccountOption[]>([]);
  readonly accountCodeOptionsLoading = signal(false);
  readonly accountCodeOptionsError = signal('');
  readonly accountCodeSearchText = signal<{ [key: number]: string }>({});
  readonly openAccountCodeDropdown = signal<number | null>(null);

  readonly departmentOptions = signal<DepartmentPr[]>([]);
  readonly departmentSearchText = signal<{ [key: number]: string }>({});
  readonly openDepartmentDropdown = signal<number | null>(null);

  readonly totalAmount = computed(() =>
    this.contentLines()
      .map((line) => (line.quantity ?? 0) * (line.itemCost ?? 0))
      .reduce((sum, amount) => sum + amount, 0),
  );

  ngOnInit(): void {
    this.warehouseService.ensureLoaded().subscribe({
      next: (warehouses) => this.warehouseOptions.set(warehouses),
      error: () => this.warehouseOptions.set([]),
    });
    this.loadAccountCodeOptions();
    this.loadDepartmentOptions();
  }

  private loadAccountCodeOptions(): void {
    const header = this.headerForm();
    const branch = header.branchId.trim();
    const docDate = header.documentDate.trim();
    const taxDate = header.postingDate.trim();
    const docDueDate = header.dueDate.trim();

    if (!branch || !docDate || !taxDate || !docDueDate) {
      this.accountCodeOptions.set([]);
      this.accountCodeOptionsError.set('');
      return;
    }

    this.accountCodeOptionsLoading.set(true);
    this.accountCodeOptionsError.set('');
    this.goodReceiptService.listInventoryAccounts(branch, docDate, taxDate, docDueDate).subscribe({
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

  updateHeaderField(field: keyof GoodReceiptHeader, value: string): void {
    this.headerForm.update((state) => ({ ...state, [field]: value }));
    if (field === 'issueReceiptReason') {
      const emptyLine = createEmptyGoodReceiptLine();
      const accountCode = RECEIPT_REASON_ACCOUNT_CODES[value] ?? emptyLine.accountCode;
      this.contentLines.update((rows) => rows.map((line) => ({ ...line, accountCode })));
      this.accountCodeSearchText.set({});
      this.openAccountCodeDropdown.set(null);
    }
    if (field === 'documentDate' || field === 'postingDate' || field === 'dueDate') {
      this.loadAccountCodeOptions();
    }
  }

  addContentLine(): void {
    this.contentLines.update((lines) => [...lines, this.createGoodReceiptLine()]);
  }

  deleteContentLine(index: number): void {
    this.contentLines.update((lines) => lines.filter((_, i) => i !== index));
  }

  updateContentLine(index: number, field: keyof GoodReceiptLine, value: string): void {
    this.contentLines.update((rows) => updateGoodReceiptLine(rows, index, field, value));
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

  getFilteredAccountCodes(searchText: string): InventoryAccountOption[] {
    if (!searchText.trim()) {
      return this.accountCodeOptions();
    }
    const lower = searchText.toLowerCase();
    return this.accountCodeOptions().filter(
      (account) =>
        account.code.toLowerCase().includes(lower) ||
        (account.name && account.name.toLowerCase().includes(lower))
    );
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

  selectAccountCode(index: number, code: string, name?: string): void {
    this.updateContentLine(index, 'accountCode', code);
    this.accountCodeSearchText.update((state) => ({
      ...state,
      [index]: name ? `${name} (${code})` : code,
    }));
    this.openAccountCodeDropdown.set(null);
  }

  openAccountCodeSearch(index: number, input: HTMLInputElement): void {
    this.openAccountCodeDropdown.set(index);
    input.select();
  }

  onAccountCodeItemHover(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    target.style.background = '#f5f5f5';
  }

  onAccountCodeItemLeave(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    target.style.background = 'white';
  }

  getDropdownStyle(lineIndex: number, input: HTMLInputElement | null): string {
    if (!input) return '';
    const rect = input.getBoundingClientRect();
    return `position: fixed; top: ${rect.bottom + 2}px; left: ${rect.left}px; width: ${rect.width}px; background: white; border: 1px solid #ccc; max-height: 200px; overflow-y: auto; z-index: 10000;`;
  }

  private loadDepartmentOptions(): void {
    this.departmentsPrService.ensureLoaded().subscribe({
      next: (options) => {
        console.log('Department options loaded:', options);
        this.departmentOptions.set(options as any);
      },
      error: (error) => {
        console.error('Error loading departments:', error);
        this.departmentOptions.set([]);
      },
    });
  }

  getFilteredDepartments(searchText: string): DepartmentPr[] {
    if (!searchText.trim()) {
      return this.departmentOptions();
    }
    const lower = searchText.toLowerCase();
    return this.departmentOptions().filter(
      (dept) =>
        dept.code.toLowerCase().includes(lower) ||
        dept.name.toLowerCase().includes(lower)
    );
  }

  updateDepartmentSearch(index: number, value: string): void {
    this.departmentSearchText.update((state) => ({
      ...state,
      [index]: value,
    }));
  }

  selectDepartment(index: number, id: string, name: string): void {
    this.updateContentLine(index, 'departmentsLocations', id);
    this.departmentSearchText.update((state) => ({
      ...state,
      [index]: `${name} (${id})`,
    }));
    this.openDepartmentDropdown.set(null);
  }

  toggleDepartmentDropdown(index: number): void {
    const current = this.openDepartmentDropdown();
    this.openDepartmentDropdown.set(current === index ? null : index);
  }

  onDepartmentItemHover(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    target.style.background = '#f5f5f5';
  }

  onDepartmentItemLeave(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    target.style.background = 'white';
  }

  getDepartmentDropdownStyle(lineIndex: number, input: HTMLInputElement | null): string {
    if (!input) return '';
    const rect = input.getBoundingClientRect();
    return `position: fixed; top: ${rect.bottom + 2}px; left: ${rect.left}px; width: ${rect.width}px; background: white; border: 1px solid #ccc; max-height: 200px; overflow-y: auto; z-index: 10000;`;
  }

  openItemPicker(index: number): void {
    this.itemPickerRowIndex.set(index);
    this.itemPickerOpen.set(true);
  }

  private firstBatchWithNumber(item: OitmItem) {
    return (item.batches ?? []).find((batch) => !!batch?.batchNumber?.trim());
  }

  private createGoodReceiptLine(): GoodReceiptLine {
    const line = createEmptyGoodReceiptLine();
    return {
      ...line,
      accountCode: RECEIPT_REASON_ACCOUNT_CODES[this.headerForm().issueReceiptReason] ?? line.accountCode,
    };
  }

  onItemsSelected(items: OitmItem[]): void {
    const index = this.itemPickerRowIndex();
    if (index === null || items.length === 0) {
      return;
    }

    this.contentLines.update((rows) => {
      const updated = [...rows];
      const first = items[0];
      const firstBatch = this.firstBatchWithNumber(first);

      updated[index] = {
        ...updated[index],
        itemCode: first.itemCode,
        itemDescription: first.itemName,
        warehouse: firstBatch?.warehouse || updated[index].warehouse,
        batchNumber: firstBatch?.batchNumber || updated[index].batchNumber,
        manufacturingDate: firstBatch?.manufacturingDate
          ? String(firstBatch.manufacturingDate).split(' ')[0]
          : updated[index].manufacturingDate,
        expiryDate: firstBatch?.expiryDate
          ? String(firstBatch.expiryDate).split(' ')[0]
          : updated[index].expiryDate,
        uomName: first.uom,
      };

      const extras = items.slice(1).map((item) => {
        const batch = this.firstBatchWithNumber(item);
        return {
          ...this.createGoodReceiptLine(),
          itemCode: item.itemCode,
          itemDescription: item.itemName,
          warehouse: batch?.warehouse || '',
          batchNumber: batch?.batchNumber || '',
          manufacturingDate: batch?.manufacturingDate ? String(batch.manufacturingDate).split(' ')[0] : '',
          expiryDate: batch?.expiryDate ? String(batch.expiryDate).split(' ')[0] : createEmptyGoodReceiptLine().expiryDate,
          uomName: item.uom,
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
    if (!header.documentDate.trim()) {
      this.alertService.validation('Document Date is required.');
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

    if (lines.some((line) => !line.warehouse.trim())) {
      this.alertService.validation('Warehouse is required for every line item.');
      return;
    }

    if (lines.some((line) => !line.accountCode.trim())) {
      this.alertService.validation('Account Code is required for every line item.');
      return;
    }

    if (lines.some((line) => line.quantity == null || line.quantity <= 0)) {
      this.alertService.validation('Quantity is required for every line item.');
      return;
    }

    const payload = buildCreateGoodReceiptPayload(header, this.contentLines());

    this.saving.set(true);
    this.goodReceiptService.create(payload).subscribe({
      next: (response) => {
        this.saving.set(false);
        const ok = response?.success === true || response?.status === true;
        if (!ok) {
          void this.alertService.error(
            'Save Failed',
            formatSapApiFailureMessage(response, 'Good receipt could not be saved.'),
          );
          return;
        }

        const docEntry = response?.docEntry ?? response?.data?.['docEntry'];
        const message =
          response?.message?.trim() ||
          (docEntry != null
            ? `Good receipt created (Doc #${docEntry}).`
            : 'Good receipt was created successfully.');

        void this.alertService.successAndWait('Success', message).then(() => {
          void this.router.navigate(['/miscellaneous/good-receipt-note']);
        });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        void this.alertService.error(
          'Save Failed',
          formatApiErrorMessage(err, 'Could not save good receipt. Make sure the backend is running.'),
        );
      },
    });
  }
}
