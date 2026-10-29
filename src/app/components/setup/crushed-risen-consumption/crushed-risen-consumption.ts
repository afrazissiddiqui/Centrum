import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AlertService } from '../../../services/alert.service';
import { AuthService } from '../../../services/auth.service';
import {
  CrushedRisenConsumptionAddPayload,
  CrushedRisenConsumptionDetail,
  CrushedRisenConsumptionService,
  CrushedRisenConsumptionUpdatePayload,
} from '../../../services/crushed-risen-consumption.service';
import { OitmItemsService } from '../../../services/oitm-items.service';
import { formatApiErrorMessage } from '../../../utils/api-error.util';
import { PageToolbarComponent } from '../../page-toolbar/page-toolbar';
import { MiscellaneousLayoutService } from '../../miscellaneous/miscellaneous-layout.service';
import { ProductionOrderRecord, ReceiptFromProductionService } from '../../miscellaneous/receipt-from-production/receipt-from-production.service';

interface CrushedRisenConsumptionHeader {
  series: string;
  signedUser: string;
  remark: string;
  itemNameFromProduction: string;
  documentNumberFromProduction: string;
  cancel: '' | 'Yes' | 'No';
  status: string;
  itemCodeFromProduction: string;
  productDocEntry: string;
  crcNumber: string;
  createDate: string;
  createTime: string;
  updateDate: string;
  updateTime: string;
}

type CrushedRisenConsumptionHeaderField = Exclude<keyof CrushedRisenConsumptionHeader, 'signedUser'>;

interface CrushedRisenConsumptionLine {
  machineId: string;
  machineName: string;
  moldNumberFromProductionOrder: string;
  cavityNumberFromProductionOrder: string;
  employeeShift: string;
  crushedRisenConsumption: number | string | null;
}

@Component({
  selector: 'app-crushed-risen-consumption',
  imports: [CommonModule, FormsModule, PageToolbarComponent],
  templateUrl: './crushed-risen-consumption.html',
  styleUrl: '../../miscellaneous/miscellaneous-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrushedRisenConsumptionComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly consumptionService = inject(CrushedRisenConsumptionService);
  private readonly oitmItemsService = inject(OitmItemsService);
  private readonly receiptFromProductionService = inject(ReceiptFromProductionService);
  protected readonly layout = inject(MiscellaneousLayoutService);

  readonly saving = signal(false);
  readonly loadingRecord = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);
  readonly productionOrders = signal<ProductionOrderRecord[]>([]);
  readonly productionOrdersLoading = signal(false);
  readonly productionOrdersError = signal<string | null>(null);
  readonly productionOrderDialogOpen = signal(false);
  readonly productionOrderSearchText = signal('');
  readonly selectedProductionOrder = signal<ProductionOrderRecord | null>(null);
  readonly machineOptions = computed(() =>
    this.oitmItemsService.getCatalog().filter((item) => item.fetchPro?.trim() === 'Y'),
  );

  readonly filteredProductionOrders = computed(() => {
    const query = this.productionOrderSearchText().trim().toLowerCase();
    if (!query) {
      return this.productionOrders();
    }

    return this.productionOrders().filter((order) => {
      const searchable = [
        order.docEntry,
        order.docNum,
        order.customerCode,
        order.itemCode,
        order.itemDescription,
        order.postDate,
        order.dueDate,
        order.warehouse,
        order.status,
        order.branch,
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(query);
    });
  });

  readonly headerForm = signal<CrushedRisenConsumptionHeader>({
    series: '',
    signedUser: this.authService.getSessionUser()?.name ?? '',
    remark: '',
    itemNameFromProduction: '',
    documentNumberFromProduction: '',
    cancel: '',
    status: 'Open',
    itemCodeFromProduction: '',
    productDocEntry: '',
    crcNumber: '',
    createDate: this.getDateValue(),
    createTime: this.getTimeValue(),
    updateDate: '',
    updateTime: '',
  });
  readonly contentLines = signal<CrushedRisenConsumptionLine[]>([this.createEmptyLine()]);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isInteger(id) && id > 0) {
      this.editingId.set(id);
      this.loadRecordForEditing(id);
    }

    this.oitmItemsService.ensureLoaded().subscribe({
      error: (error: unknown) => {
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load machine items.'),
        );
      },
    });
  }

  updateHeaderField<K extends CrushedRisenConsumptionHeaderField>(
    field: K,
    value: CrushedRisenConsumptionHeader[K],
  ): void {
    this.headerForm.update((header) => ({ ...header, [field]: value }));
  }

  updateContentLine<K extends keyof CrushedRisenConsumptionLine>(
    index: number,
    field: K,
    value: CrushedRisenConsumptionLine[K],
  ): void {
    this.contentLines.update((lines) =>
      lines.map((line, lineIndex) => {
        if (lineIndex !== index) {
          return line;
        }
        if (field === 'machineId' && typeof value === 'string') {
          const machine = this.findMachineById(value);
          return {
            ...line,
            machineId: value,
            machineName: machine?.itemName ?? '',
            cavityNumberFromProductionOrder: machine?.cavityNumber ?? '',
          };
        }
        if (field === 'machineName' && typeof value === 'string') {
          const machine = this.findMachineByName(value);
          return {
            ...line,
            machineName: value,
            machineId: machine?.itemCode ?? '',
            cavityNumberFromProductionOrder: machine?.cavityNumber ?? '',
          };
        }
        return { ...line, [field]: value };
      }),
    );
  }

  private findMachineById(value: string) {
    const normalized = value.trim().toLowerCase();
    return this.machineOptions().find((item) => item.itemCode.trim().toLowerCase() === normalized);
  }

  private findMachineByName(value: string) {
    const normalized = value.trim().toLowerCase();
    return this.machineOptions().find((item) => item.itemName.trim().toLowerCase() === normalized);
  }

  moldOptionsForMachine(machineId: string): string[] {
    return this.findMachineById(machineId)
      ?.properties?.map((property) => property.name.trim())
      .filter(Boolean) ?? [];
  }

  addContentLine(): void {
    this.contentLines.update((lines) => [...lines, this.createEmptyLine()]);
  }

  deleteContentLine(index: number): void {
    this.contentLines.update((lines) =>
      lines.length > 1 ? lines.filter((_, lineIndex) => lineIndex !== index) : lines,
    );
  }

  saveRecord(): void {
    if (this.saving() || this.loadingRecord()) {
      return;
    }

    const header = this.headerForm();
    const lines = this.contentLines().map((line) => ({
      machineId: line.machineId.trim(),
      machineName: line.machineName.trim(),
      moldNumber: line.moldNumberFromProductionOrder.trim(),
      cavityNumber: line.cavityNumberFromProductionOrder.trim(),
      employeeShift: line.employeeShift.trim(),
      crushedRisenConsumption: line.crushedRisenConsumption,
    }));

    if (this.isEditing()) {
      const id = this.editingId();
      if (id === null) {
        return;
      }
      const payload: CrushedRisenConsumptionUpdatePayload = {
        remark: header.remark.trim(),
        status: header.status.trim(),
        lines,
      };
      this.saving.set(true);
      this.consumptionService
        .updateRecord(id, payload)
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => {
            void this.alertService.success('Updated', 'Crushed Risen Consumption updated successfully.');
            this.backToPurchaseRequest();
          },
          error: (error: unknown) => {
            void this.alertService.error(
              'Update Failed',
              formatApiErrorMessage(error, 'Failed to update Crushed Risen Consumption.'),
            );
          },
        });
      return;
    }

    const series = Number(header.series);
    if (!header.series.trim() || !Number.isFinite(series)) {
      void this.alertService.validation('Enter a valid numeric series before saving.');
      return;
    }
    if (!header.documentNumberFromProduction.trim() || !header.productDocEntry.trim()) {
      void this.alertService.validation('Select a production order before saving.');
      return;
    }

    const payload: CrushedRisenConsumptionAddPayload = {
      docNumPo: header.documentNumberFromProduction.trim(),
      docEntryPo: header.productDocEntry.trim(),
      itemCode: header.itemCodeFromProduction.trim(),
      itemName: header.itemNameFromProduction.trim(),
      crcNumber: header.crcNumber.trim(),
      series,
      status: header.status,
      userSigned: header.signedUser,
      remark: header.remark.trim(),
      createDate: header.createDate,
      createTime: this.formatCreateTime(header.createTime),
      lines: lines.map((line) => ({
        ...line,
        crushedRisenConsumption:
          line.crushedRisenConsumption === null || line.crushedRisenConsumption === ''
            ? null
            : Number(line.crushedRisenConsumption),
      })),
    };

    this.saving.set(true);
    this.consumptionService
      .addRecord(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          void this.alertService.success('Saved', 'Crushed Risen Consumption saved successfully.');
          this.backToPurchaseRequest();
        },
        error: (error: unknown) => {
          void this.alertService.error(
            'Save Failed',
            formatApiErrorMessage(error, 'Failed to save Crushed Risen Consumption.'),
          );
        },
      });
  }

  private loadRecordForEditing(id: number): void {
    this.loadingRecord.set(true);
    this.consumptionService
      .fetchRecordDetail(id)
      .pipe(finalize(() => this.loadingRecord.set(false)))
      .subscribe({
        next: (record) => this.populateForm(record),
        error: (error: unknown) => {
          void this.alertService.error(
            'Load Failed',
            formatApiErrorMessage(error, 'Failed to load Crushed Risen Consumption details.'),
          );
          this.backToPurchaseRequest();
        },
      });
  }

  private populateForm(record: CrushedRisenConsumptionDetail): void {
    this.headerForm.set({
      series: record.series,
      signedUser: record.signedUser,
      remark: record.remark,
      itemNameFromProduction: record.itemNameFromProduction,
      documentNumberFromProduction: record.documentNumberFromProduction,
      cancel: '',
      status: record.status,
      itemCodeFromProduction: record.itemCodeFromProduction,
      productDocEntry: record.productDocEntry,
      crcNumber: record.crcNumber,
      createDate: record.createDate.slice(0, 10),
      createTime: record.createTime,
      updateDate: record.updateDate.slice(0, 10),
      updateTime: record.updateTime,
    });
    this.contentLines.set(
      record.lines.map((line) => ({
        machineId: line.machineId,
        machineName: line.machineName,
        moldNumberFromProductionOrder: line.moldNumber,
        cavityNumberFromProductionOrder: line.cavityNumber,
        employeeShift: line.employeeShift,
        crushedRisenConsumption: line.crushedRisenConsumption,
      })),
    );
  }

  openProductionOrderDialog(): void {
    this.productionOrderDialogOpen.set(true);
    this.productionOrderSearchText.set('');
    this.productionOrdersLoading.set(true);
    this.productionOrdersError.set(null);

    this.receiptFromProductionService
      .listProductionOrders()
      .pipe(finalize(() => this.productionOrdersLoading.set(false)))
      .subscribe({
        next: (orders) => {
          this.productionOrders.set(orders);
          this.productionOrdersError.set(null);
        },
        error: (error: unknown) => {
          this.productionOrders.set([]);
          this.productionOrdersError.set('Could not load production orders.');
          void this.alertService.error('Load Failed', formatApiErrorMessage(error, 'Could not load production orders.'));
        },
      });
  }

  closeProductionOrderDialog(): void {
    this.productionOrderDialogOpen.set(false);
  }

  chooseProductionOrder(order: ProductionOrderRecord): void {
    this.productionOrderDialogOpen.set(false);
    this.selectedProductionOrder.set(order);

    const firstItem = order.items?.[0];
    const machineId = order.U_MachineID ?? '';
    const machineName = order.U_MachineName ?? '';
    const moldNumber = order.U_MoldNo ?? '';
    const cavityNumber = order.U_Cavity_NUM ?? '';
    const employeeShift = order.U_Shift ?? order.U_EmployeeShift ?? '';
    const itemCode = firstItem?.itemCode ?? order.itemCode ?? '';
    const itemName = firstItem?.itemDescription ?? order.itemDescription ?? '';

    this.headerForm.update((header) => ({
      ...header,
      documentNumberFromProduction: order.docNum || header.documentNumberFromProduction,
      productDocEntry: order.docEntry || header.productDocEntry,
      itemCodeFromProduction: itemCode || header.itemCodeFromProduction,
      itemNameFromProduction: itemName || header.itemNameFromProduction,
      status: order.status || header.status,
      series: order.seriesName || header.series,
    }));

    this.contentLines.update((lines) =>
      lines.map((line, index) =>
        index === 0
          ? {
              ...line,
              machineId: machineId || line.machineId,
              machineName: machineName || line.machineName,
              moldNumberFromProductionOrder: moldNumber || line.moldNumberFromProductionOrder,
              cavityNumberFromProductionOrder: cavityNumber || line.cavityNumberFromProductionOrder,
              employeeShift: employeeShift || line.employeeShift,
            }
          : line,
      ),
    );
  }

  private createEmptyLine(): CrushedRisenConsumptionLine {
    return {
      machineId: '',
      machineName: '',
      moldNumberFromProductionOrder: '',
      cavityNumberFromProductionOrder: '',
      employeeShift: '',
      crushedRisenConsumption: null,
    };
  }

  private getDateValue(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private getTimeValue(): string {
    return new Date().toTimeString().slice(0, 5);
  }

  private formatCreateTime(time: string): string {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!match) {
      return time;
    }

    const hour = Number(match[1]);
    const minute = match[2];
    if (hour < 0 || hour > 23) {
      return time;
    }

    return `${String(hour % 12 || 12).padStart(2, '0')}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;
  }

  backToPurchaseRequest(): void {
    void this.router.navigateByUrl('/miscellaneous/crushed-risen-consumption');
  }
}
