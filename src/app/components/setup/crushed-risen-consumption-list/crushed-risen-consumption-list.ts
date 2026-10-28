import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AlertService } from '../../../services/alert.service';
import { OitmItemsService } from '../../../services/oitm-items.service';
import {
  CrushedRisenConsumptionDetail,
  CrushedRisenConsumptionDetailLine,
  CrushedRisenConsumptionRecord,
  CrushedRisenConsumptionService,
  CrushedRisenConsumptionUpdatePayload,
} from '../../../services/crushed-risen-consumption.service';
import { formatApiErrorMessage } from '../../../utils/api-error.util';
import { MiscellaneousLayoutService } from '../../miscellaneous/miscellaneous-layout.service';

@Component({
  selector: 'app-crushed-risen-consumption-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './crushed-risen-consumption-list.html',
  styleUrls: [
    '../../miscellaneous/miscellaneous-list.css',
    '../../miscellaneous/miscellaneous-form.css',
    '../../sample-inspection-request/sample-inspection-request.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrushedRisenConsumptionListComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly consumptionService = inject(CrushedRisenConsumptionService);
  private readonly alertService = inject(AlertService);
  private readonly oitmItemsService = inject(OitmItemsService);
  protected readonly layout = inject(MiscellaneousLayoutService);

  readonly records = signal<CrushedRisenConsumptionRecord[]>([]);
  readonly loading = signal(false);
  readonly detail = signal<CrushedRisenConsumptionDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly deletingId = signal<number | null>(null);
  readonly detailEditing = signal(false);
  readonly updating = signal(false);
  readonly machineOptions = computed(() =>
    this.oitmItemsService.getCatalog().filter((item) => item.fetchPro?.trim() === 'Y'),
  );

  ngOnInit(): void {
    this.loadRecords();
    this.oitmItemsService.ensureLoaded().subscribe({
      error: (error: unknown) => {
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load machine items.'),
        );
      },
    });
  }

  loadRecords(): void {
    this.loading.set(true);
    this.consumptionService
      .fetchRecords()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (records) => this.records.set(records),
        error: (error: unknown) => {
          this.records.set([]);
          void this.alertService.error(
            'Load Failed',
            formatApiErrorMessage(error, 'Failed to load Crushed Risen Consumption records.'),
          );
        },
      });
  }

  viewRecord(record: CrushedRisenConsumptionRecord): void {
    this.loadRecordDetail(record, false);
  }

  editRecord(record: CrushedRisenConsumptionRecord): void {
    this.loadRecordDetail(record, true);
  }

  private loadRecordDetail(record: CrushedRisenConsumptionRecord, editing: boolean): void {
    this.detail.set(null);
    this.detailEditing.set(false);
    this.detailLoading.set(true);
    this.consumptionService
      .fetchRecordDetail(record.id)
      .pipe(finalize(() => this.detailLoading.set(false)))
      .subscribe({
        next: (detail) => {
          this.detail.set(detail);
          this.detailEditing.set(editing);
        },
        error: (error: unknown) => {
          void this.alertService.error(
            'Load Failed',
            formatApiErrorMessage(error, 'Failed to load Crushed Risen Consumption details.'),
          );
        },
      });
  }

  updateDetailField(field: 'remark' | 'status', value: string): void {
    this.detail.update((detail) => (detail ? { ...detail, [field]: value } : detail));
  }

  updateDetailLine(
    index: number,
    field: keyof CrushedRisenConsumptionDetailLine,
    value: string | number | null,
  ): void {
    this.detail.update((detail) =>
      detail
        ? {
            ...detail,
            lines: detail.lines.map((line, lineIndex) => {
              if (lineIndex !== index) {
                return line;
              }
              if (field === 'machineId' && typeof value === 'string') {
                const machine = this.findMachineById(value);
                return {
                  ...line,
                  machineId: value,
                  machineName: machine?.itemName ?? '',
                  cavityNumber: machine?.cavityNumber ?? '',
                };
              }
              if (field === 'machineName' && typeof value === 'string') {
                const machine = this.findMachineByName(value);
                return {
                  ...line,
                  machineName: value,
                  machineId: machine?.itemCode ?? '',
                  cavityNumber: machine?.cavityNumber ?? '',
                };
              }
              return { ...line, [field]: value };
            }),
          }
        : detail,
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

  addDetailLine(): void {
    this.detail.update((detail) =>
      detail
        ? {
            ...detail,
            lines: [
              ...detail.lines,
              {
                machineId: '',
                machineName: '',
                moldNumber: '',
                cavityNumber: '',
                employeeShift: '',
                crushedRisenConsumption: null,
              },
            ],
          }
        : detail,
    );
  }

  deleteDetailLine(index: number): void {
    this.detail.update((detail) =>
      detail
        ? { ...detail, lines: detail.lines.filter((_, lineIndex) => lineIndex !== index) }
        : detail,
    );
  }

  cancelDetailEdit(): void {
    const record = this.detail();
    if (record) {
      this.viewRecord(record);
    }
  }

  saveDetailChanges(): void {
    const detail = this.detail();
    if (!detail || this.updating()) {
      return;
    }

    const payload: CrushedRisenConsumptionUpdatePayload = {
      remark: detail.remark.trim(),
      status: detail.status.trim(),
      lines: detail.lines.map((line) => ({
        machineId: line.machineId.trim(),
        machineName: line.machineName.trim(),
        moldNumber: line.moldNumber.trim(),
        cavityNumber: line.cavityNumber.trim(),
        employeeShift: line.employeeShift.trim(),
        crushedRisenConsumption: line.crushedRisenConsumption,
      })),
    };

    this.updating.set(true);
    this.consumptionService
      .updateRecord(detail.id, payload)
      .pipe(finalize(() => this.updating.set(false)))
      .subscribe({
        next: () => {
          this.detail.update((current) =>
            current
              ? { ...current, remark: payload.remark, status: payload.status, lines: payload.lines }
              : current,
          );
          this.records.update((records) =>
            records.map((record) =>
              record.id === detail.id ? { ...record, status: payload.status } : record,
            ),
          );
          this.detailEditing.set(false);
          void this.alertService.success('Updated', 'Crushed Risen Consumption updated successfully.');
        },
        error: (error: unknown) => {
          void this.alertService.error(
            'Update Failed',
            formatApiErrorMessage(error, 'Failed to update Crushed Risen Consumption.'),
          );
        },
      });
  }

  closeDetail(): void {
    if (this.updating()) {
      return;
    }
    this.detail.set(null);
    this.detailEditing.set(false);
  }

  async deleteRecord(record: CrushedRisenConsumptionRecord): Promise<void> {
    if (this.deletingId() !== null) {
      return;
    }

    const result = await this.alertService.confirm(
      'Delete Crushed Risen Consumption?',
      `Delete the record for production document ${record.documentNumberFromProduction}?`,
    );
    if (!result.isConfirmed) {
      return;
    }

    this.deletingId.set(record.id);
    this.consumptionService
      .deleteRecord(record.id)
      .pipe(finalize(() => this.deletingId.set(null)))
      .subscribe({
        next: () => {
          this.records.update((records) => records.filter((item) => item.id !== record.id));
          if (this.detail()?.id === record.id) {
            this.closeDetail();
          }
          void this.alertService.success('Deleted', 'Crushed Risen Consumption record deleted successfully.');
        },
        error: (error: unknown) => {
          void this.alertService.error(
            'Delete Failed',
            formatApiErrorMessage(error, 'Failed to delete Crushed Risen Consumption record.'),
          );
        },
      });
  }

  addRecord(): void {
    void this.router.navigateByUrl('/miscellaneous/crushed-risen-consumption/create');
  }
}
