import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  GatePassItemMaster,
  GatePassItemMasterService,
} from '../../../../gate-pass/gate-pass-item-master.service';
import { GatePassItemSearchInputComponent } from '../../../../gate-pass/item-search-input/item-search-input';
import { AlertService } from '../../../../../services/alert.service';
import {
  ApplicationFormRecord,
  ApplicationFormService,
} from '../../../../../services/application-form.service';
import { formatApiErrorMessage } from '../../../../../utils/api-error.util';
import { MachineSearchOption } from '../../plant-maintenance-machine.model';
import { PlantMaintenanceMachineItemService } from '../../plant-maintenance-machine-item.service';
import {
  MaintenanceActivityDefinitionService,
  MaintenanceActivityMachineRecord,
} from '../../maintenance-activity-definition/maintenance-activity-definition.service';
import {
  filterPlantMaintenanceViewableComponents,
  PlantMaintenanceMasterComponent,
  PlantMaintenanceMasterFormService,
  PlantMaintenanceMasterInspectionLine,
  PlantMaintenanceMasterRecord,
  PlantMaintenanceMasterReplacementLine,
  PlantMaintenanceMasterSparePartLine,
} from '../plant-maintenance-master-form.service';

type InspectionLineField = keyof PlantMaintenanceMasterInspectionLine;

function createEmptyReplacementLine(): PlantMaintenanceMasterReplacementLine {
  return {
    itemCode: '',
    itemName: '',
    quantity: 1,
  };
}

function createEmptyInspectionLine(): PlantMaintenanceMasterInspectionLine {
  return {
    itemsToBeInspected: '',
    whatToCheck: '',
    replacement: 'No',
    replacementItems: [],
    instructions: '',
    status: '',
    employee: '',
    recommendation: '',
    attachments: [],
  };
}

function createEmptyComponent(): PlantMaintenanceMasterComponent {
  return {
    name: '',
    inspectionLines: [createEmptyInspectionLine()],
  };
}

function formatDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateValue(value: string): Date | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDaysToDate(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function inclusiveDurationDays(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / 86_400_000) + 1;
}

function todayDateValue(): string {
  return formatDateValue(new Date());
}

@Component({
  selector: 'app-add-plant-maintenance-master-form',
  standalone: true,
  imports: [CommonModule, FormsModule, GatePassItemSearchInputComponent],
  templateUrl: './add-plant-maintenance-master-form.html',
  styleUrls: [
    '../../../../HR-Portal/payroll-master/tax-computation/tax-computation.css',
    '../../../../HR-Portal/Application-Form/create-job-requisition/create-job-requisition.css',
    './plant-maintenance-master-form-add.css',
  ],
})
export class AddPlantMaintenanceMasterFormComponent implements OnInit {
  private readonly masterService = inject(PlantMaintenanceMasterFormService);
  private readonly activityService = inject(MaintenanceActivityDefinitionService);
  private readonly machineItemService = inject(PlantMaintenanceMachineItemService);
  private readonly itemMasterService = inject(GatePassItemMasterService);
  private readonly alertService = inject(AlertService);
  private readonly applicationFormService = inject(ApplicationFormService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly editingRecordId = signal<string | null>(null);
  readonly isCreateMode = computed(() => !this.editingRecordId());
  readonly pageTitle = computed(() =>
    this.editingRecordId() ? 'Update Machine' : 'Add Machine',
  );

  readonly machineId = signal('');
  readonly machineName = signal('');
  readonly machineType = signal('');
  readonly location = signal('');
  readonly maintenanceNature = signal('');
  readonly plantMaintenanceFrequency = signal('');
  readonly plantMaintenanceType = signal('');
  readonly startDate = signal('');
  readonly endDate = signal('');
  readonly durationDays = signal<number | null>(null);
  readonly spareParts = signal<PlantMaintenanceMasterSparePartLine[]>([]);
  readonly isSaving = signal(false);
  readonly components = signal<PlantMaintenanceMasterComponent[]>([]);
  readonly availableActivityRecords = signal<MaintenanceActivityMachineRecord[]>([]);
  readonly hasLoadedActivityData = signal(false);
  readonly hasActivityDefinitionsForMachine = computed(
    () => this.availableActivityRecords().length > 0,
  );
  readonly idSuggestionsOpen = signal(false);
  readonly nameSuggestionsOpen = signal(false);
  readonly employeeRecords = signal<ApplicationFormRecord[]>([]);
  readonly employeeSuggestionsOpen = signal<string | null>(null);

  readonly machineTypeSelectOptions = computed(() =>
    this.getProfileSelectOptions('machineType', []),
  );

  readonly maintenanceNatureSelectOptions = computed(() =>
    this.getProfileSelectOptions('maintenanceNature', this.maintenanceNatureOptions),
  );

  readonly plantMaintenanceFrequencySelectOptions = computed(() =>
    this.getProfileSelectOptions('plantMaintenanceFrequency', this.plantMaintenanceFrequencyOptions),
  );

  readonly plantMaintenanceTypeSelectOptions = computed(() =>
    this.getProfileSelectOptions('plantMaintenanceType', this.plantMaintenanceTypeOptions),
  );

  readonly locationOptions = ['AHCP_Peshawar', 'AHCP_HO', 'AHCP_Faisalabad'] as const;
  readonly maintenanceNatureOptions = ['Electrical', 'Mechanical'] as const;
  readonly plantMaintenanceFrequencyOptions = [
    'Daily',
    'Weekly',
    'Fortnightly',
    'Monthly',
    'Quarterly',
    'Semi-annually',
    'Anually',
  ] as const;
  readonly plantMaintenanceTypeOptions = [
    'Preventive',
    'Corrective',
    'Breakdown',
    'Pre-Cautionary',
  ] as const;
  readonly lineStatusOptions = ['Pass', 'Fail', 'N/A'] as const;
  readonly replacementOptions = ['Yes', 'No'] as const;

  readonly idSuggestions = computed(() => {
    this.machineItemService.records();
    return this.machineItemService.searchByMachineId(this.machineId());
  });
  readonly nameSuggestions = computed(() => {
    this.machineItemService.records();
    return this.machineItemService.searchByMachineName(this.machineName());
  });

  private syncingScheduleFields = false;

  ngOnInit(): void {
    this.machineItemService.ensureLoaded().subscribe({ error: () => {} });
    this.activityService.fetchMaintenanceActivityDefinitions().subscribe({ error: () => {} });
    this.masterService.fetchPlantMaintenanceMasterForms().subscribe({ error: () => {} });
    this.itemMasterService.ensureLoaded().subscribe({ error: () => {} });
    this.applicationFormService.fetchEmployeeProfiles().subscribe({
      next: (records) => this.employeeRecords.set(records),
      error: () => {},
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      return;
    }

    this.editingRecordId.set(id);

    const cached = this.masterService.getById(id);
    if (cached) {
      this.populateFromRecord(cached);
    }

    this.masterService.fetchPlantMaintenanceMasterFormDetail(id).subscribe({
      next: (record) => this.populateFromRecord(record),
      error: (error: unknown) => {
        void this.alertService.error(
          'Load Failed',
          formatApiErrorMessage(error, 'Failed to load plant maintenance master form for edit.'),
        );
        if (!cached) {
          void this.router.navigate(['/plant-maintenance/main-form/plant-maintenance-master-form']);
        }
      },
    });
  }

  hasLoadedComponents(): boolean {
    return this.components().some((c) => c.name.trim());
  }

  getComponentHeaderStatusClass(component: PlantMaintenanceMasterComponent): string {
    const status = this.resolveComponentHeaderStatus(component);
    return status ? `mad-component-card__header--${status}` : '';
  }

  getLineStatusSelectClass(status: string): string {
    switch (status.trim()) {
      case 'Pass':
        return 'mad-select--status-pass';
      case 'Fail':
        return 'mad-select--status-fail';
      case 'N/A':
        return 'mad-select--status-na';
      default:
        return 'mad-select--status-empty';
    }
  }

  back(): void {
    void this.router.navigate(['/plant-maintenance/main-form/plant-maintenance-master-form']);
  }

  onMachineIdInput(value: string): void {
    if (this.machineId() !== value) {
      this.clearActivityProfileFields();
    }
    this.machineId.set(value);
    this.idSuggestionsOpen.set(value.trim().length > 0);
    this.closeNameSuggestions();
  }

  onMachineNameInput(value: string): void {
    if (this.machineName() !== value) {
      this.clearActivityProfileFields();
    }
    this.machineName.set(value);
    this.nameSuggestionsOpen.set(value.trim().length > 0);
    this.closeIdSuggestions();
  }

  onMachineTypeInput(value: string): void {
    this.machineType.set(value);
    this.tryApplyMatchingActivityDefinition();
  }

  onMaintenanceNatureInput(value: string): void {
    this.maintenanceNature.set(value);
    this.tryApplyMatchingActivityDefinition();
  }

  onPlantMaintenanceFrequencyInput(value: string): void {
    this.plantMaintenanceFrequency.set(value);
    this.tryApplyMatchingActivityDefinition();
  }

  onPlantMaintenanceTypeInput(value: string): void {
    this.plantMaintenanceType.set(value);
    this.tryApplyMatchingActivityDefinition();
  }

  onStartDateInput(value: string): void {
    this.startDate.set(value);
    this.syncScheduleFromStartDate();
  }

  onEndDateInput(value: string): void {
    this.endDate.set(value);
    this.syncScheduleFromEndDate();
  }

  onDurationInput(value: number | string | null): void {
    if (value === null || value === '') {
      this.durationDays.set(null);
      return;
    }

    const days = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (!Number.isFinite(days) || days < 1) {
      return;
    }

    this.syncScheduleFromDuration(days);
  }

  updateComponentName(componentIndex: number, value: string): void {
    if (this.hasLoadedActivityData()) {
      return;
    }
    this.components.update((list) => {
      const next = [...list];
      next[componentIndex] = { ...next[componentIndex], name: value };
      return next;
    });
  }

  updateInspectionLine(
    componentIndex: number,
    lineIndex: number,
    field: InspectionLineField,
    value: string,
  ): void {
    if (
      field !== 'status' &&
      field !== 'recommendation' &&
      field !== 'replacement' &&
      field !== 'employee' &&
      this.hasLoadedActivityData()
    ) {
      return;
    }
    this.components.update((list) =>
      list.map((component, ci) => {
        if (ci !== componentIndex) {
          return component;
        }
        const inspectionLines = component.inspectionLines.map((line, li) =>
          li === lineIndex ? { ...line, [field]: value } : line,
        );
        return { ...component, inspectionLines };
      }),
    );
  }

  getEmployeeSuggestions(query: string): ApplicationFormRecord[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return this.employeeRecords()
      .filter(
        (employee) =>
          employee.EmployeeCode?.toLowerCase().includes(normalizedQuery) ||
          employee.EmployeeName?.toLowerCase().includes(normalizedQuery),
      )
      .slice(0, 10);
  }

  onEmployeeInput(componentIndex: number, lineIndex: number, value: string): void {
    this.updateInspectionLine(componentIndex, lineIndex, 'employee', value);
    this.employeeSuggestionsOpen.set(`${componentIndex}-${lineIndex}`);
  }

  openEmployeeSuggestions(componentIndex: number, lineIndex: number, value: string): void {
    if (value.trim()) {
      this.employeeSuggestionsOpen.set(`${componentIndex}-${lineIndex}`);
    }
  }

  closeEmployeeSuggestions(componentIndex: number, lineIndex: number): void {
    setTimeout(() => {
      if (this.employeeSuggestionsOpen() === `${componentIndex}-${lineIndex}`) {
        this.employeeSuggestionsOpen.set(null);
      }
    }, 150);
  }

  selectEmployee(componentIndex: number, lineIndex: number, employee: ApplicationFormRecord): void {
    const displayValue = employee.EmployeeName.trim() || employee.EmployeeCode.trim();
    this.updateInspectionLine(componentIndex, lineIndex, 'employee', displayValue);
    this.employeeSuggestionsOpen.set(null);
  }

  onReplacementChange(componentIndex: number, lineIndex: number, value: string): void {
    this.components.update((list) =>
      list.map((component, ci) => {
        if (ci !== componentIndex) {
          return component;
        }
        const inspectionLines = component.inspectionLines.map((line, li) => {
          if (li !== lineIndex) {
            return line;
          }
          if (value === 'Yes') {
            return {
              ...line,
              replacement: value,
              replacementItems: line.replacementItems.length
                ? line.replacementItems
                : [createEmptyReplacementLine()],
            };
          }
          return {
            ...line,
            replacement: value,
            replacementItems: [],
          };
        });
        return { ...component, inspectionLines };
      }),
    );
  }

  addReplacementRow(componentIndex: number, lineIndex: number): void {
    this.components.update((list) =>
      list.map((component, ci) => {
        if (ci !== componentIndex) {
          return component;
        }
        const inspectionLines = component.inspectionLines.map((line, li) =>
          li === lineIndex
            ? {
                ...line,
                replacementItems: [...line.replacementItems, createEmptyReplacementLine()],
              }
            : line,
        );
        return { ...component, inspectionLines };
      }),
    );
  }

  removeReplacementRow(
    componentIndex: number,
    lineIndex: number,
    replacementRowIndex: number,
  ): void {
    this.components.update((list) =>
      list.map((component, ci) => {
        if (ci !== componentIndex) {
          return component;
        }
        const inspectionLines = component.inspectionLines.map((line, li) => {
          if (li !== lineIndex) {
            return line;
          }
          const replacementItems =
            line.replacementItems.length > 1
              ? line.replacementItems.filter((_, ri) => ri !== replacementRowIndex)
              : [createEmptyReplacementLine()];
          return { ...line, replacementItems };
        });
        return { ...component, inspectionLines };
      }),
    );
  }

  updateReplacementRow(
    componentIndex: number,
    lineIndex: number,
    replacementRowIndex: number,
    field: keyof PlantMaintenanceMasterReplacementLine,
    value: string | number | null,
  ): void {
    this.components.update((list) =>
      list.map((component, ci) => {
        if (ci !== componentIndex) {
          return component;
        }
        const inspectionLines = component.inspectionLines.map((line, li) => {
          if (li !== lineIndex) {
            return line;
          }
          const replacementItems = line.replacementItems.map((row, ri) => {
            if (ri !== replacementRowIndex) {
              return row;
            }
            if (field === 'quantity') {
              if (value === null || value === '') {
                return { ...row, quantity: null };
              }
              const quantity =
                typeof value === 'number' ? value : Number.parseFloat(String(value));
              if (!Number.isFinite(quantity) || quantity < 0) {
                return row;
              }
              return { ...row, quantity };
            }
            return { ...row, [field]: String(value) };
          });
          return { ...line, replacementItems };
        });
        return { ...component, inspectionLines };
      }),
    );
  }

  applyReplacementItemMaster(
    componentIndex: number,
    lineIndex: number,
    replacementRowIndex: number,
    item: GatePassItemMaster,
  ): void {
    this.components.update((list) =>
      list.map((component, ci) => {
        if (ci !== componentIndex) {
          return component;
        }
        const inspectionLines = component.inspectionLines.map((line, li) => {
          if (li !== lineIndex) {
            return line;
          }
          const replacementItems = line.replacementItems.map((row, ri) =>
            ri === replacementRowIndex
              ? { ...row, itemCode: item.itemCode, itemName: item.itemName }
              : row,
          );
          return { ...line, replacementItems };
        });
        return { ...component, inspectionLines };
      }),
    );
  }

  addInspectionLine(componentIndex: number): void {
    if (this.hasLoadedActivityData()) {
      return;
    }
    this.components.update((list) =>
      list.map((component, i) =>
        i === componentIndex
          ? {
              ...component,
              inspectionLines: [...component.inspectionLines, createEmptyInspectionLine()],
            }
          : component,
      ),
    );
  }

  removeInspectionLine(componentIndex: number, lineIndex: number): void {
    if (this.hasLoadedActivityData()) {
      return;
    }
    this.components.update((list) =>
      list.map((component, i) => {
        if (i !== componentIndex) {
          return component;
        }
        const inspectionLines =
          component.inspectionLines.length > 1
            ? component.inspectionLines.filter((_, li) => li !== lineIndex)
            : [createEmptyInspectionLine()];
        return { ...component, inspectionLines };
      }),
    );
  }

  addComponent(): void {
    if (this.hasLoadedActivityData()) {
      return;
    }
    this.components.update((list) => [...list, createEmptyComponent()]);
  }

  removeComponent(componentIndex: number): void {
    if (this.hasLoadedActivityData()) {
      return;
    }
    this.components.update((list) =>
      list.length > 1 ? list.filter((_, i) => i !== componentIndex) : [createEmptyComponent()],
    );
  }

  trackByIndex(index: number): number {
    return index;
  }

  onLineAttachmentChange(componentIndex: number, lineIndex: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.alertService.validation('Please upload an image file.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        return;
      }

      this.components.update((list) =>
        list.map((component, ci) => {
          if (ci !== componentIndex) {
            return component;
          }
          const inspectionLines = component.inspectionLines.map((line, li) =>
            li === lineIndex
              ? {
                  ...line,
                  attachments: [
                    ...line.attachments,
                    { fileName: file.name, dataUrl },
                  ],
                }
              : line,
          );
          return { ...component, inspectionLines };
        }),
      );
      input.value = '';
    };
    reader.readAsDataURL(file);
  }

  removeLineAttachment(
    componentIndex: number,
    lineIndex: number,
    attachmentIndex: number,
  ): void {
    this.components.update((list) =>
      list.map((component, ci) => {
        if (ci !== componentIndex) {
          return component;
        }
        const inspectionLines = component.inspectionLines.map((line, li) =>
          li === lineIndex
            ? {
                ...line,
                attachments: line.attachments.filter((_, ai) => ai !== attachmentIndex),
              }
            : line,
        );
        return { ...component, inspectionLines };
      }),
    );
  }

  openIdSuggestions(): void {
    if (this.machineId().trim()) {
      this.idSuggestionsOpen.set(true);
      this.closeNameSuggestions();
    }
  }

  openNameSuggestions(): void {
    if (this.machineName().trim()) {
      this.nameSuggestionsOpen.set(true);
      this.closeIdSuggestions();
    }
  }

  closeIdSuggestions(): void {
    this.idSuggestionsOpen.set(false);
  }

  closeNameSuggestions(): void {
    this.nameSuggestionsOpen.set(false);
  }

  onIdInputBlur(): void {
    setTimeout(() => this.closeIdSuggestions(), 150);
  }

  onNameInputBlur(): void {
    setTimeout(() => this.closeNameSuggestions(), 150);
  }

  selectMachineFromSuggestion(machine: MachineSearchOption): void {
    this.closeIdSuggestions();
    this.closeNameSuggestions();
    this.populateFromMachine(machine);
  }

  resetForm(): void {
    if (this.editingRecordId()) {
      const record = this.masterService.getById(this.editingRecordId()!);
      if (record) {
        this.populateFromRecord(record);
        this.hasLoadedActivityData.set(false);
      }
      return;
    }
    this.hasLoadedActivityData.set(false);
    this.machineId.set('');
    this.machineName.set('');
    this.machineType.set('');
    this.location.set('');
    this.maintenanceNature.set('');
    this.plantMaintenanceFrequency.set('');
    this.plantMaintenanceType.set('');
    this.startDate.set('');
    this.endDate.set('');
    this.durationDays.set(null);
    this.spareParts.set([]);
    this.components.set([]);
    this.availableActivityRecords.set([]);
    this.closeIdSuggestions();
    this.closeNameSuggestions();
  }

  async saveForm(): Promise<void> {
    if (this.isSaving()) {
      return;
    }

    const machineId = this.machineId().trim();
    const machineName = this.machineName().trim();
    const machineType = this.machineType().trim();
    const location = this.location().trim();
    const maintenanceNature = this.maintenanceNature().trim();
    const plantMaintenanceFrequency = this.plantMaintenanceFrequency().trim();
    const plantMaintenanceType = this.plantMaintenanceType().trim();

    const components = filterPlantMaintenanceViewableComponents(
      this.components().map((component) => ({
        name: component.name.trim(),
        inspectionLines: component.inspectionLines.map((line) => ({
          itemsToBeInspected: line.itemsToBeInspected.trim(),
          whatToCheck: line.whatToCheck.trim(),
          replacement: line.replacement.trim() || 'No',
          replacementItems:
            line.replacement.trim() === 'Yes'
              ? line.replacementItems
                  .map((item) => ({
                    itemCode: item.itemCode.trim(),
                    itemName: item.itemName.trim(),
                    quantity: item.quantity,
                  }))
                  .filter(
                    (item) =>
                      item.itemCode || item.itemName || item.quantity !== null,
                  )
              : [],
          instructions: line.instructions.trim(),
          status: line.status.trim(),
          employee: line.employee.trim(),
          recommendation: line.recommendation.trim(),
          attachments: line.attachments.map((attachment) => ({
            fileName: attachment.fileName.trim(),
            dataUrl: attachment.dataUrl,
          })),
        })),
      })),
    );

    if (!machineId || !machineName || !machineType) {
      this.alertService.validation(
        'Machine ID, Machine Name, and Machine Type are required.',
      );
      return;
    }

    if (!location) {
      this.alertService.validation('Select a Location.');
      return;
    }

    if (!maintenanceNature || !plantMaintenanceFrequency || !plantMaintenanceType) {
      this.alertService.validation(
        'Select Maintenance Nature, Plant Maintenance Frequency, and Plant Maintenance Type.',
      );
      return;
    }

    if (components.length === 0) {
      const message = this.isCreateMode()
        ? 'No matching Maintenance Activity Defination found. Select Machine Type, Maintenance Nature, Plant Maintenance Frequency, and Plant Maintenance Type that match an existing activity definition.'
        : 'Enter at least one component for this machine.';
      this.alertService.validation(message);
      return;
    }

    const incompleteInspection = components.some(
      (component) =>
        component.inspectionLines.length === 0 ||
        component.inspectionLines.some(
          (line) => !line.itemsToBeInspected || !line.whatToCheck || !line.instructions,
        ),
    );
    if (incompleteInspection) {
      this.alertService.validation(
        'Each inspection line must have Items to be inspected, What to check, and Instructions.',
      );
      return;
    }

    const missingLineStatus = components.some((component) =>
      component.inspectionLines.some((line) => !line.status),
    );
    if (missingLineStatus) {
      this.alertService.validation('Select Status for each line.');
      return;
    }

    const invalidReplacementDetails = components.some((component) =>
      component.inspectionLines.some((line) => {
        if (line.replacement !== 'Yes') {
          return false;
        }
        if (line.replacementItems.length === 0) {
          return true;
        }
        return line.replacementItems.some(
          (item) =>
            !item.itemCode ||
            !item.itemName ||
            item.quantity === null ||
            item.quantity <= 0,
        );
      }),
    );
    if (invalidReplacementDetails) {
      this.alertService.validation(
        'When Replacement is Yes, add at least one row with Item Code, Item Name, and Quantity.',
      );
      return;
    }

    const excludeId = this.editingRecordId() ?? undefined;
    const spareParts = this.isCreateMode() ? [] : this.spareParts();

    const payload = {
      machineId,
      machineName,
      machineType,
      location,
      maintenanceNature,
      plantMaintenanceFrequency,
      plantMaintenanceType,
      startDate: this.startDate().trim(),
      endDate: this.endDate().trim(),
      duration: this.durationDays(),
      spareParts,
      remarks: '',
      components,
    };

    if (this.masterService.hasDuplicateProfile(payload, excludeId)) {
      this.alertService.validation(
        'A master form entry with this machine and maintenance profile already exists.',
      );
      return;
    }

    const apiPayload = {
      machineId,
      machineName,
      machineType,
      location,
      maintenanceNature,
      plantMaintenanceFrequency,
      plantMaintenanceType,
      startDate: payload.startDate,
      endDate: payload.endDate,
      duration: payload.duration,
      spareParts,
      components,
    };

    this.isSaving.set(true);

    try {
      if (this.editingRecordId()) {
        await firstValueFrom(
          this.masterService.updatePlantMaintenanceMasterForm(this.editingRecordId()!, apiPayload),
        );
        await this.alertService.successAndWait(
          'Success',
          'Plant Maintenance Master Form updated successfully.',
        );
      } else {
        await firstValueFrom(this.masterService.addPlantMaintenanceMasterForm(apiPayload));
        await this.alertService.successAndWait(
          'Success',
          'Plant Maintenance Master Form saved successfully.',
        );
      }

      void this.router.navigate(['/plant-maintenance/main-form/plant-maintenance-master-form']);
    } catch (error) {
      void this.alertService.error(
        this.editingRecordId() ? 'Update Failed' : 'Save Failed',
        formatApiErrorMessage(
          error,
          this.editingRecordId()
            ? 'Failed to update plant maintenance master form.'
            : 'Failed to save plant maintenance master form.',
        ),
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  private syncScheduleFromDuration(days: number): void {
    if (this.syncingScheduleFields) {
      return;
    }

    this.syncingScheduleFields = true;
    try {
      const start = parseDateValue(todayDateValue());
      if (!start) {
        return;
      }

      const end = addDaysToDate(start, days - 1);
      this.durationDays.set(days);
      this.startDate.set(formatDateValue(start));
      this.endDate.set(formatDateValue(end));
    } finally {
      this.syncingScheduleFields = false;
    }
  }

  private syncScheduleFromStartDate(): void {
    if (this.syncingScheduleFields) {
      return;
    }

    const start = parseDateValue(this.startDate());
    if (!start) {
      return;
    }

    this.syncingScheduleFields = true;
    try {
      const end = parseDateValue(this.endDate());
      const duration = this.durationDays();

      if (end && end >= start) {
        this.durationDays.set(inclusiveDurationDays(start, end));
        return;
      }

      if (duration && duration > 0) {
        this.endDate.set(formatDateValue(addDaysToDate(start, duration - 1)));
      }
    } finally {
      this.syncingScheduleFields = false;
    }
  }

  private syncScheduleFromEndDate(): void {
    if (this.syncingScheduleFields) {
      return;
    }

    const start = parseDateValue(this.startDate());
    const end = parseDateValue(this.endDate());
    if (!start || !end) {
      return;
    }

    this.syncingScheduleFields = true;
    try {
      if (end >= start) {
        this.durationDays.set(inclusiveDurationDays(start, end));
      } else {
        this.durationDays.set(null);
      }
    } finally {
      this.syncingScheduleFields = false;
    }
  }

  private normalizeLocation(value?: string): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed || trimmed === '—') {
      return '';
    }
    return ['AHCP_Peshawar', 'AHCP_HO', 'AHCP_Faisalabad'].includes(trimmed) ? trimmed : '';
  }

  private resolveComponentHeaderStatus(
    component: PlantMaintenanceMasterComponent,
  ): 'pass' | 'fail' | 'na' | '' {
    const statuses = component.inspectionLines
      .map((line) => line.status.trim())
      .filter(Boolean);

    if (!statuses.length) {
      return '';
    }

    if (statuses.some((status) => status === 'Fail')) {
      return 'fail';
    }

    if (statuses.some((status) => status === 'N/A')) {
      return 'na';
    }

    if (statuses.every((status) => status === 'Pass')) {
      return 'pass';
    }

    return '';
  }

  private populateFromRecord(record: PlantMaintenanceMasterRecord): void {
    this.machineId.set(record.machineId === '—' ? '' : record.machineId);
    this.machineName.set(record.machineName === '—' ? '' : record.machineName);
    this.machineType.set(record.machineType === '—' ? '' : record.machineType);
    this.location.set(this.normalizeLocation(record.location));
    this.maintenanceNature.set(record.maintenanceNature === '—' ? '' : record.maintenanceNature);
    this.plantMaintenanceFrequency.set(
      record.plantMaintenanceFrequency === '—' ? '' : record.plantMaintenanceFrequency,
    );
    this.plantMaintenanceType.set(
      record.plantMaintenanceType === '—' ? '' : record.plantMaintenanceType,
    );
    this.startDate.set(record.startDate ?? '');
    this.endDate.set(record.endDate ?? '');
    this.durationDays.set(record.duration ?? null);
    this.spareParts.set(this.cloneSpareParts(record));
    this.components.set(this.cloneComponents(record));
  }

  private cloneSpareParts(record: PlantMaintenanceMasterRecord): PlantMaintenanceMasterSparePartLine[] {
    if (record.spareParts?.length) {
      return record.spareParts.map((row) => ({
        sparePartId: row.sparePartId ?? '',
        sparePartDescription: row.sparePartDescription ?? '',
        quantity: row.quantity ?? null,
        warehouseCode: row.warehouseCode ?? '',
        uomCode: row.uomCode ?? '',
      }));
    }
    return [];
  }

  private populateFromMachine(machine: MachineSearchOption): void {
    this.machineId.set(machine.machineId);
    this.machineName.set(machine.machineName);
    this.machineType.set(machine.defaultMachineType);
    this.location.set('');
    this.loadActivityProfilesForMachine(machine.machineId, machine.machineName);
  }

  private loadActivityProfilesForMachine(machineId: string, machineName: string): void {
    this.clearActivityProfileFields();

    const records = this.activityService.getAllByMachineId(machineId, machineName);
    this.availableActivityRecords.set(records);
  }

  private tryApplyMatchingActivityDefinition(): void {
    if (!this.isCreateMode() || !this.machineId().trim()) {
      return;
    }

    const machineType = this.machineType().trim();
    const maintenanceNature = this.maintenanceNature().trim();
    const plantMaintenanceFrequency = this.plantMaintenanceFrequency().trim();
    const plantMaintenanceType = this.plantMaintenanceType().trim();

    if (!machineType || !maintenanceNature || !plantMaintenanceFrequency || !plantMaintenanceType) {
      this.clearLoadedComponents();
      return;
    }

    const activityRecord = this.activityService.findByCriteria({
      machineId: this.machineId(),
      machineName: this.machineName(),
      machineType,
      maintenanceNature,
      plantMaintenanceFrequency,
      plantMaintenanceType,
    });

    if (!activityRecord) {
      this.clearLoadedComponents();
      return;
    }

    this.applyActivityProfile(activityRecord);
  }

  private applyActivityProfile(activityRecord: MaintenanceActivityMachineRecord): void {
    this.hasLoadedActivityData.set(true);
    this.components.set(this.cloneComponentsFromActivity(activityRecord));
  }

  private clearLoadedComponents(): void {
    this.hasLoadedActivityData.set(false);
    this.components.set([]);
  }

  private clearActivityProfileFields(): void {
    this.hasLoadedActivityData.set(false);
    this.availableActivityRecords.set([]);
    this.machineType.set('');
    this.maintenanceNature.set('');
    this.plantMaintenanceFrequency.set('');
    this.plantMaintenanceType.set('');
    this.components.set([]);
  }

  private getProfileSelectOptions<T extends string>(
    field: 'machineType' | 'maintenanceNature' | 'plantMaintenanceFrequency' | 'plantMaintenanceType',
    fallback: readonly T[],
  ): T[] {
    if (!this.isCreateMode() || this.availableActivityRecords().length === 0) {
      return [...fallback];
    }

    return this.activityService.getProfileFieldValues(
      this.availableActivityRecords(),
      field,
      {},
    ) as T[];
  }

  private cloneComponentsFromActivity(
    record: MaintenanceActivityMachineRecord,
  ): PlantMaintenanceMasterComponent[] {
    return record.components.map((component) =>
      this.normalizeComponent({
        name: component.name,
        inspectionLines: component.inspectionLines.map((line) =>
          this.normalizeInspectionLine(line),
        ),
      }),
    );
  }

  private cloneComponents(record: PlantMaintenanceMasterRecord): PlantMaintenanceMasterComponent[] {
    if (record.components?.length) {
      return record.components.map((component) => this.normalizeComponent(component));
    }

    return [createEmptyComponent()];
  }

  private normalizeInspectionLine(
    line: Partial<PlantMaintenanceMasterInspectionLine>,
  ): PlantMaintenanceMasterInspectionLine {
    return {
      itemsToBeInspected: line.itemsToBeInspected ?? '',
      whatToCheck: line.whatToCheck ?? '',
      replacement: line.replacement === 'Yes' ? 'Yes' : 'No',
      replacementItems:
        line.replacement === 'Yes'
          ? (line.replacementItems ?? []).map((item) => ({
              itemCode: item.itemCode ?? '',
              itemName: item.itemName ?? '',
              quantity: item.quantity ?? null,
            }))
          : [],
      instructions: line.instructions ?? '',
      status: line.status ?? '',
      employee: line.employee ?? '',
      recommendation: line.recommendation ?? '',
      attachments: (line.attachments ?? []).map((attachment) => ({
        fileName: attachment.fileName ?? '',
        dataUrl: attachment.dataUrl ?? '',
      })),
    };
  }

  private normalizeComponent(
    component: PlantMaintenanceMasterComponent & {
      status?: string;
      itemsToBeInspected?: string;
      whatToCheck?: string;
      instructions?: string;
      subComponents?: string[];
    },
  ): PlantMaintenanceMasterComponent {
    if (component.inspectionLines?.length) {
      return {
        name: component.name ?? '',
        inspectionLines: component.inspectionLines.map((line) =>
          this.normalizeInspectionLine(line),
        ),
      };
    }

    if (
      component.itemsToBeInspected !== undefined ||
      component.whatToCheck !== undefined ||
      component.instructions !== undefined
    ) {
      return {
        name: component.name ?? '',
        inspectionLines: [
          this.normalizeInspectionLine({
            itemsToBeInspected: component.itemsToBeInspected,
            whatToCheck: component.whatToCheck,
            instructions: component.instructions,
            status: component.status,
            employee: '',
          }),
        ],
      };
    }

    return {
      name: component.name ?? '',
      inspectionLines: [createEmptyInspectionLine()],
    };
  }
}
