import { CommonModule } from '@angular/common';

import { Component, computed, inject, OnInit, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';

import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AlertService } from '../../../../../services/alert.service';
import { formatApiErrorMessage } from '../../../../../utils/api-error.util';
import { resolveBranchNameFromBplId } from '../../../../../utils/branch-name.util';
import { MachineSearchOption, resolveMachineIdentity } from '../../plant-maintenance-machine.model';
import { PlantMaintenanceMachineItemService } from '../../plant-maintenance-machine-item.service';
import { SubComponentDefinitionService } from '../../sub-component-definition/sub-component-definition.service';
import {
  buildMaintenanceActivityPayload,
  MaintenanceActivityComponent,
  MaintenanceActivityDefinitionInput,
  MaintenanceActivityDefinitionService,
  MaintenanceActivityInspectionLine,
  MaintenanceActivityMachineRecord,
} from '../maintenance-activity-definition.service';



type InspectionLineField = keyof MaintenanceActivityInspectionLine;

const MACHINE_TYPE_OPTIONS = ['Blowing', 'Injection', 'Other'] as const;
const LOCATION_OPTIONS = ['AHCP_Peshawar', 'AHCP_HO', 'AHCP_Faisalabad'] as const;



function createEmptyInspectionLine(): MaintenanceActivityInspectionLine {

  return {

    itemsToBeInspected: '',

    whatToCheck: '',

    instructions: '',

  };

}



function createEmptyComponent(): MaintenanceActivityComponent {

  return {

    name: '',

    inspectionLines: [createEmptyInspectionLine()],

  };

}



@Component({

  selector: 'app-add-maintenance-activity-definition',

  standalone: true,

  imports: [CommonModule, FormsModule],

  templateUrl: './add-maintenance-activity-definition.html',

  styleUrls: ['./add-maintenance-activity-definition.css'],

})

export class AddMaintenanceActivityDefinitionComponent implements OnInit {
  private readonly activityService = inject(MaintenanceActivityDefinitionService);

  private readonly machineItemService = inject(PlantMaintenanceMachineItemService);

  private readonly subComponentService = inject(SubComponentDefinitionService);

  private readonly alertService = inject(AlertService);

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

  readonly components = signal<MaintenanceActivityComponent[]>([]);
  readonly machineTypeOptions = MACHINE_TYPE_OPTIONS;
  readonly locationOptions = LOCATION_OPTIONS;

  readonly idSuggestionsOpen = signal(false);

  readonly nameSuggestionsOpen = signal(false);

  readonly isSaving = signal(false);



  readonly maintenanceNatureOptions = [
    'Electrical',
    'Mechanical',
  ] as const;

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
    'Routine',
    'Preventive',
    'Corrective',
    'Breakdown',
    'Pre-Cautionary',
  ] as const;



  readonly idSuggestions = computed(() => {
    this.machineItemService.records();
    return this.machineItemService.searchByMachineId(this.machineId());
  });

  readonly nameSuggestions = computed(() => {
    this.machineItemService.records();
    return this.machineItemService.searchByMachineName(this.machineName());
  });



  ngOnInit(): void {

    this.machineItemService.ensureLoaded().subscribe({ error: () => {} });
    this.subComponentService.fetchMachines().subscribe({ error: () => {} });

    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {

      return;

    }

    this.editingRecordId.set(id);

    const cached = this.activityService.getById(id);

    if (cached) {

      this.populateFromRecord(cached);
    }

    this.activityService.fetchMaintenanceActivityDefinitionDetail(id).subscribe({

      next: (record) => this.populateFromRecord(record),

      error: (error: unknown) => {

        void this.alertService.error(

          'Load Failed',

          formatApiErrorMessage(error, 'Failed to load maintenance activity definition for edit.'),

        );

        if (!cached) {
          void this.router.navigate(['/plant-maintenance/setup-form/maintenance-activity-definition']);
        }

      },

    });

  }



  hasLoadedComponents(): boolean {

    return this.components().some((c) => c.name.trim());

  }



  back(): void {

    void this.router.navigate(['/plant-maintenance/setup-form/maintenance-activity-definition']);

  }



  onMachineIdInput(value: string): void {

    this.machineId.set(value);

    this.idSuggestionsOpen.set(value.trim().length > 0);

    this.closeNameSuggestions();

  }



  onMachineNameInput(value: string): void {

    this.machineName.set(value);

    this.nameSuggestionsOpen.set(value.trim().length > 0);

    this.closeIdSuggestions();

  }



  onMaintenanceNatureInput(value: string): void {

    this.maintenanceNature.set(value);

  }



  onPlantMaintenanceFrequencyInput(value: string): void {

    this.plantMaintenanceFrequency.set(value);

  }



  onPlantMaintenanceTypeInput(value: string): void {

    this.plantMaintenanceType.set(value);

  }

  onMachineTypeChange(value: string): void {
    this.machineType.set(value);
  }

  updateComponentName(componentIndex: number, value: string): void {

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



  addInspectionLine(componentIndex: number): void {

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

    this.components.update((list) => [...list, createEmptyComponent()]);

  }



  removeComponent(componentIndex: number): void {

    this.components.update((list) =>

      list.length > 1 ? list.filter((_, i) => i !== componentIndex) : [createEmptyComponent()],

    );

  }



  trackByIndex(index: number): number {

    return index;

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

      const record = this.activityService.getById(this.editingRecordId()!);

      if (record) {

        this.populateFromRecord(record);

      }

      return;

    }

    this.machineId.set('');

    this.machineName.set('');

    this.machineType.set('');

    this.location.set('');

    this.maintenanceNature.set('');

    this.plantMaintenanceFrequency.set('');

    this.plantMaintenanceType.set('');

    this.components.set([]);

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

    const maintenanceNature = this.maintenanceNature().trim();

    const location = this.location().trim();

    const plantMaintenanceFrequency = this.plantMaintenanceFrequency().trim();

    const plantMaintenanceType = this.plantMaintenanceType().trim();



    const components = this.components()

      .map((component) => ({

        name: component.name.trim(),

        inspectionLines: component.inspectionLines.map((line) => ({

          itemsToBeInspected: line.itemsToBeInspected.trim(),

          whatToCheck: line.whatToCheck.trim(),

          instructions: line.instructions.trim(),

        })),

      }))

      .filter((component) => component.name);



    if (!machineId || !machineName) {

      this.alertService.validation(

        'Machine ID and Machine Name are required.',

      );

      return;

    }

    if (!machineType) {
      this.alertService.validation('Select Machine Type.');
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

        ? 'No components found for this machine. Define them in Sub Component Definition first.'

        : 'Enter at least one component for this machine.';

      this.alertService.validation(message);

      return;

    }



    const duplicateComponentNames = this.findDuplicateComponentNames(components);

    if (duplicateComponentNames.length > 0) {

      this.alertService.validation(

        `Duplicate component name(s): ${duplicateComponentNames.join(', ')}. Each component must be unique for this machine.`,

      );

      return;

    }



    const resolved = resolveMachineIdentity(machineId, machineName);

    const entry: MaintenanceActivityDefinitionInput = {

      machineId: resolved.machineId,

      machineName: resolved.machineName,

      machineType,

      location,

      maintenanceNature,

      plantMaintenanceFrequency,

      plantMaintenanceType,

      components,

    };

    const apiPayload = buildMaintenanceActivityPayload(entry);

    if (apiPayload.components.length === 0) {
      this.alertService.validation('Enter at least one component with inspection details.');
      return;
    }

    const incompleteInspection = apiPayload.components.some(
      (component) => component.inspectionLines.length === 0,
    );
    if (incompleteInspection) {
      this.alertService.validation(
        'Each component must have at least one inspection line with items to inspect, what to check, or instructions.',
      );
      return;
    }

    const payload = entry;



    this.isSaving.set(true);

    try {

      if (this.editingRecordId()) {

        await firstValueFrom(
          this.activityService.updateMaintenanceActivityDefinition(this.editingRecordId()!, payload),
        );

        await this.alertService.successAndWait(
          'Success',
          'Maintenance Activity Defination updated successfully.',
        );

      } else {

        await firstValueFrom(this.activityService.addMaintenanceActivityDefinition(payload));

        await this.alertService.successAndWait(
          'Success',
          'Maintenance Activity Defination saved successfully.',
        );

      }

      void this.router.navigate(['/plant-maintenance/setup-form/maintenance-activity-definition']);

    } catch (error) {

      void this.alertService.error(
        this.editingRecordId() ? 'Update Failed' : 'Save Failed',
        formatApiErrorMessage(
          error,
          this.editingRecordId()
            ? 'Failed to update maintenance activity definition.'
            : 'Failed to save maintenance activity definition.',
        ),
      );

    } finally {

      this.isSaving.set(false);

    }

  }



  private findDuplicateComponentNames(

    components: Array<{ name: string }>,

  ): string[] {

    const seen = new Set<string>();

    const duplicates = new Set<string>();

    for (const component of components) {

      const key = component.name.toLowerCase();

      if (seen.has(key)) {

        duplicates.add(component.name);

      } else {

        seen.add(key);

      }

    }

    return [...duplicates];

  }



  private populateFromMachine(machine: MachineSearchOption): void {

    this.machineId.set(machine.machineId);

    this.machineName.set(machine.machineName);

    const subComponentRecord = this.subComponentService.getByMachineId(machine.machineId);
    this.machineType.set(this.normalizeMachineType(subComponentRecord?.machineType ?? ''));
    this.location.set(this.normalizeLocation(subComponentRecord?.location ?? ''));

    this.applyComponentsFromSubComponentDefinition(machine.machineId);

  }



  private applyComponentsFromSubComponentDefinition(machineId: string): void {

    if (this.editingRecordId()) {

      return;

    }



    const subComponentRecord = this.subComponentService.getByMachineId(machineId);

    const definedComponents = this.uniqueComponentNames(

      subComponentRecord?.subComponents.map((s) => s.trim()).filter(Boolean) ?? [],

    );



    if (definedComponents.length > 0) {

      this.components.set(

        definedComponents.map((name) => ({

          name,

          inspectionLines: [createEmptyInspectionLine()],

        })),

      );

      return;

    }



    this.components.set([]);

  }



  private uniqueComponentNames(names: string[]): string[] {

    const seen = new Set<string>();

    const unique: string[] = [];

    for (const name of names) {

      const key = name.toLowerCase();

      if (seen.has(key)) {

        continue;

      }

      seen.add(key);

      unique.push(name);

    }

    return unique;

  }



  private populateFromRecord(record: MaintenanceActivityMachineRecord): void {

    this.machineId.set(record.machineId === '—' ? '' : record.machineId);

    this.machineName.set(record.machineName === '—' ? '' : record.machineName);

    this.machineType.set(this.normalizeMachineType(record.machineType));
    this.location.set(this.normalizeLocation(record.location));

    this.maintenanceNature.set(
      this.normalizeSelectOption(record.maintenanceNature, this.maintenanceNatureOptions),
    );

    this.plantMaintenanceFrequency.set(
      this.normalizeSelectOption(record.plantMaintenanceFrequency, this.plantMaintenanceFrequencyOptions),
    );

    this.plantMaintenanceType.set(
      this.normalizeSelectOption(record.plantMaintenanceType, this.plantMaintenanceTypeOptions),
    );

    this.components.set(this.cloneComponents(record));

  }



  private cloneComponents(record: MaintenanceActivityMachineRecord): MaintenanceActivityComponent[] {

    if (record.components?.length) {

      return record.components.map((component) => this.normalizeComponent(component));

    }



    return [createEmptyComponent()];

  }



  private normalizeComponent(

    component: MaintenanceActivityComponent & {

      itemsToBeInspected?: string;

      whatToCheck?: string;

      instructions?: string;

      subComponents?: string[];

    },

  ): MaintenanceActivityComponent {

    if (component.inspectionLines?.length) {

      return {

        name: component.name ?? '',

        inspectionLines: component.inspectionLines.map((line) => ({

          itemsToBeInspected: line.itemsToBeInspected ?? '',

          whatToCheck: line.whatToCheck ?? '',

          instructions: line.instructions ?? '',

        })),

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

          {

            itemsToBeInspected: component.itemsToBeInspected ?? '',

            whatToCheck: component.whatToCheck ?? '',

            instructions: component.instructions ?? '',

          },

        ],

      };

    }



    return {

      name: component.name ?? '',

      inspectionLines: [createEmptyInspectionLine()],

    };

  }

  private normalizeMachineType(value: string): string {
    return this.normalizeSelectOption(value, MACHINE_TYPE_OPTIONS);
  }

  private normalizeLocation(value?: string): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed || trimmed === '—') {
      return '';
    }

    const resolved = resolveBranchNameFromBplId(trimmed);
    return this.normalizeSelectOption(resolved, LOCATION_OPTIONS);
  }

  private normalizeSelectOption(value: string, options: readonly string[]): string {
    const normalizedValue = value.trim().toLowerCase();
    if (!normalizedValue || normalizedValue === '—') {
      return '';
    }

    const comparableValue =
      normalizedValue === 'quaterly' || normalizedValue === 'quartely'
        ? 'quarterly'
        : normalizedValue;
    return options.find((option) => {
      const normalizedOption = option.trim().toLowerCase();
      const comparableOption =
        normalizedOption === 'quaterly' || normalizedOption === 'quartely'
          ? 'quarterly'
          : normalizedOption;
      return comparableOption === comparableValue;
    }) ?? '';
  }

}


