import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, OnInit, OnDestroy, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PageToolbarComponent } from '../../page-toolbar/page-toolbar';
import { MiscellaneousLayoutService } from '../../miscellaneous/miscellaneous-layout.service';
import { OitmItem } from '../../../constants/oitm-items';
import { OitmItemsService } from '../../../services/oitm-items.service';
import { GatePassBusinessPartnerService, GatePassBusinessPartner } from '../../gate-pass/gate-pass-business-partner.service';
import { TaxCodesService, TaxCode } from '../../../services/tax-codes.service';
import { DepartmentsPrService, DepartmentPr } from '../../../services/departments-pr.service';
import { WarehouseService } from '../../../services/warehouse.service';
import { AuthService } from '../../../services/auth.service';
import { AlertService } from '../../../services/alert.service';
import {
  PurchaseRequestService,
  CreatePurchaseRequestPayload,
  CreatePurchaseRequestItemLine,
  CreatePurchaseRequestServiceLine,
  InventoryAccountOption,
  normalizePurchaseRequestDocumentType,
} from '../../../services/purchase-request.service';
import { ApplicationFormService } from '../../../services/application-form.service';
import { formatApiErrorMessage } from '../../../utils/api-error.util';

interface PurchaseRequestHeader {
  requestDate: string;
  dueDate: string;
  branch: string;
  requestType: string;
  remarks: string;
}

interface PurchaseRequestLine {
  itemCode: string;
  itemDescription: string;
  Dscription: string;
  vendor: string;
  vendorName: string;
  requiredDate: string;
  requiredQuantity: number | null;
  infoPrice: number | null;
  discount: number | null;
  taxCode: string;
  taxCodeName: string;
  department: string;
  glAccount: string;
  total: number | null;
  uomCode: string;
  warehouse: string;
  quantity: number | null;
  manufacturingDate: string;
  expiryDate: string;
  batchNumber: string;
}

interface WarehouseDropdownOption {
  code: string;
  name: string;
  bplId?: number;
}

const DEFAULT_PURCHASE_REQUEST_EMPLOYEE_CODE = 'Emp-00000100';

@Component({
  selector: 'app-purchase-request',
  standalone: true,
  imports: [CommonModule, FormsModule, PageToolbarComponent],
  templateUrl: './purchase-request.html',
  styleUrls: ['../../sample-inspection-request/sample-inspection-request.css', '../../miscellaneous/miscellaneous-form.css', './purchase-request.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PurchaseRequestComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly oitmItemsService = inject(OitmItemsService);
  protected readonly layout = inject(MiscellaneousLayoutService);
  protected readonly authService = inject(AuthService);

  readonly headerForm = signal<PurchaseRequestHeader>({
    requestDate: '',
    dueDate: '',
    branch: '',
    requestType: '',
    remarks: '',
  });
  readonly submittedBy = signal(this.authService.getSessionUser()?.name ?? '');

  readonly contentLines = signal<PurchaseRequestLine[]>([this.createEmptyLine()]);
  readonly itemOptions = signal<OitmItem[]>([]);
  readonly itemOptionsLoading = signal(false);
  readonly itemOptionsError = signal<string | null>(null);
  readonly itemSearchTerms = signal<Record<number, string | undefined>>({});
  readonly vendorSearchTerms = signal<Record<number, string | undefined>>({});
  readonly glAccountSearchTerms = signal<Record<number, string | undefined>>({});
  readonly activeSuggestionIndex = signal<number | null>(null);
  readonly suggestionPanelStyle = signal<{ left: number; width: number; top: number } | null>(null);
  private activeItemCodeInput: HTMLInputElement | null = null;
  private readonly repositionSuggestionPanel = (): void => {
    const index = this.activeSuggestionIndex();
    if (index !== null && this.activeItemCodeInput?.isConnected) {
      this.updateSuggestionPanelPosition(index, this.activeItemCodeInput);
    }
    const glAccountIndex = this.activeGlAccountSuggestionIndex();
    if (glAccountIndex !== null && this.activeGlAccountInput?.isConnected) {
      this.updateGlAccountSuggestionPanelPosition(glAccountIndex, this.activeGlAccountInput);
    }
  };
  readonly activeVendorSuggestionIndex = signal<number | null>(null);
  readonly vendorSuggestionPanelStyle = signal<{ left: number; width: number; top: number } | null>(null);
  readonly glAccountSuggestionPanelStyle = signal<{ left: number; width: number; top: number } | null>(null);
  private activeGlAccountInput: HTMLInputElement | null = null;
  readonly departmentOptions = signal<DepartmentPr[]>([]);
  readonly warehouseOptions = signal<WarehouseDropdownOption[]>([]);
  readonly filteredWarehouseOptions = computed(() => {
    const branch = this.parseBranchValue(this.headerForm().branch);
    const options = this.warehouseOptions();

    if (branch === null) {
      return options;
    }

    const optionsForBranch = options.filter((option) => option.bplId === branch);
    if (optionsForBranch.length > 0) {
      return optionsForBranch;
    }

    const branchKeywords: Record<number, string[]> = {
      1: ['peshawar', 'psh'],
      2: ['head office', 'headoffice', 'head-office', 'ho'],
      3: ['faisalabad', 'fsd'],
    };
    const keywords = branchKeywords[branch] ?? [];

    return options.filter((option) => {
      const label = `${option.code} ${option.name}`.toLowerCase();
      return keywords.some((keyword) =>
        keyword === 'ho' ? /(^|[\s_-])ho\d*(?=[\s_-]|$)/.test(label) : label.includes(keyword),
      );
    });
  });
  readonly inventoryAccountOptions = signal<InventoryAccountOption[]>([]);
  readonly inventoryAccountOptionsLoading = signal(false);
  readonly activeGlAccountSuggestionIndex = signal<number | null>(null);
  readonly branchOptions = signal([
    { label: 'AHCP_Peshawar', value: 'AHCP_Peshawar' },
    { label: 'AHCP_HO', value: 'AHCP_HO' },
    { label: 'AHCP_Faisalabad', value: 'AHCP_Faisalabad' },
  ]);
  readonly requestTypeOptions = signal([
    { label: 'Item', value: 'Item' },
    { label: 'Service', value: 'Service' },
  ]);
  readonly taxCodes = signal<TaxCode[]>([]);
  // Tax codes are shown as a dropdown select; no per-row search signals needed.
  readonly saving = signal(false);
  protected readonly businessPartnerService = inject(GatePassBusinessPartnerService);
  protected readonly taxCodesService = inject(TaxCodesService);
  protected readonly departmentsPrService = inject(DepartmentsPrService);
  protected readonly warehouseService = inject(WarehouseService);
  protected readonly alertService = inject(AlertService);
  protected readonly applicationFormService = inject(ApplicationFormService);
  protected readonly purchaseRequestService = inject(PurchaseRequestService);

  ngOnInit(): void {
    window.addEventListener('scroll', this.repositionSuggestionPanel, true);
    window.addEventListener('resize', this.repositionSuggestionPanel);
    this.businessPartnerService.ensureLoaded().subscribe();
    this.applicationFormService.fetchEmployeeProfiles().subscribe({
      error: () => undefined,
    });
    this.loadTaxCodes();
    this.loadDepartmentOptions();
    this.loadWarehouseOptions();
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.repositionSuggestionPanel, true);
    window.removeEventListener('resize', this.repositionSuggestionPanel);
  }

  loadTaxCodes(): void {
    if (this.taxCodes().length > 0) {
      return;
    }

    this.taxCodesService.ensureLoaded().subscribe((list) => {
      this.taxCodes.set(list);
    });
  }

  loadDepartmentOptions(): void {
    if (this.departmentOptions().length > 0) {
      return;
    }

    this.departmentsPrService.ensureLoaded().subscribe((list) => {
      this.departmentOptions.set(list);
    });
  }

  loadWarehouseOptions(): void {
    if (this.warehouseOptions().length > 0) {
      return;
    }

    this.warehouseService.ensureLoaded().subscribe({
      next: (warehouses) => {
        const options = warehouses.map((warehouse) => ({
          code: warehouse.warehouseCode,
          name: warehouse.warehouseName,
          bplId: warehouse.bplId,
        }));
        this.warehouseOptions.set(options);
      },
      error: () => {
        this.warehouseOptions.set([]);
      },
    });
  }

  loadInventoryAccountOptions(): void {
    if (this.inventoryAccountOptions().length > 0 || this.inventoryAccountOptionsLoading()) {
      return;
    }

    this.inventoryAccountOptionsLoading.set(true);
    this.purchaseRequestService.listInventoryAccounts().subscribe({
      next: (accounts) => {
        this.inventoryAccountOptions.set(accounts);
        this.inventoryAccountOptionsLoading.set(false);
      },
      error: () => {
        this.inventoryAccountOptions.set([]);
        this.inventoryAccountOptionsLoading.set(false);
      },
    });
  }

  get isServiceRequest(): boolean {
    return this.headerForm().requestType.trim().toLowerCase() === 'service';
  }

  get hasValidLine(): boolean {
    return this.contentLines().some((line) => {
      if (this.isServiceRequest) {
        return (
          line.Dscription.trim().length > 0 ||
          line.vendor.trim().length > 0 ||
          line.department.trim().length > 0 ||
          line.glAccount.trim().length > 0 ||
          line.taxCode.trim().length > 0 ||
          line.total !== null
        );
      }

      return line.itemCode.trim().length > 0;
    });
  }

  toggleSidebar(): void {
    this.layout.toggleSidebar();
  }

  updateHeaderField<K extends keyof PurchaseRequestHeader>(field: K, value: string): void {
    this.headerForm.update((form) => ({ ...form, [field]: value }));

    if (field === 'branch') {
      this.contentLines.update((lines) => lines.map((line) => ({ ...line, warehouse: '' })));
    }

    if (field === 'requestType' && value.trim().toLowerCase() === 'service') {
      this.loadInventoryAccountOptions();
    }
  }

  updateContentLine(index: number, field: keyof PurchaseRequestLine, value: string | number | null): void {
    this.contentLines.update((lines) =>
      lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    );
  }

  addContentLine(): void {
    this.contentLines.update((lines) => [...lines, this.createEmptyLine()]);
  }

  loadItemOptions(forceReload = false): void {
    if (!forceReload && this.itemOptions().length > 0) {
      return;
    }

    this.itemOptionsLoading.set(true);
    this.itemOptionsError.set(null);

    const request = forceReload ? this.oitmItemsService.reload() : this.oitmItemsService.ensureLoaded();

    request.subscribe({
      next: (items) => {
        this.itemOptions.set(items);
        this.itemOptionsLoading.set(false);
      },
      error: () => {
        this.itemOptions.set([]);
        this.itemOptionsLoading.set(false);
        this.itemOptionsError.set('Could not load items from AHCP.');
      },
    });
  }

  onItemCodeFocus(index: number, input: HTMLInputElement): void {
    this.loadItemOptions();
    this.updateSuggestionPanelPosition(index, input);
  }

  updateSuggestionPanelPosition(index: number, input: HTMLInputElement): void {
    if (!input) {
      return;
    }

    const rect = input.getBoundingClientRect();
    this.activeItemCodeInput = input;
    this.activeSuggestionIndex.set(index);
    this.suggestionPanelStyle.set({
      left: rect.left,
      top: rect.bottom,
      width: rect.width,
    });
  }

  scheduleHideSuggestionPanel(): void {
    window.setTimeout(() => {
      this.activeSuggestionIndex.set(null);
      this.activeItemCodeInput = null;
    }, 150);
  }

  onVendorFocus(index: number, input: HTMLInputElement): void {
    this.businessPartnerService.ensureLoaded().subscribe();
    this.updateVendorSuggestionPanelPosition(index, input);
  }


  updateVendorSuggestionPanelPosition(index: number, input: HTMLInputElement): void {
    if (!input) {
      return;
    }

    const rect = input.getBoundingClientRect();
    this.activeVendorSuggestionIndex.set(index);
    this.vendorSuggestionPanelStyle.set({
      left: rect.left + window.scrollX,
      top: rect.bottom + window.scrollY,
      width: rect.width,
    });
  }

  scheduleHideVendorSuggestionPanel(): void {
    window.setTimeout(() => {
      this.activeVendorSuggestionIndex.set(null);
    }, 150);
  }


  updateItemSearch(index: number, value: string): void {
    this.itemSearchTerms.update((terms) => ({ ...terms, [index]: value }));
    this.updateContentLine(index, 'itemCode', value);
    this.updateContentLine(index, 'itemDescription', '');
    this.activeSuggestionIndex.set(index);
  }

  updateVendorSearch(index: number, value: string): void {
    this.vendorSearchTerms.update((terms) => ({ ...terms, [index]: value }));

    const partner = this.businessPartnerService.search(value, 1)[0];
    if (partner) {
      this.updateContentLine(index, 'vendor', partner.code);
      this.updateContentLine(index, 'vendorName', partner.name);
    } else {
      this.updateContentLine(index, 'vendor', value.trim());
      this.updateContentLine(index, 'vendorName', value.trim());
    }

    this.activeVendorSuggestionIndex.set(index);
  }

  // No-op: tax selection handled via dropdown.

  getFilteredItemSuggestions(index: number): OitmItem[] {
    const term = (this.itemSearchTerms()[index] ?? '').trim().toLowerCase();
    if (!term) {
      return [];
    }

    return this.itemOptions().filter((item) => {
      const haystack = `${item.itemCode} ${item.itemName}`.toLowerCase();
      return haystack.includes(term);
    });
  }

  applySuggestedItem(index: number, item: OitmItem): void {
    this.contentLines.update((lines) =>
      lines.map((line, lineIndex) => {
        if (lineIndex !== index) {
          return line;
        }

        return {
          ...line,
          itemCode: item.itemCode,
          itemDescription: item.itemName,
          uomCode: item.uom,
        };
      }),
    );
    this.itemSearchTerms.update((terms) => ({ ...terms, [index]: item.itemCode }));
    this.activeSuggestionIndex.set(null);
  }

  getFilteredVendorSuggestions(index: number): GatePassBusinessPartner[] {
    const term = (this.vendorSearchTerms()[index] ?? '').trim();
    if (!term) {
      return [];
    }

    return this.businessPartnerService.search(term, 8);
  }

  applySuggestedVendor(index: number, vendor: GatePassBusinessPartner): void {
    this.contentLines.update((lines) =>
      lines.map((line, lineIndex) => {
        if (lineIndex !== index) {
          return line;
        }

        return {
          ...line,
          vendor: vendor.code || vendor.name,
          vendorName: vendor.name || vendor.code,
        };
      }),
    );
    this.vendorSearchTerms.update((terms) => ({ ...terms, [index]: vendor.name || vendor.code }));
    this.activeVendorSuggestionIndex.set(null);
  }

  getDepartmentOptions(): DepartmentPr[] {
    return this.departmentOptions();
  }

  getTaxCodes(): TaxCode[] {
    return this.taxCodes().filter((tax) => tax.code.trim().toUpperCase().startsWith('PT'));
  }

  onTaxCodeChange(index: number, selectedCode: string): void {
    const selectedTax = this.getTaxCodes().find((tax) => tax.code === selectedCode);
    this.updateContentLine(index, 'taxCode', selectedCode);
    this.updateContentLine(index, 'taxCodeName', selectedTax?.name ?? '');
  }

  onDepartmentChange(index: number, selectedDepartmentCode: string): void {
    this.updateContentLine(index, 'department', selectedDepartmentCode);

    if (!this.isServiceRequest) {
      return;
    }

    this.updateContentLine(index, 'glAccount', '');
    this.glAccountSearchTerms.update((terms) => ({ ...terms, [index]: '' }));

    const department = this.departmentOptions().find((option) => option.code === selectedDepartmentCode);
    const ccTypeCode = department?.ccTypeCode?.trim() ?? '';

    this.inventoryAccountOptions.set([]);
    if (!ccTypeCode) {
      return;
    }

    this.inventoryAccountOptionsLoading.set(true);
    this.purchaseRequestService.getGlAccountsAgainstDistribution(ccTypeCode).subscribe({
      next: (accounts) => {
        this.inventoryAccountOptions.set(accounts);
        this.inventoryAccountOptionsLoading.set(false);
      },
      error: () => {
        this.inventoryAccountOptions.set([]);
        this.inventoryAccountOptionsLoading.set(false);
      },
    });
  }

  getFilteredInventoryAccounts(index: number): InventoryAccountOption[] {
    const term = (this.glAccountSearchTerms()[index] ?? '').trim().toLowerCase();
    if (!term) {
      return this.inventoryAccountOptions();
    }

    return this.inventoryAccountOptions().filter((account) =>
      `${account.code} ${account.name}`.toLowerCase().includes(term),
    );
  }

  updateGlAccountSearch(index: number, value: string): void {
    this.glAccountSearchTerms.update((terms) => ({ ...terms, [index]: value }));
    this.activeGlAccountSuggestionIndex.set(index);
  }

  selectInventoryAccount(index: number, account: InventoryAccountOption): void {
    this.updateContentLine(index, 'glAccount', account.code);
    this.glAccountSearchTerms.update((terms) => ({ ...terms, [index]: `${account.name} (${account.code})` }));
    this.activeGlAccountSuggestionIndex.set(null);
  }

  onGlAccountFocus(index: number, input: HTMLInputElement): void {
    this.loadInventoryAccountOptions();
    this.updateGlAccountSuggestionPanelPosition(index, input);
  }

  updateGlAccountSuggestionPanelPosition(index: number, input: HTMLInputElement): void {
    if (!input) {
      return;
    }

    const rect = input.getBoundingClientRect();
    this.activeGlAccountInput = input;
    this.activeGlAccountSuggestionIndex.set(index);
    this.glAccountSuggestionPanelStyle.set({
      left: rect.left,
      top: rect.bottom,
      width: rect.width,
    });
  }

  scheduleHideGlAccountDropdown(): void {
    window.setTimeout(() => {
      this.activeGlAccountSuggestionIndex.set(null);
      this.activeGlAccountInput = null;
    }, 150);
  }

  selectItem(index: number, value: string): void {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      this.contentLines.update((lines) =>
        lines.map((line, lineIndex) => (lineIndex === index ? { ...line, itemCode: '', itemDescription: '', uomCode: '' } : line)),
      );
      return;
    }

    const selectedItem = this.itemOptions().find(
      (item) => item.itemCode.toLowerCase() === normalized || item.itemName.toLowerCase() === normalized,
    );

    if (!selectedItem) {
      return;
    }

    this.contentLines.update((lines) =>
      lines.map((line, lineIndex) => {
        if (lineIndex !== index) {
          return line;
        }

        return {
          ...line,
          itemCode: selectedItem.itemCode,
          itemDescription: selectedItem.itemName,
          uomCode: selectedItem.uom,
        };
      }),
    );
  }

  deleteContentLine(index: number): void {
    this.contentLines.update((lines) => lines.filter((_, i) => i !== index));
  }

  private parseBranchValue(value: string): number | null {
    const trimmed = value.trim().toLowerCase();
    switch (trimmed) {
      case 'ahcp_peshawar':
      case 'peshawar':
      case '1':
        return 1;
      case 'ahcp_ho':
      case 'ho':
      case '2':
        return 2;
      case 'ahcp_faisalabad':
      case 'faisalabad':
      case '3':
        return 3;
      default:
        return null;
    }
  }

  private resolveEmployeeCode(): string {
    const sessionUserId = this.authService.getSessionUserId()?.trim() ?? '';
    const sessionUserName = this.authService.getSessionUser()?.name?.trim() ?? '';
    const profile = this.applicationFormService.getSignedInUserRecord(sessionUserId, sessionUserName);

    const employeeCode =
      profile?.EmployeeCode?.trim() ||
      profile?.detail?.loginDetails?.employeeCode?.trim() ||
      profile?.detail?.loginDetails?.userId?.trim() ||
      profile?.userId?.trim() ||
      '';

    if (employeeCode) {
      return employeeCode;
    }

    return DEFAULT_PURCHASE_REQUEST_EMPLOYEE_CODE;
  }

  submitPurchaseRequest(): void {
    if (this.saving()) {
      return;
    }

    const header = this.headerForm();
    const lines = this.contentLines().filter((line) => {
      if (this.isServiceRequest) {
        return (
          line.Dscription.trim() ||
          line.vendor.trim() ||
          line.department.trim() ||
          line.glAccount.trim() ||
          line.taxCode.trim() ||
          line.total !== null
        );
      }

      return line.itemCode.trim();
    });

    if (!header.requestDate.trim()) {
      this.alertService.validation('Request Date is required.');
      return;
    }

    if (!header.branch.trim()) {
      this.alertService.validation('Branch is required.');
      return;
    }

    if (!header.requestType.trim()) {
      this.alertService.validation('Request Type is required.');
      return;
    }

    if (!header.dueDate.trim()) {
      this.alertService.validation('Required Date is required.');
      return;
    }

    if (lines.length === 0) {
      this.alertService.validation(
        this.isServiceRequest ? 'At least one service row is required.' : 'At least one item row is required.',
      );
      return;
    }

    const invalidRow = lines.find((line) => {
      if (this.isServiceRequest) {
        return (
          !line.vendor.trim() ||
          !line.department.trim() ||
          !line.glAccount.trim() ||
          !line.taxCode.trim() ||
          !line.requiredDate.trim() ||
          !line.total
        );
      }

      return (
        !line.itemCode.trim() ||
        !line.infoPrice ||
        !line.requiredQuantity ||
        !line.taxCode.trim() ||
        !line.department.trim() ||
        !line.warehouse.trim() ||
        !line.requiredDate.trim() ||
        !line.vendor.trim()
      );
    });

    if (invalidRow) {
      const message = this.isServiceRequest
        ? 'Each service row must have vendor, department, GL account, tax code, required date, and total.'
        : 'Each row must have item, vendor, required date, quantity, price, tax code, department, and warehouse.';
      this.alertService.validation(message);
      return;
    }

    const employeeCode = this.resolveEmployeeCode();
    const docType = normalizePurchaseRequestDocumentType(this.headerForm().requestType);
    const branch = this.parseBranchValue(header.branch);

    if (branch === null) {
      this.alertService.validation('Please select a valid branch.');
      return;
    }

    const payload: CreatePurchaseRequestPayload = {
      employee_code: employeeCode,
      docDate: header.requestDate.trim(),
      DocType: docType,
      requiredDate: header.dueDate.trim(),
      branch,
      remarks: header.remarks.trim() || 'Purchase Request from Portal',
      items: lines.map((line) => {
        if (this.isServiceRequest) {
          return {
            Dscription: line.Dscription.trim(),
            Vendor: line.vendor.trim(),
            department: line.department.trim(),
            AccountCode: line.glAccount.trim(),
            taxCode: line.taxCode.trim(),
            requiredDate: line.requiredDate.trim(),
            total: String(line.total ?? 0),
          } satisfies CreatePurchaseRequestServiceLine;
        }

        return {
          itemCode: line.itemCode.trim(),
          infoPrice: Number(line.infoPrice ?? 0),
          quantity: Number(line.requiredQuantity ?? 0),
          discount: Number(line.discount ?? 0),
          Vendor: line.vendor.trim(),
          warehouse: line.warehouse.trim(),
          taxCode: line.taxCode.trim(),
          department: line.department.trim(),
          requiredDate: line.requiredDate.trim(),
          remarks: header.remarks.trim() || 'Purchase Request from Portal',
        } satisfies CreatePurchaseRequestItemLine;
      }),
    };

    console.log('[PurchaseRequest] Final payload before submit:', JSON.stringify(payload, null, 2));

    if (!payload.employee_code) {
      this.alertService.validation('Unable to resolve employee code for the request. Please sign in again.');
      return;
    }

    this.saving.set(true);
    this.purchaseRequestService.create(payload).subscribe({
      next: (response) => {
        if (response?.success === false || response?.status === false || response?.error) {
          this.saving.set(false);
          const errorMessage = response?.error?.trim() || response?.message?.trim() || 'Purchase request could not be saved.';
          void this.alertService.error('Save Failed', errorMessage);
          return;
        }

        const message = response?.message?.trim() ||
          (response?.docEntry != null ? `Purchase request created (Doc #${response.docEntry}).` : 'Purchase request created successfully.');
        void this.alertService.success('Success', message);
        this.saving.set(false);
        void this.router.navigate(['/miscellaneous/purchase-request']);
      },
      error: (error) => {
        this.saving.set(false);
        void this.alertService.error(
          'Save Failed',
          formatApiErrorMessage(error, 'Purchase request could not be saved. Please try again.'),
        );
      },
    });
  }

  createEmptyLine(): PurchaseRequestLine {
    return {
      itemCode: '',
      itemDescription: '',
      Dscription: '',
      vendor: '',
      vendorName: '',
      requiredDate: '',
      requiredQuantity: null,
      infoPrice: null,
      discount: null,
      taxCode: '',
      taxCodeName: '',
      department: '',
      glAccount: '',
      total: null,
      uomCode: '',
      warehouse: '',
      quantity: null,
      manufacturingDate: '',
      expiryDate: '',
      batchNumber: '',
    };
  }
}
