import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  JobSpecificationAddPayload,
  JobSpecificationRecord,
  JobSpecificationService,
} from '../../../../services/job-specification.service';
import { AlertService } from '../../../../services/alert.service';

const DEPARTMENT_OPTIONS = [
  'Production Department',
  'Electrical Department',
  'Quality Control Department',
  'Logistics Department',
  'Procurement Department',
  'Admin Department',
  'Accounts & Finance Department',
  'Internal Audit Department',
  'Human Resource (HR) Department',
  'Sales & Marketing Department',
  'IT Department',
  'BOD Department',
  'Common Department',
] as const;

const GRADE_WORK_LEVEL_OPTIONS = [
  'WL 5',
  'WL 4',
  'WL 3B',
  'WL 3A',
  'WL 2C',
  'WL 2B',
  'WL 2A',
  'WL 1D',
  'WL 1B–1C',
] as const;

const MANDATORY_FIELDS = [
  'jobTitle',
  'department',
  'vacancyCount',
  'employmentType',
  'gradeWorkLevel',
  'basicSalary',
  'qualification-0',
] as const;

@Component({
  selector: 'app-create-job-specification',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-job-specification.html',
  styleUrl: './create-job-specification.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateJobSpecificationComponent implements OnInit {
  protected readonly departmentOptions = DEPARTMENT_OPTIONS;
  protected readonly gradeWorkLevelOptions = GRADE_WORK_LEVEL_OPTIONS;

  editingId: string | null = null;
  pageTitle = 'Create New Job Specification';
  submitButtonLabel = 'Save Job Specification';

  // Form Fields - General
  jobTitle = '';  department = '';
  vacancyCount: number | null = null;
  jobDescription = '';
  experienceYears: number | null = null;
  employmentCategory = '';
  employmentNature = '';
  employmentType = '';
  gradeWorkLevel = '';
  keyResponsibilities = '';

  // Form Fields - Remuneration
  basicSalary = '';
  medicalAllowance = '';
  fuelAllowance = '';
  packagePerks = '';

  // Form Fields - Qualification (Dynamic)
  qualifications: string[] = [''];

  private validationSubmitted = false;
  private touched: Record<string, boolean> = {};

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private jobSpecService: JobSpecificationService,
    private alertService: AlertService,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    const editId = this.route.snapshot.paramMap.get('id');
    if (!editId) {
      return;
    }

    this.editingId = editId;
    this.pageTitle = 'Update Job Specification';
    this.submitButtonLabel = 'Update Job Specification';

    const existing = this.jobSpecService.findJobSpecById(editId);
    if (existing) {
      this.populateFromRecord(existing);
      this.cdr.markForCheck();
      return;
    }

    this.jobSpecService.fetchPostedJobSpecifications().subscribe({
      next: (records) => {
        const record = records.find((item) => String(item.Id) === editId);
        if (record) {
          this.populateFromRecord(record);
        } else {
          this.alertService.warning('Edit', 'Job specification not found.');
        }
        this.cdr.markForCheck();
      },
      error: (error: unknown) => {
        const errorMessage =
          (error as { error?: { message?: string } })?.error?.message ||
          (error as { message?: string })?.message ||
          'Failed to load job specification for edit.';
        this.alertService.error('Load Failed', errorMessage);
      },
    });
  }
  addQualification(): void {
    this.qualifications.push('');
  }

  removeQualification(index: number): void {
    if (this.qualifications.length > 1) {
      this.qualifications.splice(index, 1);
    } else {
      this.qualifications[0] = '';
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  protected isMandatory(field: string): boolean {
    return (MANDATORY_FIELDS as readonly string[]).includes(field);
  }

  protected showFieldError(field: string): boolean {
    if (!this.shouldShowValidation(field)) {
      return false;
    }
    return this.isFieldEmpty(field);
  }

  protected touch(field: string): void {
    this.touched[field] = true;
    this.cdr.markForCheck();
  }

  protected qualificationFieldKey(index: number): string {
    return `qualification-${index}`;
  }

  preventNonNumericExperienceInput(event: KeyboardEvent): void {
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey) {
      return;
    }

    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }

  onSalaryInput(value: string, field: 'basicSalary' | 'medicalAllowance' | 'fuelAllowance'): void {
    this[field] = this.sanitizeDecimalValue(value);
    this.cdr.markForCheck();
  }

  onDecimalKeyDown(event: KeyboardEvent): void {
    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey) {
      return;
    }

    if (event.key === '.' && !(event.target as HTMLInputElement).value.includes('.')) {
      return;
    }

    if (event.key.length === 1 && !/\d/.test(event.key)) {
      event.preventDefault();
    }
  }

  back(): void {
    void this.router.navigateByUrl('/job-specification-form');
  }

  submitForm(): void {
    this.validationSubmitted = true;
    this.touchAllMandatory();
    this.cdr.markForCheck();

    if (!this.validateForm()) {
      this.alertService.validation('Please fill in all required fields marked with *.');
      return;
    }

    const payload: JobSpecificationAddPayload = {
      jobTitle: this.jobTitle.trim(),
      department: this.department.trim(),
      vacancyCount: this.vacancyCount ?? 0,
      jobDescription: this.jobDescription.trim(),
      experienceRequirement: this.formatExperienceRequirement(this.experienceYears),
      employmentCategory: this.employmentCategory,
      employmentNature: this.employmentNature,
      employmentType: this.employmentType,
      gradeWorkLevel: this.gradeWorkLevel,
      keyResponsibilities: this.keyResponsibilities.trim(),
      basicSalary: this.parseAmount(this.basicSalary),
      medicalAllowance: this.parseAmount(this.medicalAllowance),
      fuelAllowance: this.parseAmount(this.fuelAllowance),
      packagePerks: this.packagePerks.trim(),
      qualifications: this.qualifications.filter(q => q.trim() !== ''),
    };

    const request$ = this.editingId
      ? this.jobSpecService.updateJobSpec(this.editingId, payload)
      : this.jobSpecService.addJobSpec(payload);

    request$.subscribe({
      next: () => {
        this.jobSpecService.fetchPostedJobSpecifications().subscribe({
          next: () => this.handleSubmitSuccess(),
          error: () => this.handleSubmitSuccess(),
        });
      },
      error: (error: unknown) => {
        const errorMessage =
          (error as { error?: { message?: string } })?.error?.message ||
          (error as { message?: string })?.message ||
          (this.editingId ? 'Failed to update job specification.' : 'Failed to save job specification.');
        this.alertService.error(this.editingId ? 'Update Failed' : 'Save Failed', errorMessage);
      },
    });
  }

  private populateFromRecord(record: JobSpecificationRecord): void {
    this.jobTitle = record.jobTitle === '—' ? '' : record.jobTitle;
    this.department = record.department === '—' ? '' : record.department;
    this.vacancyCount = record.vacancyCount || null;
    this.jobDescription = record.jobDescription === '—' ? '' : record.jobDescription;
    this.experienceYears = this.parseExperienceYears(record.experienceRequirement);
    this.employmentCategory = record.employmentCategory === '—' ? '' : record.employmentCategory;
    this.employmentNature = record.employmentNature === '—' ? '' : record.employmentNature;
    this.employmentType = record.employmentType === '—' ? '' : record.employmentType;
    this.gradeWorkLevel = record.gradeWorkLevel === '—' ? '' : record.gradeWorkLevel;
    this.keyResponsibilities = record.keyResponsibilities === '—' ? '' : record.keyResponsibilities;
    this.basicSalary = record.basicSalary > 0 ? String(record.basicSalary) : '';
    this.medicalAllowance = record.medicalAllowance > 0 ? String(record.medicalAllowance) : '';
    this.fuelAllowance = record.fuelAllowance > 0 ? String(record.fuelAllowance) : '';
    this.packagePerks = record.packagePerks === '—' ? '' : record.packagePerks;
    this.qualifications = record.qualifications.length ? [...record.qualifications] : [''];
  }

  private formatExperienceRequirement(years: number | null): string {
    if (years === null || !Number.isFinite(years) || years < 0) {
      return '';
    }

    return years === 1 ? '1 year' : `${years} years`;
  }

  private parseExperienceYears(value: string): number | null {
    if (!value || value === '—') {
      return null;
    }

    const match = value.trim().match(/^(\d+)/);
    return match ? Number.parseInt(match[1], 10) : null;
  }

  private handleSubmitSuccess(): void {
    this.alertService.success(
      'Success',
      this.editingId
        ? 'Job specification updated successfully!'
        : 'Job specification saved successfully!',
    );
    this.back();
  }

  private sanitizeDecimalValue(value: string): string {
    const sanitized = String(value ?? '').replace(/[^\d.]/g, '');
    const [whole, ...fraction] = sanitized.split('.');
    return fraction.length ? `${whole}.${fraction.join('')}` : whole;
  }

  private parseAmount(value: string): number {
    const parsed = Number.parseFloat(this.sanitizeDecimalValue(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private shouldShowValidation(field: string): boolean {
    return this.validationSubmitted || !!this.touched[field];
  }

  private touchAllMandatory(): void {
    for (const field of MANDATORY_FIELDS) {
      this.touched[field] = true;
    }
  }

  private validateForm(): boolean {
    return MANDATORY_FIELDS.every((field) => !this.isFieldEmpty(field));
  }

  private isFieldEmpty(field: string): boolean {
    const qualificationMatch = field.match(/^qualification-(\d+)$/);
    if (qualificationMatch) {
      const index = Number.parseInt(qualificationMatch[1], 10);
      return !this.qualifications[index]?.trim();
    }

    switch (field) {
      case 'jobTitle':
        return !this.jobTitle.trim();
      case 'department':
        return !this.department.trim();
      case 'vacancyCount':
        return this.vacancyCount === null || this.vacancyCount === undefined;
      case 'employmentType':
        return !this.employmentType.trim();
      case 'gradeWorkLevel':
        return !this.gradeWorkLevel.trim();
      case 'basicSalary':
        return !this.basicSalary.trim();
      default:
        return false;
    }
  }
}