import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, firstValueFrom, tap } from 'rxjs';
import { AlertService } from '../../../../services/alert.service';
import { BaseDocumentModalComponent } from '../../base-document-modal/base-document-modal';
import { OpenBaseDocument } from '../../open-base-documents.service';
import { formatApiErrorMessage } from '../../../../utils/api-error.util';
import {
  createEmptyIgpLineItem,
  IgpAddPayload,
  IgpLineItem,
  IgpRecord,
  IgpService,
} from '../igp.service';
import { GATE_PASS_LOCATION_OPTIONS, resolveGatePassLocation } from '../../gate-pass-location.options';
import { GatePassItemMaster, GatePassItemMasterService } from '../../gate-pass-item-master.service';
import { GatePassItemSearchInputComponent } from '../../item-search-input/item-search-input';
import {
  GatePassBusinessPartner,
  GatePassBusinessPartnerService,
} from '../../gate-pass-business-partner.service';
import { GatePassBusinessPartnerSearchInputComponent } from '../../business-partner-search-input/business-partner-search-input';
import { reserveNextGatePassReferenceNo } from '../../gate-pass-reference.util';
import { GatePassWarehouseOption, resolveGatePassWarehouseCode } from '../../gate-pass-warehouse.options';
import { formatGatePassCnic, formatGatePassPhoneDigits } from '../../gate-pass-input-format.util';
import { GatePassDepartmentService } from '../../gate-pass-department.service';
import { ApplicationFormService } from '../../../../services/application-form.service';
import { AuthService } from '../../../../services/auth.service';
import { WarehouseService } from '../../../../services/warehouse.service';

function emptyIfDash(value: string): string {
  return value === '—' ? '' : value;
}

export function normalizeGatePassString(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value).trim();
  return text === '—' ? '' : text;
}

function numericFieldFromDoc(value: string | undefined): string {
  const parsed = parseFloat(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? String(parsed) : '';
}

function currentLocalDateString(): string {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${day}`;
}

@Component({
  selector: 'app-create-igp',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BaseDocumentModalComponent,
    GatePassItemSearchInputComponent,
    GatePassBusinessPartnerSearchInputComponent,
  ],
  templateUrl: './create-igp.html',
  styleUrls: [
    '../../../HR-Portal/Application-Form/create-job-requisition/create-job-requisition.css',
    '../../../HR-Portal/employee-action/probation-evaluation-form/add-probation-evaluation/add-probation-evaluation.css',
    './create-igp.css',
  ],
})
export class CreateIgpComponent implements OnInit {
  editingId: string | null = null;
  pageTitle = 'Add IGP';
  submitButtonLabel = 'Save IGP';
  activeSection = 'igp-form-header-section';

  get pageSubtitle(): string {
    return this.editingId
      ? 'Update inward gate pass details, shipment lines, and document summary.'
      : 'Create a new inward gate pass with partner, logistics, and line items.';
  }

  type = 'Purchase Order';
  documentDate = '';
  businessPartnerCode = '';
  baseDocNo = '';
  poNumber = '';
  referenceNo = 'System Generated';
  businessPartnerName = '';
  vehicleNo = '';
  fromUnit = '';
  kantaSlip = '';
  department = '';
  biltyNo = '';
  store = '';
  driverName = '';
  driverCnic = '';
  driverPhone = '';
  weight = '';
  location = '';
  employee = '';
  lines: IgpLineItem[] = [];
  remarks = '';

  showBaseDocModal = false;
  loading = false;
  submitting = false;
  submitted = false;

  readonly typeOptions = ['Purchase Order', 'Sales Return Request', 'Stand Alone Documents'] as const;
  readonly locationOptions = GATE_PASS_LOCATION_OPTIONS;
  warehouseOptions: GatePassWarehouseOption[] = [];
  departmentOptions: string[] = [];
  private readonly maxReferenceRetry = 3;

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly igpService: IgpService,
    private readonly alertService: AlertService,
    private readonly itemMasterService: GatePassItemMasterService,
    private readonly businessPartnerService: GatePassBusinessPartnerService,
    private readonly departmentService: GatePassDepartmentService,
    private readonly applicationFormService: ApplicationFormService,
    private readonly authService: AuthService,
    private readonly cdr: ChangeDetectorRef,
    private readonly warehouseService: WarehouseService,
  ) {
    this.documentDate = currentLocalDateString();
  }

  ngOnInit(): void {
    this.loadWarehouseOptions();
    this.itemMasterService.ensureLoaded().subscribe();
    this.businessPartnerService.ensureLoaded().subscribe();
    this.departmentService.ensureLoaded().subscribe({
      next: () => {
        this.departmentOptions = this.departmentService.departmentNames();
        if (!this.editingId) {
          this.applyLoggedInUserDefaults();
        }
      },
    });

    const editId = this.route.snapshot.paramMap.get('id');
    if (!editId) {
      this.assignNextReferenceNo();
      this.loadSignedInUserDetails();
      return;
    }

    this.editingId = editId;
    this.pageTitle = 'Update IGP';
    this.submitButtonLabel = 'Update IGP';
    this.loading = true;

    this.igpService
      .fetchInwardGatePassDetail(editId)
      .pipe(finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: (record) => {
          this.populateFromRecord(record);
        },
        error: (error: unknown) => {
          void this.alertService.error(
            'Load Failed',
            formatApiErrorMessage(error, 'Failed to load IGP for edit.'),
          );
        },
      });
  }

    private loadWarehouseOptions(): void {
      this.warehouseService.ensureLoaded().subscribe({
        next: (warehouses) => {
          this.warehouseOptions = warehouses.map((warehouse) => ({
            code: warehouse.warehouseCode,
            name: warehouse.warehouseName,
          }));
        },
        error: () => {
          this.warehouseOptions = [];
        },
      });
    }

  private assignNextReferenceNo(): void {
    // The number is allocated only when the document is submitted.
    this.referenceNo = 'System Generated';
  }

  private async ensureUniqueReferenceNo(): Promise<string> {
    try {
      const records = await firstValueFrom(this.igpService.fetchInwardGatePasses());
      return reserveNextGatePassReferenceNo(
        'IGP',
        records.map((record) => record.referenceNo),
      );
    } catch {
      return reserveNextGatePassReferenceNo('IGP', []);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isReferenceDuplicateError(message: string | undefined | null): boolean {
    if (!message) {
      return false;
    }

    const text = String(message).toLowerCase();
    return (
      text.includes('duplicate') ||
      text.includes('reference number') ||
      text.includes('reference no') ||
      text.includes('already exists') ||
      text.includes('unique')
    );
  }

  private async saveNewIgp(attempt = 1): Promise<void> {
    try {
      const allocatedReferenceNo = await this.ensureUniqueReferenceNo();
      const response = await firstValueFrom(
        this.igpService.addInwardGatePass({
          ...this.buildPayload(),
          referenceNo: allocatedReferenceNo,
        }),
      );

      if (response?.status === false || response?.success === false) {
        if (attempt < this.maxReferenceRetry && this.isReferenceDuplicateError(response.message)) {
          await this.delay(250);
          return this.saveNewIgp(attempt + 1);
        }

        const fallback = 'Failed to save IGP.';
        this.alertService.error('Error', response.message || fallback);
        return;
      }

      const title = 'Success';
      const message = response?.message || 'IGP record saved successfully.';
      this.referenceNo = allocatedReferenceNo;
      this.cdr.detectChanges();
      await this.alertService.successAndWait(title, message);
      this.igpService.fetchInwardGatePasses().subscribe();
      this.back();
    } catch (error: unknown) {
      const apiMessage = formatApiErrorMessage(error, 'Failed to save IGP.');
      if (attempt < this.maxReferenceRetry && this.isReferenceDuplicateError(apiMessage)) {
        await this.delay(250);
        return this.saveNewIgp(attempt + 1);
      }
      this.alertService.error('Error', apiMessage);
    } finally {
      this.submitting = false;
    }
  }

  private loadSignedInUserDetails(): void {
    if (this.editingId) {
      return;
    }

    const hasRecords = this.applicationFormService.getApplicationRecords().length > 0;
    if (hasRecords) {
      this.applyLoggedInUserDefaults();
      return;
    }

    this.applicationFormService.fetchEmployeeProfiles().subscribe({
      next: () => this.applyLoggedInUserDefaults(),
      error: () => this.applyLoggedInUserDefaults(),
    });
  }

  private applyLoggedInUserDefaults(): void {
    if (this.editingId || this.department?.trim()) {
      return;
    }

    const sessionUser = this.authService.getSessionUser();
    const sessionUserId = this.authService.getSessionUserId();
    const profileRecord = this.findProfileRecordForSessionUser();

    const employeeName =
      profileRecord?.EmployeeName?.trim() ||
      profileRecord?.detail?.personalInfo?.personName?.trim() ||
      sessionUser?.name?.trim() ||
      sessionUserId?.trim() ||
      '';

    const departmentValue =
      profileRecord?.Department?.trim() ||
      profileRecord?.detail?.personalInfo?.departmentInAhcp?.trim() ||
      '';

    if (employeeName) {
      this.employee = employeeName;
    }

    if (departmentValue) {
      this.department = this.findMatchingDepartmentOption(departmentValue);
    }
  }

  private findProfileRecordForSessionUser() {
    const sessionUserId = this.authService.getSessionUserId()?.trim().toLowerCase();
    const sessionUserName = this.authService.getSessionUser()?.name?.trim().toLowerCase();

    const directMatch = this.applicationFormService.getSignedInUserRecord(this.authService.getSessionUserId());
    if (directMatch) {
      return directMatch;
    }

    return this.applicationFormService
      .getApplicationRecords()
      .find((record) => {
        const employeeName = record.EmployeeName?.trim().toLowerCase() || '';
        const detailName = record.detail?.personalInfo?.personName?.trim().toLowerCase() || '';
        const loginName = record.detail?.loginDetails?.employeeName?.trim().toLowerCase() || '';
        const employeeCode = record.EmployeeCode?.trim().toLowerCase() || '';
        const userId = record.userId?.trim().toLowerCase() || '';

        return (
          employeeName === sessionUserName ||
          detailName === sessionUserName ||
          loginName === sessionUserName ||
          employeeCode === sessionUserId ||
          userId === sessionUserId
        );
      });
  }

  private findMatchingDepartmentOption(value: string): string {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) {
      return '';
    }

    const normalized = trimmed.toLowerCase();
    const directMatch = this.departmentOptions.find((option) => option.trim().toLowerCase() === normalized);
    if (directMatch) {
      return directMatch;
    }

    const partialMatch = this.departmentOptions.find(
      (option) => option.trim().toLowerCase().includes(normalized) || normalized.includes(option.trim().toLowerCase()),
    );

    return partialMatch ?? this.departmentService.resolveDepartmentName(trimmed);
  }

  get totalQty(): number {
    return this.lines
      .filter((line) => !line.deleted)
      .reduce((s, l) => s + (Number(l.qty) || 0), 0);
  }

  get isBaseDocumentDisabled(): boolean {
    return !!this.editingId || this.type === 'Stand Alone Documents';
  }

  isRequiredFieldInvalid(field: 'type' | 'documentDate' | 'department' | 'businessPartnerName'): boolean {
    if (!this.submitted) {
      return false;
    }

    switch (field) {
      case 'type':
        return !this.type?.trim();
      case 'documentDate':
        return !this.documentDate?.trim();
      case 'department':
        return !this.department?.trim();
      case 'businessPartnerName':
        return !this.businessPartnerName?.trim();
      default:
        return false;
    }
  }

  isLineItemsInvalid(): boolean {
    return this.submitted && !this.lines.some((line) => !line.deleted);
  }

  trackByIndex(index: number): number {
    return index;
  }

  addLine(): void {
    this.lines = [...this.lines, createEmptyIgpLineItem()];
  }

  removeLine(index: number): void {
    const line = this.lines[index];
    if (line && !line.deleted) {
      line.deleted = true;
    }
  }

  applyItemMaster(line: IgpLineItem, item: GatePassItemMaster): void {
    this.itemMasterService.applyToLine(line, item);
  }

  private hydrateLinesFromItemMaster(): void {
    this.itemMasterService.ensureLoaded().subscribe(() => {
      this.lines = this.lines.map((line) => {
        if (!line.deleted) {
          this.itemMasterService.applyCatalogDefaultsToLine(line);
        }
        return line;
      });
    });
  }

  applyBusinessPartner(partner: GatePassBusinessPartner): void {
    this.businessPartnerCode = partner.code;
    this.businessPartnerName = partner.name;
  }

  onDriverCnicChange(value: string): void {
    this.driverCnic = formatGatePassCnic(value);
  }

  onDriverPhoneChange(value: string): void {
    this.driverPhone = formatGatePassPhoneDigits(value);
  }

  back(): void {
    void this.router.navigateByUrl('/gate-pass/igp');
  }

  scrollToSection(sectionId: string): void {
    this.activeSection = sectionId;
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  onBaseDocumentTypeChange(): void {
    if (this.editingId) {
      return;
    }

    this.clearBaseDocumentDerivedFields();
  }

  clearBaseDocumentSelection(): void {
    if (this.editingId) {
      return;
    }

    this.clearBaseDocumentDerivedFields();
  }

  private clearBaseDocumentDerivedFields(): void {
    this.baseDocNo = '';
    this.poNumber = '';
    this.businessPartnerCode = '';
    this.businessPartnerName = '';
    this.vehicleNo = '';
    this.fromUnit = '';
    this.kantaSlip = '';
    this.biltyNo = '';
    this.store = '';
    this.driverName = '';
    this.driverCnic = '';
    this.driverPhone = '';
    this.weight = '';
    this.location = '';
    this.remarks = '';
    this.lines = [];
  }

  openBaseDocumentModal(): void {
    if (this.isBaseDocumentDisabled) {
      return;
    }
    if (!this.type?.trim()) {
      void this.alertService.validation('Select a document type first.');
      return;
    }
    this.showBaseDocModal = true;
  }

  onBaseDocumentPicked(doc: OpenBaseDocument): void {
    this.applyBaseDocument(doc);
  }

  private applyBaseDocument(doc: OpenBaseDocument): void {
    this.baseDocNo = doc.number;
    this.poNumber = doc.number || doc.docNum || '';
    if (doc.date?.trim()) {
      this.documentDate = doc.date.trim();
    }
    this.businessPartnerCode = doc.businessPartnerCode?.trim() ?? '';
    this.businessPartnerName = (doc.businessPartnerName || doc.partner || '').trim();
    this.vehicleNo = doc.vehicleNo?.trim() ?? '';
    this.fromUnit = doc.fromUnit?.trim() ?? '';
    this.kantaSlip = doc.kantaSlip?.trim() ?? '';
    if (doc.department?.trim()) {
      this.department = this.findMatchingDepartmentOption(doc.department);
    }
    this.biltyNo = doc.biltyNo?.trim() ?? '';
    this.store = resolveGatePassWarehouseCode(doc.store) || doc.store?.trim() || '';
    this.driverName = (doc.driverName ?? doc.transporterName)?.trim() ?? '';
    this.driverCnic = formatGatePassCnic((doc.driverCnic ?? doc.transporterCnic)?.trim() ?? '');
    this.driverPhone = formatGatePassPhoneDigits((doc.driverPhone ?? doc.transporterPhone)?.trim() ?? '');
    this.weight = numericFieldFromDoc(doc.weight);
    const resolvedLocation = resolveGatePassLocation(doc.location) || resolveGatePassLocation(doc.bplId);
    this.location = resolvedLocation || doc.location?.trim() || '';
    this.remarks = doc.remarks?.trim() ?? '';
    this.lines =
      doc.lines?.map((l) => ({
        itemCode: l.itemCode,
        itemName: l.itemName,
        serialNumbers: '',
        category: l.category,
        packingCondition: l.packingCondition,
        productQuality: l.productQuality,
        uom: l.uom,
        maximumQuantity: null,
        remainingQuantity: null,
        qty: Number(l.qty) || 0,
        quantity: null,
        info: l.info ?? '',
        remarks: l.remarks ?? '',
        deleted: false,
      })) ?? [];
    this.hydrateLinesFromItemMaster();
  }

  submitForm(): void {
    if (this.submitting || this.loading) {
      return;
    }

    this.submitted = true;

    if (!this.type?.trim() || !this.documentDate?.trim() || !this.department?.trim() || !this.businessPartnerName?.trim()) {
      void this.alertService.validation('Please fill in all required fields marked with *.');
      return;
    }

    if (!this.lines.some((line) => !line.deleted)) {
      void this.alertService.validation('At least one line item is required.');
      return;
    }

    this.submitting = true;
    if (!this.editingId) {
      void this.saveNewIgp();
      return;
    }

    const request$ = this.igpService.updateInwardGatePass(this.editingId, this.buildPayload());
    request$
      .pipe(finalize(() => {
        this.submitting = false;
      }))
      .subscribe({
        next: async (response) => {
          if (response?.status === false || response?.success === false) {
            const fallback = this.editingId ? 'Failed to update IGP.' : 'Failed to save IGP.';
            this.alertService.error('Error', response.message || fallback);
            return;
          }

          const title = this.editingId ? 'Updated' : 'Success';
          const message = this.editingId
            ? response?.message || 'IGP record updated successfully.'
            : response?.message || 'IGP record saved successfully.';
          await this.alertService.successAndWait(title, message);
          this.igpService.fetchInwardGatePasses().subscribe();
          this.back();
        },
        error: (error: unknown) => {
          const fallback = this.editingId ? 'Failed to update IGP.' : 'Failed to save IGP.';
          this.alertService.error('Error', formatApiErrorMessage(error, fallback));
        },
      });
  }

  private populateFromRecord(record: IgpRecord): void {
    this.type = emptyIfDash(record.type) || 'Purchase Order';
    this.documentDate = emptyIfDash(record.submittedDate) || this.documentDate;
    this.referenceNo = emptyIfDash(record.referenceNo);
    this.businessPartnerCode = emptyIfDash(record.businessPartnerCode);
    this.baseDocNo = emptyIfDash(record.baseDocNo);
    this.poNumber = emptyIfDash(record.poNumber) || emptyIfDash(record.baseDocNo);
    this.businessPartnerName = emptyIfDash(record.businessPartnerName);
    this.vehicleNo = emptyIfDash(record.vehicleNo);
    this.fromUnit = emptyIfDash(record.fromUnit);
    this.kantaSlip = emptyIfDash(record.kantaSlip);
    this.biltyNo = emptyIfDash(record.biltyNo);
    this.store = resolveGatePassWarehouseCode(emptyIfDash(record.store));
    this.driverName = emptyIfDash(record.driverName);
    this.driverCnic = formatGatePassCnic(emptyIfDash(record.driverCnic));
    this.driverPhone = formatGatePassPhoneDigits(emptyIfDash(record.driverPhone));
    this.department = emptyIfDash(record.department);
    this.weight = numericFieldFromDoc(emptyIfDash(record.weight));
    this.location = resolveGatePassLocation(emptyIfDash(record.location));
    this.employee = emptyIfDash(record.employee);
    this.remarks = emptyIfDash(record.remarks ?? '');
    this.lines = record.lines.length ? record.lines.map((line) => ({ ...line })) : [];
    this.hydrateLinesFromItemMaster();
  }

  private buildPayload(): IgpAddPayload {
    const linesForPayload = this.lines
      .filter((line) => !line.deleted)
      .map((line) => {
        const hydrated = { ...line };
        if (!hydrated.category?.trim()) {
          hydrated.category = 'N/A';
        }
        if (!hydrated.packingCondition?.trim()) {
          hydrated.packingCondition = 'N/A';
        }
        if (!hydrated.productQuality?.trim()) {
          hydrated.productQuality = 'N/A';
        }
        if (!hydrated.uom?.trim()) {
          hydrated.uom = 'EA';
        }
        if (!hydrated.info?.trim()) {
          hydrated.info = '';
        }
        if (!hydrated.remarks?.trim()) {
          hydrated.remarks = '';
        }

        return {
          itemCode: normalizeGatePassString(hydrated.itemCode),
          itemName: normalizeGatePassString(hydrated.itemName),
          category: normalizeGatePassString(hydrated.category),
          packingCondition: normalizeGatePassString(hydrated.packingCondition),
          productQuality: normalizeGatePassString(hydrated.productQuality),
          uom: normalizeGatePassString(hydrated.uom),
          maximumQuantity: hydrated.maximumQuantity,
          remainingQuantity: hydrated.remainingQuantity,
          qty: Number(hydrated.qty) || 0,
          quantity: hydrated.quantity,
          info: normalizeGatePassString(hydrated.info),
          remarks: normalizeGatePassString(hydrated.remarks),
        };
      });

    return {
      type: normalizeGatePassString(this.type),
      baseDocNo: normalizeGatePassString(this.baseDocNo),
      poNumber: normalizeGatePassString(this.poNumber),
      documentDate: normalizeGatePassString(this.documentDate),
      date: normalizeGatePassString(this.documentDate),
      submittedDate: normalizeGatePassString(this.documentDate),
      referenceNo: normalizeGatePassString(this.referenceNo),
      businessPartnerCode: normalizeGatePassString(this.businessPartnerCode),
      businessPartnerName: normalizeGatePassString(this.businessPartnerName),
      vehicleNo: normalizeGatePassString(this.vehicleNo),
      fromUnit: normalizeGatePassString(this.fromUnit),
      kantaSlip: normalizeGatePassString(this.kantaSlip),
      biltyNo: normalizeGatePassString(this.biltyNo),
      store: normalizeGatePassString(this.store),
      driverName: normalizeGatePassString(this.driverName),
      driverCnic: normalizeGatePassString(this.driverCnic),
      driverPhone: normalizeGatePassString(this.driverPhone),
      department: normalizeGatePassString(this.department),
      weight: normalizeGatePassString(this.weight),
      location: normalizeGatePassString(this.location),
      employee: normalizeGatePassString(this.employee),
      remarks: normalizeGatePassString(this.remarks),
      lines: linesForPayload,
      totalQty: this.totalQty,
    };
  }
}
