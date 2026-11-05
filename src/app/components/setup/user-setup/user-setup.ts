import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { AlertService } from '../../../services/alert.service';
import { UserListItem, UserSetupPayload, UserSetupService } from '../../../services/user-setup.service';
import { ApplicationFormService, ApplicationFormRecord } from '../../../services/application-form.service';
import { formatApiErrorMessage } from '../../../utils/api-error.util';
import {
  AUTHORIZATION_MODULE_DEFINITIONS,
  buildAuthorizationTemplate,
  isPermissionGranted,
  permissionKey,
  updateAllPermissionsInDraft,
  updateModulePermissionsInDraft,
  updatePermissionInDraft,
  UserAuthorizationModule,
} from '../../../utils/user-authorization.util';
import { displayDateOnly } from '../../../utils/date-format.util';
import { GL_ACCOUNT_BRANCH_OPTIONS } from '../gl-account-determination/gl-account-branch.options';

type UserFormMode = 'add' | 'edit';

@Component({
  selector: 'app-user-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-setup.html',
  styleUrl: './user-setup.css',
})
export class UserSetupComponent implements OnInit {
  private readonly userSetupService = inject(UserSetupService);
  private readonly applicationFormService = inject(ApplicationFormService);
  private readonly alertService = inject(AlertService);
  private readonly editableFallbackColumns = ['name', 'email', 'password', 'employee_code'];
  readonly branchOptions = GL_ACCOUNT_BRANCH_OPTIONS.map((branch) => ({
    value: branch.code,
    label: branch.name,
  }));

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly employeeProfilesLoading = signal(false);
  readonly users = signal<UserListItem[]>([]);
  readonly columns = signal<string[]>([]);
  readonly formMode = signal<UserFormMode>('add');
  readonly editingUserId = signal<string | number | null>(null);
  readonly editorWidth = signal<number>(420);
  readonly formFields = signal<string[]>([]);
  readonly formModel = signal<Record<string, string | string[]>>({});
  readonly authorization = signal<UserAuthorizationModule[]>(buildAuthorizationTemplate());
  readonly authDefinitions = AUTHORIZATION_MODULE_DEFINITIONS;
  readonly employeeProfiles = signal<ApplicationFormRecord[]>([]);
  readonly employeeCodeSearchText = signal('');
  readonly employeeCodeInputFocused = signal(false);
  readonly nameSuggestions = computed(() => {
    const query = this.resolveTextValue(this.fieldValue('name')) || this.resolveTextValue(this.fieldValue('Name'));
    const value = query.trim().toLowerCase();
    if (!value) {
      return [];
    }

    const results = new Set<string>();
    
    // Add names from existing users
    for (const user of this.users()) {
      for (const field of ['name', 'Name']) {
        const raw = user[field];
        if (typeof raw !== 'string') {
          continue;
        }
        const text = raw.trim();
        if (!text) {
          continue;
        }
        if (text.toLowerCase().includes(value)) {
          results.add(text);
        }
      }
    }

    // Add names from employee profiles
    for (const profile of this.employeeProfiles()) {
      const raw = profile.EmployeeName?.trim();
      if (!raw) {
        continue;
      }
      if (raw.toLowerCase().includes(value)) {
        results.add(raw);
      }
    }

    return [...results].sort((a, b) => a.localeCompare(b));
  });
  readonly emailSuggestions = computed(() => this.buildFieldSuggestions(['email', 'Email'], this.resolveTextValue(this.fieldValue('email')) || this.resolveTextValue(this.fieldValue('Email'))));
  readonly employeeCodeOptions = computed(() => {
    const searchQuery = this.employeeCodeSearchText().trim().toLowerCase();
    const profiles = this.employeeProfiles();
    const set = new Set<{ code: string; name: string }>();

    for (const profile of profiles) {
      const rawCode = profile.EmployeeCode?.trim();
      const rawName = profile.EmployeeName?.trim();
      const code = rawCode && rawCode !== '—' ? rawCode : '';
      const name = rawName && rawName !== '—' ? rawName : '';

      if (!code) {
        continue;
      }

      set.add({ code, name });
    }

    const sorted = [...set].sort((a, b) => a.code.localeCompare(b.code));

    if (!searchQuery) {
      return sorted;
    }

    return sorted.filter((item) => {
      const codeMatch = item.code.toLowerCase().includes(searchQuery);
      const nameMatch = item.name ? item.name.toLowerCase().includes(searchQuery) : false;
      return codeMatch || nameMatch;
    });
  });
  readonly authorizationSummary = computed(() => {
    const authorization = this.authorization();
    let total = 0;
    let granted = 0;

    for (const module of authorization) {
      for (const value of Object.values(module)) {
        total += 1;
        if (value === 1) {
          granted += 1;
        }
      }
    }

    return { total, granted };
  });
  readonly authorizationProgress = computed(() => {
    const summary = this.authorizationSummary();
    return summary.total ? `${Math.round((summary.granted / summary.total) * 100)}%` : '0%';
  });
  readonly searchText = signal('');
  readonly permissionSearchText = signal('');
  readonly currentPage = signal(1);
  readonly itemsPerPage = signal(10);
  readonly filteredUsers = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    if (!query) {
      return this.users();
    }

    return this.users().filter((user) =>
      Object.values(user).some((value) => {
        if (typeof value === 'string') {
          return value.toLowerCase().includes(query);
        }
        if (typeof value === 'number') {
          return String(value).includes(query);
        }
        return false;
      }),
    );
  });

  readonly totalFilteredUsers = computed(() => this.filteredUsers().length);
  readonly totalPages = computed(() => Math.ceil(this.totalFilteredUsers() / this.itemsPerPage()));
  readonly paginatedUsers = computed(() => {
    const start = (this.currentPage() - 1) * this.itemsPerPage();
    const end = start + this.itemsPerPage();
    return this.filteredUsers().slice(start, end);
  });
  readonly paginationStart = computed(() => (this.currentPage() - 1) * this.itemsPerPage() + 1);
  readonly paginationEnd = computed(() => Math.min(this.currentPage() * this.itemsPerPage(), this.totalFilteredUsers()));

  readonly totalUsers = computed(() => this.users().length);
  readonly filteredAuthDefinitions = computed(() => {
    const query = this.permissionSearchText().trim().toLowerCase();
    if (!query) {
      return this.authDefinitions;
    }

    return this.authDefinitions.filter((module) => {
      const haystack = `${module.name} ${module.slug} ${module.actions.join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });
  });

  ngOnInit(): void {
    this.loadUsers();
    this.loadEmployeeProfiles();
  }

  resizePanel(width: number): void {
    const minimumWidth = 360;
    const maximumWidth = Math.max(minimumWidth + 120, window.innerWidth * 0.65);
    this.editorWidth.set(Math.min(Math.max(width, minimumWidth), maximumWidth));
  }

  startResize(event: MouseEvent): void {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = this.editorWidth();

    const onMouseMove = (moveEvent: MouseEvent): void => {
      const nextWidth = startWidth + (moveEvent.clientX - startX);
      this.resizePanel(nextWidth);
    };

    const onMouseUp = (): void => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  loadEmployeeProfiles(): void {
    this.employeeProfilesLoading.set(true);
    this.applicationFormService
      .fetchEmployeeProfiles()
      .pipe(finalize(() => this.employeeProfilesLoading.set(false)))
      .subscribe({
        next: (profiles) => {
          this.employeeProfiles.set(profiles);
        },
        error: (error: unknown) => {
          this.employeeProfiles.set([]);
          console.warn('Failed to load employee profiles:', error);
        },
      });
  }

  loadUsers(): void {
    this.loading.set(true);
    this.userSetupService
      .fetchUsers()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (users) => {
          this.users.set(users);
          this.columns.set(this.deriveColumns(users));
          this.formFields.set(this.deriveEditableFields(users));
          this.currentPage.set(1);
          this.resetForm();
        },
        error: (error: unknown) => {
          this.users.set([]);
          this.columns.set([]);
          this.formFields.set(this.deriveEditableFields([]));
          this.currentPage.set(1);
          this.resetForm();
          void this.alertService.error(
            'Load Failed',
            formatApiErrorMessage(error, 'Failed to load user list.'),
          );
        },
      });
  }

  goToPage(page: number): void {
    const totalPages = this.totalPages();
    if (page >= 1 && page <= totalPages) {
      this.currentPage.set(page);
    }
  }

  nextPage(): void {
    const nextPage = this.currentPage() + 1;
    if (nextPage <= this.totalPages()) {
      this.currentPage.set(nextPage);
    }
  }

  previousPage(): void {
    const prevPage = this.currentPage() - 1;
    if (prevPage >= 1) {
      this.currentPage.set(prevPage);
    }
  }

  columnLabel(column: string): string {
    return column
      .replace(/_/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  isPermissionAllowed(moduleSlug: string, action: string): boolean {
    return isPermissionGranted(this.authorization(), moduleSlug, action);
  }

  togglePermission(moduleSlug: string, action: string, allowed: boolean): void {
    const key = permissionKey(moduleSlug, action);
    this.authorization.set(updatePermissionInDraft(this.authorization(), key, allowed ? 1 : 0));
  }

  setModulePermissions(moduleSlug: string, allowed: boolean): void {
    this.authorization.set(updateModulePermissionsInDraft(this.authorization(), moduleSlug, allowed));
  }

  setAllPermissions(allowed: boolean): void {
    this.authorization.set(updateAllPermissionsInDraft(this.authorization(), allowed));
  }

  cellValue(user: UserListItem, column: string): string {
    const value = user[column];
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    if (this.isDateColumn(column)) {
      return this.formatDateColumn(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (this.isBranchColumn(column)) {
      return this.formatBranchValue(value);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  private isDateColumn(column: string): boolean {
    const normalized = column.toLowerCase();
    return normalized.endsWith('_at') || normalized === 'createdat' || normalized === 'updatedat';
  }

  private isBranchColumn(column: string): boolean {
    const normalized = column.toLowerCase();
    return normalized === 'branch' || normalized === 'branches';
  }

  private formatBranchValue(value: unknown): string {
    const branchMap: Record<string, { label: string; code: string }> = {
      '1': { label: 'Peshawar', code: '1' },
      '2': { label: 'HO', code: '2' },
      '3': { label: 'Faisalabad', code: '3' },
      peshawar: { label: 'Peshawar', code: '1' },
      ho: { label: 'HO', code: '2' },
      faisalabad: { label: 'Faisalabad', code: '3' },
      ahcp_peshawar: { label: 'Peshawar', code: '1' },
      ahcp_ho: { label: 'HO', code: '2' },
      ahcp_faisalabad: { label: 'Faisalabad', code: '3' },
      'ahcp peshawar': { label: 'Peshawar', code: '1' },
      'ahcp ho': { label: 'HO', code: '2' },
      'ahcp faisalabad': { label: 'Faisalabad', code: '3' },
    };

    const formatEntry = (entry: unknown): string => {
      if (typeof entry === 'number') {
        const normalized = branchMap[String(entry)] ?? branchMap[String(entry).trim().toLowerCase()];
        return normalized ? `${normalized.label} (${normalized.code})` : String(entry);
      }

      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        const normalized = branchMap[trimmed.toLowerCase()] ?? branchMap[trimmed];
        if (normalized) {
          return `${normalized.label} (${normalized.code})`;
        }
        return trimmed;
      }

      return String(entry);
    };

    if (Array.isArray(value)) {
      return value.map((entry) => formatEntry(entry)).join(', ');
    }

    return formatEntry(value);
  }

  private formatDateColumn(value: unknown): string {
    const formatted = displayDateOnly(value as string | number);
    if (formatted === '—') {
      return '—';
    }
    return formatted.replace(/-/g, '/');
  }

  trackByColumn(_index: number, column: string): string {
    return column;
  }

  fieldValue(field: string): string | string[] {
    return this.formModel()[field] ?? (this.isBranchField(field) ? [] : '');
  }

  isBranchSelected(optionValue: string): boolean {
    const selected = this.fieldValue('branch');
    if (Array.isArray(selected)) {
      return selected.includes(optionValue);
    }
    return selected === optionValue;
  }

  toggleBranchSelection(optionValue: string, checked: boolean): void {
    const selected = this.fieldValue('branch');
    const nextValues = Array.isArray(selected)
      ? [...selected]
      : selected && String(selected).trim()
      ? [String(selected)]
      : [];

    if (checked) {
      if (!nextValues.includes(optionValue)) {
        nextValues.push(optionValue);
      }
    } else {
      const index = nextValues.indexOf(optionValue);
      if (index >= 0) {
        nextValues.splice(index, 1);
      }
    }

    this.updateField('branch', nextValues);
  }

  private resolveTextValue(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value.join(',') : value ?? '';
  }

  isBranchField(field: string): boolean {
    return field.toLowerCase() === 'branch';
  }

  isEmployeeCodeField(field: string): boolean {
    const n = field.toLowerCase().replace(/[_\s]/g, '');
    return n === 'employeecode' || n === 'sapemployeeid';
  }

  updateField(field: string, value: string | string[]): void {
    this.formModel.update((model) => ({
      ...model,
      [field]: value,
    }));

    if (field.toLowerCase() === 'name') {
      this.syncPairedField(
        field,
        ['name', 'Name'],
        ['email', 'Email'],
      );
      // Auto-populate employee code when name is selected
      this.syncNameWithEmployeeCode();
    } else if (field.toLowerCase() === 'email') {
      this.syncPairedField(
        field,
        ['email', 'Email'],
        ['name', 'Name'],
      );
    }
  }

  selectEmployeeCode(employeeCode: string): void {
    // Update the employee code field
    this.updateField('employee_code', employeeCode);

    // Find the matching employee profile and auto-populate the name
    const profile = this.employeeProfiles().find(
      (p) => p.EmployeeCode?.trim().toLowerCase() === employeeCode.trim().toLowerCase(),
    );

    if (profile && profile.EmployeeName) {
      this.formModel.update((model) => ({
        ...model,
        name: profile.EmployeeName.trim(),
        Name: profile.EmployeeName.trim(),
      }));
    }

    // Clear the search text
    this.employeeCodeSearchText.set('');
  }

  onEmployeeCodeInputFocus(): void {
    this.employeeCodeInputFocused.set(true);
  }

  onEmployeeCodeInputBlur(): void {
    // Delay the blur to allow click event on dropdown options to fire
    setTimeout(() => {
      this.employeeCodeInputFocused.set(false);
    }, 150);
  }

  private syncNameWithEmployeeCode(): void {
    const nameValue = this.resolveTextValue(this.fieldValue('name')).trim();
    if (!nameValue) {
      return;
    }

    // Find employee profile matching the name
    const profile = this.employeeProfiles().find((p) =>
      p.EmployeeName?.trim().toLowerCase() === nameValue.toLowerCase(),
    );

    if (profile && profile.EmployeeCode) {
      this.formModel.update((model) => ({
        ...model,
        employee_code: profile.EmployeeCode.trim(),
        employeeCode: profile.EmployeeCode.trim(),
        EmployeeCode: profile.EmployeeCode.trim(),
      }));
    }
  }

  formTitle(): string {
    return this.formMode() === 'edit' ? 'Update User' : 'Add User';
  }

  submitUser(): void {
    if (this.saving()) {
      return;
    }

    const payload = this.buildSubmitPayload();
    const requiredField = this.firstMissingRequiredField(payload);
    if (requiredField) {
      this.alertService.validation(`${this.columnLabel(requiredField)} is required.`);
      return;
    }

    this.saving.set(true);
    const request =
      this.formMode() === 'edit' && this.editingUserId() !== null
        ? this.userSetupService.updateUser(this.editingUserId() as string | number, payload)
        : this.userSetupService.addUser(payload);

    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.alertService.success(
          'Saved',
          this.formMode() === 'edit' ? 'User updated successfully.' : 'User added successfully.',
        );
        this.loadUsers();
      },
      error: (error: unknown) => {
        void this.alertService.error(
          'Save Failed',
          formatApiErrorMessage(error, `Failed to ${this.formMode() === 'edit' ? 'update' : 'add'} user.`),
        );
      },
    });
  }

  startEdit(user: UserListItem): void {
    const userId = this.resolveUserId(user);
    if (userId === null) {
      this.alertService.warning('Edit', 'Unable to edit this row: missing user id.');
      return;
    }

    const nextModel: Record<string, string | string[]> = {};
    for (const field of this.formFields()) {
      nextModel[field] = this.valueToInput(user[field], field);
    }

    const employeeCodeValue = this.resolveEmployeeCodeValue(user);
    if (employeeCodeValue) {
      for (const key of [
        'employee_code',
        'employeeCode',
        'EmployeeCode',
        'sap_employee_id',
        'sapEmployeeId',
        'SAPEmployeeID',
      ]) {
        if (this.formFields().includes(key)) {
          nextModel[key] = employeeCodeValue;
        }
      }
    }

    this.formMode.set('edit');
    this.editingUserId.set(userId);
    this.formModel.set(nextModel);
    this.authorization.set(buildAuthorizationTemplate(user['authorization'] ?? user['Authorization'] ?? []));
  }

  startAddUser(): void {
    this.resetForm();
  }

  cancelEdit(): void {
    this.resetForm();
  }

  async deleteUser(user: UserListItem): Promise<void> {
    if (this.deleting() || this.saving()) {
      return;
    }

    const userId = this.resolveUserId(user);
    if (userId === null) {
      this.alertService.warning('Delete', 'Unable to delete this row: missing user id.');
      return;
    }

    const label =
      this.valueToInput(user['name'], 'name') || this.valueToInput(user['Name'], 'Name') || this.valueToInput(user['email'], 'email') || `ID ${userId}`;
    const result = await this.alertService.confirm('Delete user?', `Remove ${label} from the list?`);
    if (!result.isConfirmed) {
      return;
    }

    this.deleting.set(true);
    this.userSetupService
      .deleteUser(userId)
      .pipe(finalize(() => this.deleting.set(false)))
      .subscribe({
        next: () => {
          this.alertService.success('Deleted', 'User removed successfully.');
          if (this.editingUserId() === userId) {
            this.resetForm();
          }
          this.loadUsers();
        },
        error: (error: unknown) => {
          void this.alertService.error(
            'Delete Failed',
            formatApiErrorMessage(error, 'Failed to delete user.'),
          );
        },
      });
  }

  private deriveColumns(users: UserListItem[]): string[] {
    const priority = [
      'id',
      'Id',
      'ID',
      'name',
      'Name',
      'username',
      'Username',
      'email',
      'Email',
      'employee_code',
      'employeeCode',
      'EmployeeCode',
      'sap_employee_id',
      'sapEmployeeId',
      'SAPEmployeeID',
      'is_admin',
      'isAdmin',
      'role',
      'Role',
      'created_at',
      'createdAt',
    ];
    const discovered = new Set<string>();

    for (const user of users) {
      Object.keys(user).forEach((key) => discovered.add(key));
    }

    const discoveredFiltered = [...discovered].filter((key) => key.toLowerCase() !== 'authorization');
    const ordered = priority.filter((key) => discoveredFiltered.includes(key));
    const remaining = discoveredFiltered.filter((key) => !priority.includes(key)).sort((a, b) => a.localeCompare(b));
    return [...ordered, ...remaining];
  }

  private deriveEditableFields(users: UserListItem[]): string[] {
    const discovered = new Set<string>();
    for (const user of users) {
      Object.keys(user).forEach((key) => {
        if (!this.isReadOnlyField(key)) {
          discovered.add(key);
        }
      });
    }

    for (const key of this.editableFallbackColumns) {
      discovered.add(key);
    }

    const priority = [
      'name',
      'Name',
      'username',
      'Username',
      'email',
      'Email',
      'password',
      'employee_code',
      'employeeCode',
      'EmployeeCode',
      'sap_employee_id',
      'sapEmployeeId',
      'SAPEmployeeID',
    ];
    const ordered = priority.filter((key) => discovered.has(key));
    const remaining = [...discovered].filter((key) => !priority.includes(key)).sort((a, b) => a.localeCompare(b));
    return [...ordered, ...remaining];
  }

  private isReadOnlyField(field: string): boolean {
    const normalized = field.toLowerCase();
    return [
      'id',
      'created_at',
      'updated_at',
      'deleted_at',
      'email_verified_at',
      'authorization',
      'is_admin',
      'isadmin',
    ].includes(normalized);
  }

  private buildFieldSuggestions(fields: string[], query: string): string[] {
    const value = query.trim().toLowerCase();
    if (!value) {
      return [];
    }

    const results = new Set<string>();
    for (const user of this.users()) {
      for (const field of fields) {
        const raw = user[field];
        if (typeof raw !== 'string') {
          continue;
        }
        const text = raw.trim();
        if (!text) {
          continue;
        }
        if (text.toLowerCase().includes(value)) {
          results.add(text);
        }
      }
    }

    return [...results].sort((a, b) => a.localeCompare(b));
  }

  private syncPairedField(
    sourceField: string,
    sourceKeys: string[],
    targetKeys: string[],
  ): void {
    const sourceValue = this.resolveTextValue(this.fieldValue(sourceField)).trim().toLowerCase();
    if (!sourceValue) {
      return;
    }

    const matchedUser = this.users().find((user) =>
      sourceKeys.some((key) => {
        const raw = user[key];
        return typeof raw === 'string' && raw.trim().toLowerCase() === sourceValue;
      }),
    );

    if (!matchedUser) {
      return;
    }

    this.formModel.update((model) => {
      const nextModel = { ...model };
      for (const targetKey of targetKeys) {
        const raw = matchedUser[targetKey];
        if (typeof raw === 'string') {
          nextModel[targetKey] = raw.trim();
        }
      }
      return nextModel;
    });
  }

  private resetForm(): void {
    const nextModel: Record<string, string | string[]> = {};
    for (const field of this.formFields()) {
      nextModel[field] = this.isBranchField(field) ? [] : '';
    }
    this.formMode.set('add');
    this.editingUserId.set(null);
    this.formModel.set(nextModel);
    this.authorization.set(buildAuthorizationTemplate());
  }

  private buildSubmitPayload(): UserSetupPayload {
    const model = this.formModel();
    const read = (...keys: string[]): string => {
      for (const key of keys) {
        const value = this.resolveTextValue(model[key] as string | string[] | undefined).trim();
        if (value) {
          return value;
        }
      }
      return '';
    };

    const branchSelection = this.normalizeBranchSelection(model['branch'] ?? model['Branch']);
    const payload: UserSetupPayload = {
      name: read('name', 'Name'),
      email: read('email', 'Email'),
      employee_code: read('employee_code', 'employeeCode', 'EmployeeCode', 'sap_employee_id', 'sapEmployeeId', 'SAPEmployeeID'),
      branch: branchSelection.length > 0 ? branchSelection : undefined,
      department: 25,
      authorization: this.authorization(),
    };

    const password = read('password');
    if (password || this.formMode() === 'add') {
      payload.password = password;
    }

    return payload;
  }

  private firstMissingRequiredField(payload: UserSetupPayload): string | null {
    if (!payload.name.trim()) {
      return 'name';
    }
    if (!payload.email.trim()) {
      return 'email';
    }
    if (!payload.employee_code?.trim()) {
      return 'employee_code';
    }
    if (!payload.branch?.length) {
      return 'branch';
    }
    if (this.formMode() === 'add' && !payload.password?.trim()) {
      return 'password';
    }
    return null;
  }

  private resolveEmployeeCodeValue(user: UserListItem): string {
    const candidates = ['sap_employee_id', 'sapEmployeeId', 'SAPEmployeeID', 'employee_code', 'employeeCode', 'EmployeeCode'];
    for (const key of candidates) {
      const raw = user[key];
      const value = this.valueToInput(raw, key);
      const normalized = this.resolveTextValue(Array.isArray(value) ? value.join(',') : String(value)).trim();
      if (normalized && normalized !== '—') {
        return normalized;
      }
    }
    return '';
  }

  private resolveUserId(user: UserListItem): string | number | null {
    const keys = ['id', 'Id', 'ID'];
    for (const key of keys) {
      const value = user[key];
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        return typeof value === 'number' ? value : String(value).trim();
      }
    }
    return null;
  }

  private normalizeBranchValue(value: string | number | null | undefined): number | null {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? value : null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      const branchMap: Record<string, number> = {
        peshawar: 1,
        ho: 2,
        faisalabad: 3,
        '1': 1,
        '2': 2,
        '3': 3,
      };
      return branchMap[trimmed] ?? null;
    }

    return null;
  }

  private normalizeBranchSelection(value: unknown): number[] {
    if (Array.isArray(value)) {
      return value
        .map((entry) => this.normalizeBranchValue(typeof entry === 'string' || typeof entry === 'number' ? entry : String(entry)))
        .filter((entry): entry is number => entry !== null);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => this.normalizeBranchValue(entry))
        .filter((entry): entry is number => entry !== null);
    }

    const singleValue = this.normalizeBranchValue(value as string | number | null | undefined);
    return singleValue === null ? [] : [singleValue];
  }

  private valueToInput(value: unknown, field: string): string | string[] {
    if (value === null || value === undefined) {
      return this.isBranchField(field) ? [] : '';
    }
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry));
    }
    if (this.isBranchField(field)) {
      const normalized = this.normalizeBranchValue(String(value));
      return normalized === null ? [] : [String(normalized)];
    }
    return String(value);
  }
}
