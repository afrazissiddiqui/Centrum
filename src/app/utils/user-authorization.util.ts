export type CrudBucket = 'create' | 'read' | 'update' | 'delete' | 'other';

export type UserAuthorizationModule = Record<string, number>;

export interface CrudPermissionEntry {
  key: string;
  actionKey: string;
  actionLabel: string;
  value: number;
  granted: boolean;
  bucket: CrudBucket;
}

export interface UserAuthorizationModuleRow {
  moduleName: string;
  moduleSlug: string;
  create: CrudPermissionEntry[];
  read: CrudPermissionEntry[];
  update: CrudPermissionEntry[];
  delete: CrudPermissionEntry[];
  other: CrudPermissionEntry[];
  grantedCount: number;
  totalCount: number;
}

export interface UserAuthorizationSummary {
  total: number;
  granted: number;
  modules: UserAuthorizationModuleRow[];
}

const CRUD_ACTION_MAP: Record<string, CrudBucket> = {
  add: 'create',
  create: 'create',
  list: 'read',
  view: 'read',
  detail: 'read',
  read: 'read',
  update: 'update',
  list_update: 'update',
  edit: 'update',
  delete: 'delete',
  remove: 'delete',
};

const EXTRA_ACTIONS = new Set(['export', 'import', 'approve', 'reject', 'print', 'download', 'upload']);

/** Known action suffixes — longest first so `list_update` wins over `update`. */
const KNOWN_ACTION_SUFFIXES = [
  'list_update',
  'add',
  'view',
  'list',
  'update',
  'delete',
  'create',
  'edit',
  'detail',
  'read',
  'remove',
  'export',
  'import',
  'approve',
  'reject',
  'print',
  'download',
  'upload',
] as const;

const KNOWN_ACTION_KEYS = new Set<string>([...KNOWN_ACTION_SUFFIXES, ...Array.from(EXTRA_ACTIONS), 'access']);

const MODULE_SLUG_ALIASES: Record<string, string> = {
  igp: 'igp_form',
  ogp: 'ogp_form',
  agp: 'agp_form',
  kpi: 'kpi_setup_form',
  'kpi_setup': 'kpi_setup_form',
  'kpi-setup': 'kpi_setup_form',
  'itr_setup': 'kpi_setup_form',
  'itr-setup': 'kpi_setup_form',
  itr_setup_form: 'kpi_setup_form',
  'itr-setup-form': 'kpi_setup_form',
};

function canonicalizeModuleSlug(moduleSlug: string): string {
  const normalized = moduleSlug.trim().toLowerCase();
  return MODULE_SLUG_ALIASES[normalized] ?? normalized;
}

const PERMISSION_KEY_OVERRIDES: Record<string, string> = {
  itr_setup_form_add: 'ITR_Setup_Form_add',
  itr_setup_form_list: 'ITR_Setup_Form_list',
  itr_setup_form_view: 'ITR_Setup_Form_view',
  itr_setup_form_update: 'ITR_Setup_Form_update',
  itr_setup_form_delete: 'ITR_Setup_Form_delete',
  kpi_setup_form_add: 'ITR_Setup_Form_add',
  kpi_setup_form_list: 'KPI_Setup_form_list',
  kpi_setup_form_view: 'KPI_Setup_form_view',
  kpi_setup_form_update: 'KPI_Setup_form_update',
  kpi_setup_form_delete: 'KPI_Setup_form_delete',
};

function permissionKeyForModule(moduleSlug: string, action: string): string {
  const canonicalSlug = canonicalizeModuleSlug(moduleSlug);
  const baseKey = `${canonicalSlug}_${action.trim().toLowerCase()}`;
  return PERMISSION_KEY_OVERRIDES[baseKey] ?? baseKey;
}

function isPlainActionPermissionObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (!keys.length) {
    return false;
  }

  return keys.every((key) => KNOWN_ACTION_KEYS.has(key.trim().toLowerCase()));
}

export const AUTHORIZATION_MODULE_DEFINITIONS = [
  {
    slug: 'job_specification',
    name: 'Job Specification',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'application_form',
    name: 'Application Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'probation_evaluation_form',
    name: 'Probation Evaluation Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'training_development_form',
    name: 'Training Development Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'performance_appraisal_form',
    name: 'Performance Appraisal Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'expense_reimbursment_form',
    name: 'Expense Reimbursment Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'loan_advance_form',
    name: 'Loan Advance Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'leave_application_form',
    name: 'Leave Application Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'termination_form',
    name: 'Employee Separation Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'payroll_processing_form',
    name: 'Payroll Processing Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'attendance_managment_form',
    name: 'Attendance Managment Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'tax_allowance_form',
    name: 'Tax Allowance Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'tax_computation_form',
    name: 'Tax Computation Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'igp_form',
    name: 'IGP Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'ogp_form',
    name: 'OGP Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'agp_form',
    name: 'AGP Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'gl_account_determination_form',
    name: 'GL Account Determination Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'user_setup_form',
    name: 'User Setup Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'leave_types_form',
    name: 'Leave Types Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'workstation_form',
    name: 'Workstation Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'overtime_list_form',
    name: 'Overtime List Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'master_form',
    name: 'Employee Shift Allocation Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'employee_roster_form',
    name: 'Employee Roster Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'withholding_tax_form',
    name: 'Withholding Tax Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'kpi_setup_form',
    name: 'KPI Setup Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'good_receipt_note_form',
    name: 'Good Receipt Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'delivery_form',
    name: 'Delivery Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'inventory_transfer_form',
    name: 'Inventory Transfer Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'good_issue_form',
    name: 'Good Issue Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'inventory_transfer_request_form',
    name: 'Inventory Transfer Request Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'receipt_from_production_form',
    name: 'Receipt From Production Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'issue_from_production_form',
    name: 'Issue For Production Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
  {
    slug: 'purchase_request_form',
    name: 'Purchase Request Form',
    actions: ['add', 'view', 'list', 'update', 'delete'] as const,
  },
] as const;

function humanizeSlug(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function splitPermissionKey(key: string): { moduleSlug: string; moduleName: string; actionKey: string; actionLabel: string } {
  const normalized = key.trim().toLowerCase();
  if (!normalized) {
    return {
      moduleSlug: key,
      moduleName: humanizeSlug(key),
      actionKey: key,
      actionLabel: 'Access',
    };
  }

  for (const actionKey of KNOWN_ACTION_SUFFIXES) {
    const suffix = `_${actionKey}`;
    if (normalized.endsWith(suffix)) {
      const moduleSlug = canonicalizeModuleSlug(normalized.slice(0, -suffix.length));
      if (moduleSlug) {
        return {
          moduleSlug,
          moduleName: humanizeSlug(moduleSlug),
          actionKey,
          actionLabel: humanizeSlug(actionKey),
        };
      }
    }
  }

  const parts = normalized.split('_').filter(Boolean);
  if (parts.length < 2) {
    return {
      moduleSlug: canonicalizeModuleSlug(normalized),
      moduleName: humanizeSlug(canonicalizeModuleSlug(normalized)),
      actionKey: normalized,
      actionLabel: 'Access',
    };
  }

  const actionKey = parts[parts.length - 1];
  const moduleSlug = canonicalizeModuleSlug(parts.slice(0, -1).join('_'));
  return {
    moduleSlug,
    moduleName: humanizeSlug(moduleSlug),
    actionKey,
    actionLabel: capitalize(actionKey),
  };
}

function resolveCrudBucket(actionKey: string): CrudBucket {
  if (CRUD_ACTION_MAP[actionKey]) {
    return CRUD_ACTION_MAP[actionKey];
  }
  if (EXTRA_ACTIONS.has(actionKey)) {
    return 'other';
  }
  return 'other';
}

const BACKEND_PERMISSION_VALUE_ALLOWED = 0;
const BACKEND_PERMISSION_VALUE_DENIED = 1;

/**
 * Internal permission encoding used by the frontend: `1` = allowed, `0` = denied.
 */
function normalizePermissionValue(value: unknown): number {
  if (value === true) {
    return 1;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
      return 1;
    }
    const parsed = Number.parseInt(normalized, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function normalizeBackendPermissionValue(value: unknown): number {
  if (value === true) {
    return 1;
  }
  if (value === false) {
    return 0;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === BACKEND_PERMISSION_VALUE_ALLOWED) {
      return 1;
    }
    if (value === BACKEND_PERMISSION_VALUE_DENIED) {
      return 0;
    }
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
      return 1;
    }
    if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
      return 0;
    }
    const parsed = Number.parseInt(normalized, 10);
    if (Number.isFinite(parsed)) {
      return parsed === BACKEND_PERMISSION_VALUE_ALLOWED ? 1 : 0;
    }
  }
  return 0;
}

function permissionValueToBackend(value: unknown): number {
  return normalizePermissionValue(value) === 1 ? BACKEND_PERMISSION_VALUE_ALLOWED : BACKEND_PERMISSION_VALUE_DENIED;
}

function resolvePermissionKeyCandidates(moduleSlug: string, action: string): string[] {
  return resolvePermissionAction(moduleSlug, action).map((candidate) => permissionKeyForModule(moduleSlug, candidate));
}

function buildModuleAuthorizationObject(
  moduleSlug: string,
  actions: readonly string[],
  values: UserAuthorizationModule = {},
): UserAuthorizationModule {
  const payload: UserAuthorizationModule = {};
  for (const action of actions) {
    const key = permissionKeyForModule(moduleSlug, action);
    const candidates = resolvePermissionKeyCandidates(moduleSlug, action);
    let normalizedValue = 0;
    for (const candidate of candidates) {
      if (candidate in values) {
        normalizedValue = normalizePermissionValue(values[candidate]);
        break;
      }
    }
    payload[key] = normalizedValue;
  }
  return payload;
}

export const DEFAULT_USER_AUTHORIZATION: UserAuthorizationModule[] =
  AUTHORIZATION_MODULE_DEFINITIONS.map((definition) =>
    buildModuleAuthorizationObject(definition.slug, definition.actions),
  );

function isGranted(value: number): boolean {
  return value === 1;
}

function isPermissionKey(key: string): boolean {
  return key.includes('_');
}

function isArrayLikeObject(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
}

function isModulePermissionObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return Object.keys(record).some((key) => isPermissionKey(key));
}

function normalizeAuthorizationObjects(value: unknown): Record<string, unknown>[] {
  if (!value) {
    return [];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    try {
      return normalizeAuthorizationObjects(JSON.parse(trimmed));
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeAuthorizationObjects(entry));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    if (isArrayLikeObject(record)) {
      return Object.keys(record)
        .sort((left, right) => Number(left) - Number(right))
        .flatMap((key) => normalizeAuthorizationObjects(record[key]));
    }

    const nestedModules = Object.values(record).filter((entry) => isModulePermissionObject(entry));
    if (nestedModules.length > 0 && nestedModules.length === Object.keys(record).length) {
      return nestedModules.flatMap((entry) => normalizeAuthorizationObjects(entry));
    }

    const actionObjects = Object.entries(record).filter(([, value]) => isPlainActionPermissionObject(value));
    if (actionObjects.length > 0 && actionObjects.length === Object.keys(record).length) {
      const normalized: Record<string, unknown> = {};
      for (const [moduleKey, modulePermissions] of actionObjects) {
        const moduleSlug = canonicalizeModuleSlug(moduleKey);
        for (const [actionKey, actionValue] of Object.entries(modulePermissions as Record<string, unknown>)) {
          normalized[permissionKeyForModule(moduleSlug, actionKey)] = actionValue;
        }
      }
      return [normalized];
    }

    if (Object.keys(record).some((key) => isPermissionKey(key))) {
      return [record];
    }
  }

  return [];
}

function emptyModuleRow(moduleSlug: string, moduleName: string): UserAuthorizationModuleRow {
  return {
    moduleSlug,
    moduleName,
    create: [],
    read: [],
    update: [],
    delete: [],
    other: [],
    grantedCount: 0,
    totalCount: 0,
  };
}

function pushToBucket(row: UserAuthorizationModuleRow, bucket: CrudBucket, entry: CrudPermissionEntry): void {
  row[bucket].push(entry);
  row.totalCount += 1;
  if (entry.granted) {
    row.grantedCount += 1;
  }
}

export function cloneAuthorization(modules: UserAuthorizationModule[]): UserAuthorizationModule[] {
  return modules.map((module) => ({ ...module }));
}

function moduleSlugFromObject(obj: Record<string, unknown>): string {
  const permissionEntryKey = Object.keys(obj).find((key) => isPermissionKey(key));
  if (!permissionEntryKey) {
    return '';
  }
  return splitPermissionKey(permissionEntryKey).moduleSlug;
}

export function buildAuthorizationTemplate(...sources: unknown[]): UserAuthorizationModule[] {
  const moduleMap = new Map<string, UserAuthorizationModule>();

  const ingest = (value: unknown): void => {
    for (const object of normalizeAuthorizationObjects(value)) {
      const entries = Object.entries(object).filter(([key]) => isPermissionKey(key));
      if (!entries.length) {
        continue;
      }

      const grouped = new Map<string, UserAuthorizationModule>();
      for (const [key, permissionValue] of entries) {
        const { moduleSlug } = splitPermissionKey(key);
        const module = grouped.get(moduleSlug) ?? {};
        module[key] = normalizeBackendPermissionValue(permissionValue);
        grouped.set(moduleSlug, module);
      }

      for (const [slug, normalized] of grouped) {
        moduleMap.set(slug, {
          ...(moduleMap.get(slug) ?? {}),
          ...normalized,
        });
      }
    }
  };

  for (const source of sources) {
    ingest(source);
  }

  for (const fallbackModule of DEFAULT_USER_AUTHORIZATION) {
    const slug = moduleSlugFromObject(fallbackModule);
    if (!slug) {
      continue;
    }
    moduleMap.set(slug, {
      ...fallbackModule,
      ...(moduleMap.get(slug) ?? {}),
    });
  }

  return AUTHORIZATION_MODULE_DEFINITIONS.map((definition) =>
    buildModuleAuthorizationObject(
      definition.slug,
      definition.actions,
      moduleMap.get(definition.slug) ?? {},
    ),
  );
}

export function authorizationToApiPayload(modules: UserAuthorizationModule[]): UserAuthorizationModule[] {
  const merged = new Map<string, UserAuthorizationModule>();
  for (const module of cloneAuthorization(modules)) {
    for (const [key, value] of Object.entries(module)) {
      if (!isPermissionKey(key)) {
        continue;
      }
      const { moduleSlug } = splitPermissionKey(key);
      const bucket = merged.get(moduleSlug) ?? {};
      bucket[key] = permissionValueToBackend(value);
      merged.set(moduleSlug, bucket);
    }
  }

  return AUTHORIZATION_MODULE_DEFINITIONS.map((definition) =>
    buildModuleAuthorizationObject(
      definition.slug,
      definition.actions,
      merged.get(definition.slug) ?? {},
    ),
  );
}

/** Flat module map for APIs that expect one authorization object instead of an array. */
export function authorizationToApiObject(modules: UserAuthorizationModule[]): UserAuthorizationModule {
  const merged: UserAuthorizationModule = {};
  for (const module of authorizationToApiPayload(modules)) {
    Object.assign(merged, module);
  }
  return merged;
}

/** JSON string form used by backends that store authorization as a serialized object. */
export function authorizationToApiJson(modules: UserAuthorizationModule[]): string {
  return JSON.stringify(authorizationToApiPayload(modules));
}

export function parseUserAuthorization(value: unknown): UserAuthorizationSummary | null {
  const objects = normalizeAuthorizationObjects(value);
  if (!objects.length) {
    return null;
  }

  const moduleMap = new Map<string, UserAuthorizationModuleRow>();

  for (const object of objects) {
    for (const [key, permissionValue] of Object.entries(object)) {
      if (!isPermissionKey(key)) {
        continue;
      }
      const { moduleSlug, moduleName, actionKey, actionLabel } = splitPermissionKey(key);
      const numericValue = normalizeBackendPermissionValue(permissionValue);
      const bucket = resolveCrudBucket(actionKey);
      const row = moduleMap.get(moduleSlug) ?? emptyModuleRow(moduleSlug, moduleName);

      pushToBucket(row, bucket, {
        key,
        actionKey,
        actionLabel,
        value: numericValue,
        granted: isGranted(numericValue),
        bucket,
      });

      moduleMap.set(moduleSlug, row);
    }
  }

  const modules = [...moduleMap.values()].sort((a, b) => a.moduleName.localeCompare(b.moduleName));
  const allPermissions = modules.flatMap((module) => [
    ...module.create,
    ...module.read,
    ...module.update,
    ...module.delete,
    ...module.other,
  ]);

  return {
    total: allPermissions.length,
    granted: allPermissions.filter((permission) => permission.granted).length,
    modules,
  };
}

export function crudBucketLabel(bucket: CrudBucket): string {
  switch (bucket) {
    case 'create':
      return 'Create';
    case 'read':
      return 'Read';
    case 'update':
      return 'Update';
    case 'delete':
      return 'Delete';
    default:
      return 'Other';
  }
}

export function crudBucketEntries(
  module: UserAuthorizationModuleRow,
  bucket: CrudBucket,
): CrudPermissionEntry[] {
  return module[bucket];
}

export function moduleAllEntries(module: UserAuthorizationModuleRow): CrudPermissionEntry[] {
  return [...module.create, ...module.read, ...module.update, ...module.delete, ...module.other];
}

export function updatePermissionInDraft(
  draft: UserAuthorizationModule[],
  key: string,
  value: number,
): UserAuthorizationModule[] {
  const normalized = value === 1 ? 1 : 0;
  return draft.map((module) => (key in module ? { ...module, [key]: normalized } : module));
}

export function updateModulePermissionsInDraft(
  draft: UserAuthorizationModule[],
  moduleSlug: string,
  granted: boolean,
): UserAuthorizationModule[] {
  const value = granted ? 1 : 0;
  return draft.map((module) => {
    const keys = Object.keys(module);
    const belongsToModule = keys.some((key) => splitPermissionKey(key).moduleSlug === moduleSlug);
    if (!belongsToModule) {
      return module;
    }

    const next = { ...module };
    for (const key of keys) {
      if (splitPermissionKey(key).moduleSlug === moduleSlug) {
        next[key] = value;
      }
    }
    return next;
  });
}

export function updateAllPermissionsInDraft(
  draft: UserAuthorizationModule[],
  granted: boolean,
): UserAuthorizationModule[] {
  const value = granted ? 1 : 0;
  return draft.map((module) => {
    const next = { ...module };
    for (const key of Object.keys(module)) {
      next[key] = value;
    }
    return next;
  });
}

export function permissionKey(moduleSlug: string, action: string): string {
  return permissionKeyForModule(moduleSlug, action);
}

function resolvePermissionAction(moduleSlug: string, action: string): string[] {
  const normalized = action.trim().toLowerCase();
  const slug = moduleSlug.trim().toLowerCase();

  if (slug === 'application_form' && (normalized === 'update' || normalized === 'edit')) {
    return ['list_update', 'update', 'edit', 'add'];
  }

  if (normalized === 'update' || normalized === 'edit') {
    return ['update', 'edit', 'add'];
  }

  return [normalized];
}

export function isPermissionGranted(
  authorization: UserAuthorizationModule[] | null | undefined,
  moduleSlug: string,
  action: string,
): boolean {
  if (!authorization?.length) {
    return false;
  }

  const slug = moduleSlug.trim().toLowerCase();
  const actionCandidates = resolvePermissionAction(slug, action);

  for (const candidate of actionCandidates) {
    const key = permissionKeyForModule(slug, candidate);
    for (const module of authorization) {
      if (key in module) {
        return normalizePermissionValue(module[key]) === 1;
      }
    }
  }

  return false;
}

export function humanizeModuleSlug(moduleSlug: string): string {
  return humanizeSlug(moduleSlug);
}
