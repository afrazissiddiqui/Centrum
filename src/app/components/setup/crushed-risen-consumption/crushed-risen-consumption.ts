import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { AlertService } from '../../../services/alert.service';
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

type CrushedRisenConsumptionHeaderField = Exclude<keyof CrushedRisenConsumptionHeader, 'signedUser' | 'status'>;

interface CrushedRisenConsumptionLine {
  machineId: string;
  machineName: string;
  moldNumberFromProductionOrder: string;
  cavityNumberFromProductionOrder: string;
  employeeShift: string;
  crushedRisenConsumption: number | null;
}

@Component({
  selector: 'app-crushed-risen-consumption',
  imports: [CommonModule, FormsModule, PageToolbarComponent],
  templateUrl: './crushed-risen-consumption.html',
  styleUrl: '../../miscellaneous/miscellaneous-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrushedRisenConsumptionComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly receiptFromProductionService = inject(ReceiptFromProductionService);
  protected readonly layout = inject(MiscellaneousLayoutService);

  readonly productionOrders = signal<ProductionOrderRecord[]>([]);
  readonly productionOrdersLoading = signal(false);
  readonly productionOrdersError = signal<string | null>(null);
  readonly productionOrderDialogOpen = signal(false);
  readonly productionOrderSearchText = signal('');
  readonly selectedProductionOrder = signal<ProductionOrderRecord | null>(null);

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
      lines.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line)),
    );
  }

  addContentLine(): void {
    this.contentLines.update((lines) => [...lines, this.createEmptyLine()]);
  }

  deleteContentLine(index: number): void {
    this.contentLines.update((lines) =>
      lines.length > 1 ? lines.filter((_, lineIndex) => lineIndex !== index) : lines,
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

  backToPurchaseRequest(): void {
    void this.router.navigateByUrl('/miscellaneous/crushed-risen-consumption');
  }
}
