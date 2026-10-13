import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, firstValueFrom } from 'rxjs';
import { AlertService } from '../../../../services/alert.service';
import { formatApiErrorMessage } from '../../../../utils/api-error.util';
import {
  AgpAddPayload,
  AgpLineItem,
  AgpRecord,
  AgpService,
  createEmptyAgpLineItem,
} from '../agp.service';
import { GATE_PASS_LOCATION_OPTIONS, resolveGatePassLocation } from '../../gate-pass-location.options';
import { GatePassItemMaster, GatePassItemMasterService } from '../../gate-pass-item-master.service';
import { GatePassItemSearchInputComponent } from '../../item-search-input/item-search-input';
import {
  GatePassBusinessPartner,
  GatePassBusinessPartnerService,
} from '../../gate-pass-business-partner.service';
import { GatePassBusinessPartnerSearchInputComponent } from '../../business-partner-search-input/business-partner-search-input';
import {
  reserveNextGatePassReferenceNo,
} from '../../gate-pass-reference.util';
import { GatePassWarehouseOption, resolveGatePassWarehouseCode } from '../../gate-pass-warehouse.options';
import { formatGatePassCnic, formatGatePassPhoneDigits } from '../../gate-pass-input-format.util';
import { GatePassDepartmentService } from '../../gate-pass-department.service';
import { BaseDocumentModalComponent } from '../../base-document-modal/base-document-modal';
import { OpenBaseDocument } from '../../open-base-documents.service';
import { ApplicationFormService } from '../../../../services/application-form.service';
import { AuthService } from '../../../../services/auth.service';
import { WarehouseService } from '../../../../services/warehouse.service';

const AGP_TYPE = 'Article Gate Pass';
const MAX_REFERENCE_RETRY = 3;

function emptyIfDash(value: string): string {
  return value === '—' ? '' : value;
}

function numericFieldFromDoc(value: string | undefined): string {
  const parsed = parseFloat(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? String(parsed) : '';
}

function normalizeReturnStatus(status: unknown, returnDate: string): 'Yes' | 'No' {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(normalized)) {
    return 'Yes';
  }
  if (['no', 'n', 'false', '0'].includes(normalized)) {
    return 'No';
  }
  return returnDate.trim() ? 'Yes' : 'No';
}

@Component({
  selector: 'app-create-agp',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BaseDocumentModalComponent,
    GatePassItemSearchInputComponent,
    GatePassBusinessPartnerSearchInputComponent,
  ],
  templateUrl: './create-agp.html',
  styleUrls: [
    '../../../HR-Portal/Application-Form/create-job-requisition/create-job-requisition.css',
    '../../../HR-Portal/employee-action/probation-evaluation-form/add-probation-evaluation/add-probation-evaluation.css',
    '../../igp/create-igp/create-igp.css',
  ],
})
export class CreateAgpComponent implements OnInit {
  editingId: string | null = null;
  pageTitle = 'Add AGP';
  submitButtonLabel = 'Save AGP';
  activeSection = 'agp-form-header-section';

  get pageSubtitle(): string {
    return this.editingId
      ? 'Update article gate pass details, movement lines, and document summary.'
      : 'Create a new article gate pass with movement, logistics, and line items.';
  }

  readonly agpType = AGP_TYPE;
  type = 'Purchase Order';
  documentDate = '';
  businessPartnerCode = '';
  baseDocNo = '';
  referenceNo = 'System Generated';
  businessPartnerName = '';
  vehicleNo = '';

  reasonForMovement = '';
  natureOfItem = '';
  natureOfRepair = '';
  requestingEmployee = '';
  requestingDepartment = '';
  requestedBy = '';
  issuedTo = '';

  articleOutDate = '';
  articleReturnedDate = '';
  issueResolved: 'Yes' | 'No' = 'No';
  returnStatus: 'Yes' | 'No' = 'No';
  warrantyClaimable: 'Yes' | 'No' = 'No';
  warrantyStartDate = '';
  warrantyDuration = '';
  warrantyExpiryDate = '';
  location = '';
  store = '';
  kantaSlip = '';

  driverName = '';
  driverCnic = '';
  driverPhone = '';
  biltyNo = '';
  weight = '';

  attachmentFileName = '';
  headOfSupplyChainApproval = false;

  lines: AgpLineItem[] = [];
  remarks = '';
  loading = false;
  submitting = false;
  showBaseDocModal = false;

  departmentOptions: string[] = [];
  readonly typeOptions = ['Purchase Order', 'Purchase Request', 'Stand Alone Documents'] as const;
  readonly locationOptions = GATE_PASS_LOCATION_OPTIONS;
  warehouseOptions: GatePassWarehouseOption[] = [];

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly agpService: AgpService,
    private readonly alertService: AlertService,
    private readonly itemMasterService: GatePassItemMasterService,
    private readonly businessPartnerService: GatePassBusinessPartnerService,
    private readonly departmentService: GatePassDepartmentService,
    private readonly applicationFormService: ApplicationFormService,
    private readonly authService: AuthService,
    private readonly warehouseService: WarehouseService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    const d = new Date();
    this.documentDate = d.toISOString().slice(0, 10);
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
    this.pageTitle = 'Update AGP';
    this.submitButtonLabel = 'Update AGP';
    this.loading = true;

    this.agpService
      .fetchArticleGatePassDetail(editId)
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
            formatApiErrorMessage(error, 'Failed to load AGP for edit.'),
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
      const records = await firstValueFrom(this.agpService.fetchArticleGatePasses());
      return reserveNextGatePassReferenceNo(
        'AGP',
        records.map((record) => record.referenceNo),
      );
    } catch {
      return reserveNextGatePassReferenceNo('AGP', []);
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

  private async saveNewAgp(attempt = 1): Promise<void> {
    try {
      const allocatedReferenceNo = await this.ensureUniqueReferenceNo();
      const response = await firstValueFrom(
        this.agpService.addArticleGatePass({
          ...this.buildPayload(),
          referenceNo: allocatedReferenceNo,
        }),
      );

      if (response?.status === false || response?.success === false) {
        if (attempt < MAX_REFERENCE_RETRY && this.isReferenceDuplicateError(response.message)) {
          await this.delay(250);
          return this.saveNewAgp(attempt + 1);
        }

        this.alertService.error('Error', response.message || 'Failed to save AGP.');
        return;
      }

      this.referenceNo = allocatedReferenceNo;
      this.cdr.detectChanges();
      await this.alertService.successAndWait('Success', response?.message || 'AGP record saved successfully.');
      this.agpService.fetchArticleGatePasses().subscribe();
      this.back();
    } catch (error: unknown) {
      const apiMessage = formatApiErrorMessage(error, 'Failed to save AGP.');
      if (attempt < MAX_REFERENCE_RETRY && this.isReferenceDuplicateError(apiMessage)) {
        await this.delay(250);
        return this.saveNewAgp(attempt + 1);
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
    if (this.editingId) {
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

    if (employeeName && !this.requestingEmployee.trim()) {
      this.requestingEmployee = employeeName;
    }

    if (departmentValue && !this.requestingDepartment.trim()) {
      this.requestingDepartment = this.findMatchingDepartmentOption(departmentValue);
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

  get totalQtySent(): number {
    return this.lines
      .filter((line) => !line.deleted)
      .reduce((s, l) => s + (Number(l.qtySent) || 0), 0);
  }

  get totalQtyReceived(): number {
    return this.lines
      .filter((line) => !line.deleted)
      .reduce((s, l) => s + (Number(l.qtyReceived) || 0), 0);
  }

  trackByIndex(index: number): number {
    return index;
  }

  addLine(): void {
    this.lines = [...this.lines, createEmptyAgpLineItem()];
  }

  removeLine(index: number): void {
    this.lines = this.lines.filter((_, lineIndex) => lineIndex !== index);
  }

  applyItemMaster(line: AgpLineItem, item: GatePassItemMaster): void {
    this.itemMasterService.applyToLine(line, item);
    line.oitmCode = item.itemCode;
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

  warnBeforeEditingItemDetails(): void {
    if (!this.editingId) {
      return;
    }

    this.alertService.warning(
      'Item details',
      'Please avoid changing the item code or item name while updating an AGP.',
    );
  }

  onAttachmentChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.attachmentFileName = file?.name ?? '';
  }

  clearAttachment(): void {
    this.attachmentFileName = '';
  }

  get isBaseDocumentDisabled(): boolean {
    return !!this.editingId || this.type === 'Stand Alone Documents';
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
    this.businessPartnerCode = '';
    this.businessPartnerName = '';
    this.vehicleNo = '';
    this.reasonForMovement = '';
    this.natureOfItem = '';
    this.natureOfRepair = '';
    this.requestingEmployee = '';
    this.requestingDepartment = '';
    this.requestedBy = '';
    this.issuedTo = '';
    this.articleOutDate = '';
    this.articleReturnedDate = '';
    this.issueResolved = 'No';
    this.returnStatus = 'No';
    this.warrantyClaimable = 'No';
    this.warrantyStartDate = '';
    this.warrantyDuration = '';
    this.warrantyExpiryDate = '';
    this.location = '';
    this.store = '';
    this.kantaSlip = '';
    this.driverName = '';
    this.driverCnic = '';
    this.driverPhone = '';
    this.biltyNo = '';
    this.weight = '';
    this.attachmentFileName = '';
    this.headOfSupplyChainApproval = false;
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
    if (doc.date?.trim()) {
      this.documentDate = doc.date.trim();
    }
    this.businessPartnerCode = doc.businessPartnerCode?.trim() ?? '';
    this.businessPartnerName = (doc.businessPartnerName || doc.partner || '').trim();
    this.vehicleNo = doc.vehicleNo?.trim() ?? '';
    this.kantaSlip = doc.kantaSlip?.trim() ?? '';
    if (doc.department?.trim()) {
      this.requestingDepartment = this.findMatchingDepartmentOption(doc.department);
    }
    this.biltyNo = doc.biltyNo?.trim() ?? '';
    this.store = resolveGatePassWarehouseCode(doc.store) || doc.store?.trim() || '';
    this.location = resolveGatePassLocation(doc.location) || doc.location?.trim() || '';
    this.reasonForMovement = doc.reasonForMovement?.trim() ?? '';
    this.natureOfItem = '';
    this.natureOfRepair = '';
    this.requestingEmployee = doc.requestingEmployee?.trim() ?? '';
    this.requestedBy = doc.requestedBy?.trim() ?? '';
    this.issuedTo = doc.issuedTo?.trim() ?? '';
    this.articleOutDate = doc.articleOutDate?.trim() ?? '';
    this.articleReturnedDate = doc.articleReturnedDate?.trim() ?? '';
    this.issueResolved = 'No';
    this.returnStatus = normalizeReturnStatus(undefined, this.articleReturnedDate);
    this.warrantyClaimable = 'No';
    this.warrantyStartDate = '';
    this.warrantyDuration = '';
    this.warrantyExpiryDate = '';
    this.driverName = (doc.driverName ?? doc.transporterName)?.trim() ?? '';
    this.driverCnic = formatGatePassCnic((doc.driverCnic ?? doc.transporterCnic)?.trim() ?? '');
    this.driverPhone = formatGatePassPhoneDigits((doc.driverPhone ?? doc.transporterPhone)?.trim() ?? '');
    this.weight = numericFieldFromDoc(doc.weight);
    this.remarks = doc.remarks?.trim() ?? '';
    this.lines =
      doc.lines?.map((l) => ({
        itemCode: l.itemCode,
        itemName: l.itemName,
        oitmCode: l.itemCode,
        serialNumbers: '',
        category: l.category,
        packingCondition: l.packingCondition,
        productQuality: l.productQuality,
        uom: l.uom,
        qtySent: Number(l.qty) || 0,
        qtyReceived: 0,
        info: l.info ?? '',
        remarks: l.remarks ?? '',
        deleted: false,
      })) ?? [];
    this.hydrateLinesFromItemMaster();
  }

  onWarrantyClaimableChange(): void {
    if (this.warrantyClaimable === 'No') {
      this.warrantyStartDate = '';
      this.warrantyDuration = '';
      this.warrantyExpiryDate = '';
      return;
    }
    this.updateWarrantyExpiryDate();
  }

  updateWarrantyExpiryDate(): void {
    if (this.warrantyClaimable !== 'Yes' || !this.warrantyStartDate || !this.warrantyDuration) {
      this.warrantyExpiryDate = '';
      return;
    }

    const durationDays = Number(this.warrantyDuration);
    const startDate = new Date(`${this.warrantyStartDate}T00:00:00Z`);
    if (!Number.isFinite(durationDays) || durationDays < 0 || Number.isNaN(startDate.getTime())) {
      this.warrantyExpiryDate = '';
      return;
    }

    startDate.setUTCDate(startDate.getUTCDate() + durationDays);
    this.warrantyExpiryDate = startDate.toISOString().slice(0, 10);
  }

  back(): void {
    void this.router.navigateByUrl('/gate-pass/agp');
  }

  scrollToSection(sectionId: string): void {
    this.activeSection = sectionId;
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  submitForm(): void {
    if (this.submitting || this.loading) {
      return;
    }

    if (!this.documentDate?.trim() || !this.requestingDepartment?.trim() || !this.businessPartnerName?.trim()) {
      void this.alertService.validation(
        'Please ensure Date, Requesting department, and Business partner name are filled.',
      );
      return;
    }

    if (!this.lines.some((line) => !line.deleted)) {
      void this.alertService.validation('At least one line item is required.');
      return;
    }

    this.submitting = true;
    if (!this.editingId) {
      void this.saveNewAgp();
      return;
    }

    const request$ = this.agpService.updateArticleGatePass(this.editingId, this.buildPayload());
    request$
      .pipe(finalize(() => {
        this.submitting = false;
      }))
      .subscribe({
        next: async (response) => {
          if (response?.status === false || response?.success === false) {
            const fallback = this.editingId ? 'Failed to update AGP.' : 'Failed to save AGP.';
            this.alertService.error('Error', response.message || fallback);
            return;
          }

          const title = this.editingId ? 'Updated' : 'Success';
          const message = this.editingId
            ? response?.message || 'AGP record updated successfully.'
            : response?.message || 'AGP record saved successfully.';
          await this.alertService.successAndWait(title, message);
          this.agpService.fetchArticleGatePasses().subscribe();
          this.back();
        },
        error: (error: unknown) => {
          const fallback = this.editingId ? 'Failed to update AGP.' : 'Failed to save AGP.';
          this.alertService.error('Error', formatApiErrorMessage(error, fallback));
        },
      });
  }

  private populateFromRecord(record: AgpRecord): void {
    this.type = emptyIfDash(record.type) || 'Purchase Order';
    this.documentDate = emptyIfDash(record.submittedDate) || this.documentDate;
    this.referenceNo = emptyIfDash(record.referenceNo);
    this.baseDocNo = emptyIfDash(record.baseDocNo);
    this.businessPartnerCode = emptyIfDash(record.businessPartnerCode);
    this.businessPartnerName = emptyIfDash(record.businessPartnerName);
    this.vehicleNo = emptyIfDash(record.vehicleNo);
    this.reasonForMovement = emptyIfDash(record.reasonForMovement);
    this.natureOfItem = emptyIfDash(record.natureOfItem);
    this.natureOfRepair = emptyIfDash(record.natureOfRepair);
    this.requestingEmployee = emptyIfDash(record.requestingEmployee);
    this.requestingDepartment = emptyIfDash(record.requestingDepartment);
    this.requestedBy = emptyIfDash(record.requestedBy);
    this.issuedTo = emptyIfDash(record.issuedTo);
    this.articleOutDate = emptyIfDash(record.articleOutDate);
    this.articleReturnedDate = emptyIfDash(record.articleReturnedDate);
    this.issueResolved = normalizeReturnStatus(record.issueResolved, '');
    this.returnStatus = normalizeReturnStatus(record.returnStatus, this.articleReturnedDate);
    this.warrantyClaimable = normalizeReturnStatus(record.warrantyClaimable, record.warrantyStartDate);
    this.warrantyStartDate = emptyIfDash(record.warrantyStartDate);
    this.warrantyDuration = emptyIfDash(record.warrantyDuration);
    this.warrantyExpiryDate = emptyIfDash(record.warrantyExpiryDate);
    if (!this.warrantyExpiryDate) {
      this.updateWarrantyExpiryDate();
    }
    this.location = resolveGatePassLocation(emptyIfDash(record.location)) || emptyIfDash(record.location);
    this.store = resolveGatePassWarehouseCode(emptyIfDash(record.store)) || emptyIfDash(record.store);
    this.kantaSlip = emptyIfDash(record.kantaSlip);
    this.driverName = emptyIfDash(record.driverName);
    this.driverCnic = formatGatePassCnic(emptyIfDash(record.driverCnic));
    this.driverPhone = formatGatePassPhoneDigits(emptyIfDash(record.driverPhone));
    this.biltyNo = emptyIfDash(record.biltyNo);
    this.weight = numericFieldFromDoc(emptyIfDash(record.weight));
    this.attachmentFileName = emptyIfDash(record.attachmentFileName ?? '');
    this.headOfSupplyChainApproval = record.headOfSupplyChainApproval;
    this.remarks = emptyIfDash(record.remarks ?? '');
    this.lines = record.lines.length ? record.lines.map((line) => ({ ...line })) : [];
  }

  private buildPayload(): AgpAddPayload {
    return {
      type: this.type.trim(),
      baseDocNo: String(this.baseDocNo ?? '').trim() || 'N/A',
      documentDate: this.documentDate.trim(),
      referenceNo: this.referenceNo.trim(),
      businessPartnerCode: this.businessPartnerCode.trim(),
      businessPartnerName: this.businessPartnerName.trim(),
      vehicleNo: this.vehicleNo.trim(),
      location: this.location.trim(),
      reasonForMovement: this.reasonForMovement.trim(),
      requestingEmployee: this.requestingEmployee.trim(),
      requestingDepartment: this.requestingDepartment.trim(),
      requestedBy: this.requestedBy.trim(),
      issuedTo: this.issuedTo.trim(),
      articleOutDate: this.articleOutDate.trim(),
      articleReturnedDate: this.articleReturnedDate.trim() || null,
      issueResolved: this.issueResolved,
      transporterName: this.driverName.trim(),
      transporterCnic: this.driverCnic.trim(),
      transporterPhone: this.driverPhone.trim(),
      biltyNo: this.biltyNo.trim(),
      freightAmount: Number(this.weight) || 0,
      attachmentFileName: this.attachmentFileName.trim(),
      headOfSupplyChainApproval: this.headOfSupplyChainApproval,
      remarks: this.remarks.trim(),
      lines: this.lines
        .filter((line) => !line.deleted)
        .map((line) => ({
          oitmCode: line.oitmCode.trim() || line.itemCode.trim(),
          itemCode: line.itemCode.trim(),
          itemName: line.itemName.trim(),
          serialNumbers: line.serialNumbers.trim(),
          category: line.category.trim(),
          packingCondition: line.packingCondition.trim(),
          productQuality: line.productQuality.trim(),
          uom: line.uom.trim(),
          qtySent: Number(line.qtySent) || 0,
          qtyReceived: Number(line.qtyReceived) || 0,
          info: line.info.trim(),
          remarks: line.remarks.trim(),
        })),
      totalQtySent: this.totalQtySent,
      totalQtyReceived: this.totalQtyReceived,
    };
  }
}
