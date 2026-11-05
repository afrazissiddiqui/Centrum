import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AlertService } from '../../../services/alert.service';
import {
  WorkstationPayload,
  WorkstationRecord,
  WorkstationService,
} from '../../../services/workstation.service';
import { formatApiErrorMessage } from '../../../utils/api-error.util';
import { GL_ACCOUNT_BRANCH_OPTIONS } from '../gl-account-determination/gl-account-branch.options';

type WorkstationFormMode = 'add' | 'edit';

@Component({
  selector: 'app-workstation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workstation.html',
  styleUrl: './workstation.css',
})
export class WorkstationComponent implements OnInit {
  private readonly workstationService = inject(WorkstationService);
  private readonly alertService = inject(AlertService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly workstations = signal<WorkstationRecord[]>([]);
  readonly formMode = signal<WorkstationFormMode>('add');
  readonly editingId = signal<string | number | null>(null);
  readonly formName = signal('');
  readonly formOfficeInTime = signal('');
  readonly formOfficeOutTime = signal('');
  readonly formInGraceMinutes = signal<string | number>('0');
  readonly formOutGraceMinutes = signal<string | number>('0');
  readonly formShift = signal('');
  readonly formDescription = signal('');
  readonly branchOptions = GL_ACCOUNT_BRANCH_OPTIONS;
  readonly formWorkingHours = computed(() =>
    this.calculateWorkingHours(this.formOfficeInTime(), this.formOfficeOutTime()),
  );
  readonly totalWorkstations = computed(() => this.workstations().length);

  ngOnInit(): void {
    this.loadWorkstations();
  }

  loadWorkstations(): void {
    this.loading.set(true);
    this.workstationService
      .fetchWorkstations()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (records) => {
          this.workstations.set(records);
          if (this.formMode() !== 'edit') {
            this.resetForm();
          }
        },
        error: (error: unknown) => {
          this.workstations.set([]);
          this.resetForm();
          void this.alertService.error(
            'Load Failed',
            formatApiErrorMessage(error, 'Failed to load workstation setup.'),
          );
        },
      });
  }

  formTitle(): string {
    return this.formMode() === 'edit' ? 'Update Workstation' : 'Add Workstation';
  }

  submitWorkstation(): void {
    if (this.saving()) {
      return;
    }

    const validationMessage = this.validateForm();
    if (validationMessage) {
      this.alertService.validation(validationMessage);
      return;
    }

    const payload = this.buildPayload();
    this.saving.set(true);
    const request =
      this.formMode() === 'edit'
        ? this.workstationService.updateWorkstation(payload)
        : this.workstationService.addWorkstation(payload);

    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.alertService.success(
          'Saved',
          this.formMode() === 'edit'
            ? 'Workstation timing updated successfully.'
            : 'Workstation timing added successfully.',
        );
        this.loadWorkstations();
        this.resetForm();
      },
      error: (error: unknown) => {
        void this.alertService.error(
          'Save Failed',
          formatApiErrorMessage(
            error,
            `Failed to ${this.formMode() === 'edit' ? 'update' : 'add'} workstation timing.`,
          ),
        );
      },
    });
  }

  startEdit(record: WorkstationRecord): void {
    const id = this.resolveId(record);
    if (id === null) {
      this.alertService.warning('Edit', 'Unable to edit this row: missing workstation id.');
      return;
    }

    this.loading.set(true);
    this.workstationService
      .fetchWorkstationDetail(id)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (detail) => {
          this.formMode.set('edit');
          this.editingId.set(id);
          this.formName.set(detail.name || this.valueToText(record.name));
          this.formOfficeInTime.set(this.normalizeTimeInput(detail.officeInTime ?? record.officeInTime));
          this.formOfficeOutTime.set(this.normalizeTimeInput(detail.officeOutTime ?? record.officeOutTime));
          this.formInGraceMinutes.set(this.valueToText(detail.inGraceMinutes ?? record.inGraceMinutes ?? '0'));
          this.formOutGraceMinutes.set(this.valueToText(detail.outGraceMinutes ?? record.outGraceMinutes ?? '0'));
          this.formShift.set(detail.shift || this.valueToText(record.shift));
          this.formDescription.set(detail.description || this.valueToText(record.description));
        },
        error: (error: unknown) => {
          void this.alertService.error(
            'Load Failed',
            formatApiErrorMessage(error, 'Failed to load workstation detail.'),
          );
        },
      });
  }

  cancelEdit(): void {
    this.resetForm();
  }

  async deleteWorkstation(record: WorkstationRecord): Promise<void> {
    if (this.deleting() || this.saving()) {
      return;
    }

    const id = this.resolveId(record);
    if (id === null) {
      this.alertService.warning('Delete', 'Unable to delete this row: missing workstation id.');
      return;
    }

    const label = this.valueToText(record.name) || this.valueToText(record.code) || `ID ${id}`;
    const result = await this.alertService.confirm('Delete workstation?', `Remove ${label} from the list?`);
    if (!result.isConfirmed) {
      return;
    }

    this.deleting.set(true);
    this.workstationService
      .deleteWorkstation(id)
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        next: () => {
          this.alertService.success('Deleted', 'Workstation removed successfully.');
          if (this.editingId() === id) {
            this.resetForm();
          }
          this.loadWorkstations();
        },
        error: (error: unknown) => {
          void this.alertService.error(
            'Delete Failed',
            formatApiErrorMessage(error, 'Failed to delete workstation.'),
          );
        },
      });
  }

  cellValue(
    record: WorkstationRecord,
    field: 'name' | 'officeInTime' | 'officeOutTime' | 'inGraceMinutes' | 'outGraceMinutes' | 'shift' | 'description' | 'status',
  ): string {
    const value = record[field];
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    if (field === 'status') {
      return String(value) === '1' ? 'Active' : String(value) === '3' ? 'Inactive' : String(value);
    }
    if (field === 'officeInTime' || field === 'officeOutTime') {
      return this.formatDisplayTime(String(value));
    }
    if (field === 'inGraceMinutes' || field === 'outGraceMinutes') {
      return `${value} min`;
    }
    return String(value);
  }

  calculateWorkingHours(officeInTime: string, officeOutTime: string): string {
    const startMinutes = this.timeToMinutes(officeInTime);
    const endMinutes = this.timeToMinutes(officeOutTime);
    if (startMinutes === null || endMinutes === null) {
      return '\u2014';
    }

    const durationMinutes = (endMinutes - startMinutes + 24 * 60) % (24 * 60);
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }

  private validateForm(): string | null {
    if (!this.formName().trim()) {
      return 'Workstation name is required.';
    }
    if (!this.formOfficeInTime().trim()) {
      return 'Office in time is required.';
    }
    if (!this.formOfficeOutTime().trim()) {
      return 'Office out time is required.';
    }
    if (!this.isValidMinutes(this.formInGraceMinutes())) {
      return 'In grace time must be 0 or greater.';
    }
    if (!this.isValidMinutes(this.formOutGraceMinutes())) {
      return 'Out grace time must be 0 or greater.';
    }
    return null;
  }

  private buildPayload(): WorkstationPayload {
    const name = this.formName().trim();
    const payload: WorkstationPayload = {
      name,
      office_in_time: this.formOfficeInTime().trim(),
      office_out_time: this.formOfficeOutTime().trim(),
      in_grace_minutes: Number.parseInt(this.valueToText(this.formInGraceMinutes()).trim(), 10) || 0,
      out_grace_minutes: Number.parseInt(this.valueToText(this.formOutGraceMinutes()).trim(), 10) || 0,
      description: this.formDescription().trim(),
      shift: this.formShift().trim(),
      status: 'Active',
    };

    if (this.formMode() === 'edit' && this.editingId() !== null) {
      const editId = this.editingId() as string | number;
      payload.id = editId;
      payload.Id = editId;
      payload.workstation_id = editId;
      payload.code = name;
    }

    return payload;
  }

  private resolveId(record: WorkstationRecord): string | number | null {
    const value = record.id;
    if (value === null || value === undefined || String(value).trim() === '') {
      return null;
    }
    return typeof value === 'number' ? value : String(value).trim();
  }

  private resetForm(): void {
    this.formMode.set('add');
    this.editingId.set(null);
    this.formName.set('');
    this.formOfficeInTime.set('');
    this.formOfficeOutTime.set('');
    this.formInGraceMinutes.set('0');
    this.formOutGraceMinutes.set('0');
    this.formShift.set('');
    this.formDescription.set('');
  }

  private valueToText(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  private isValidMinutes(value: unknown): boolean {
    const trimmed = this.valueToText(value).trim();
    if (!trimmed) {
      return true;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed >= 0;
  }

  private normalizeTimeInput(value: unknown): string {
    const text = this.valueToText(value).trim();
    const match = text.match(/^(\d{1,2}):(\d{2})/);
    if (!match) {
      return text;
    }
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }

  private timeToMinutes(value: string): number | null {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      return null;
    }

    return hours * 60 + minutes;
  }

  private formatDisplayTime(value: string): string {
    const normalized = this.normalizeTimeInput(value);
    if (!normalized) {
      return '—';
    }
    return normalized;
  }
}
