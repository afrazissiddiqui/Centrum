import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, concatMap, forkJoin, from, last, map, of, scan, switchMap, tap } from 'rxjs';
import { apiUrl } from '../config/api.config';
import { formatDateOfBirthFromApi, formatDateForInput, formatDateToApiIso } from '../utils/date-format.util';
import { sanitizeApiText } from '../utils/api-text.util';
import { normalizeEmploymentStatus } from '../utils/employment-status.util';
import {
  glAccountBranchLabel,
  resolveBranchCode,
} from '../components/setup/gl-account-determination/gl-account-branch.options';

/** Extended payload captured from Create Application Form — shown in Application Form view modal only. */
export interface ApplicationFormPersonalInfo {
  personName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  fatherOrHusbandName: string;
  gender: string;
  maritalStatus: string;
  dateOfBirth: string;
  nationality: string;
  religion: string;
  bloodGroup: string;
  nationalIdCardNo: string;
  incomeTaxNo: string;
  contactNumber: string;
  emergencyContactNumber: string;
  street: string;
  streetNo: string;
  buildingFloorRoom: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  employmentNature: string;
  employmentCategory: string;
  employmentStatus: string;
  departmentInAhcp: string;
  designation: string;
  jobDescription: string;
  roleSalary: string;
  workGradeLevel: string;
  branchLocation: string;
  costCenter: string;
  reportingManager: string;
  remarks: string;
}

export interface ApplicationFormEducationRow {
  institute: string;
  institution: string;
  qualification: string;
  passingYear: string;
  fromDate: string;
  toDate: string;
  subject: string;
  awardedQualification: string;
  marksGrades: string;
  notes: string;
}

export interface ApplicationFormPastExperienceRow {
  company: string;
  position: string;
  designation: string;
  duration: string;
  fromDate: string;
  toDate: string;
  duties: string;
  remarks: string;
  lastSalary: string;
}

export interface ApplicationFormLeaveRow {
  leaveType: string;
  leavesAllocated: string;
  leavesAvailed: string;
  remainingLeave: string;
}

export interface ApplicationFormRemuneration {
  basicSalary: string;
  paymentMode: string;
  accountTitle: string;
  bankName: string;
  branchName: string;
  accountNo: string;
  accountType: string;
  effectiveDate: string;
  taxPercentage: string;
  dateOfJoining: string;
  advancePercentAllowed: string;
  loanAmountAllowed: string;
  overTimeApplicable: string;
  leaveType: string;
  leaveDays: string;
  leavesAvailed: string;
  remainingLeaves: string;
  totalLeaves: string;
  medicalAllowances: string;
  fuelAllowances: string;
  mobileAllowances: string;
  carAllowances: string;
  maximumLoanCapacity: string;
  maximumAdvanceCapacity: string;
  otherAllowances: string;
  allowancesApplicable: string;
  cashSalaryPercentage: string;
  eobiApplicable: string;
  socialSecurityApplicable: string;
  providentApplicable: string;
  fuelLimit: string;
  grauity: string;
  gratuityBalance: string;
  leaveEligibilityCriteria: string;
}

export interface ApplicationFormHrSettings {
  employeeMaster: string;
  salaryStructure: string;
  attendanceShiftManagement: string;
  leaveManagement: string;
  loanAdvancesForm: string;
  requestStatus: string;
}

export interface ApplicationFormLoginDetails {
  employeeCode: string;
  legacyCode?: string;
  employeeName: string;
  userId: string;
  password: string;
  status: string;
}

export interface ApplicationFormAttachmentMeta {
  type: string;
  attachmentFor?: string;
  fileName: string;
  fileUrl: string;
}

export interface ApplicationFormRequisition {
  copyExisting: boolean;
  reqId: string;
  internalJobTitle: string;
  hiringManager: string;
  recruiter: string;
  recruitmentCollaborator: string;
  requisitionAdministrator: string;
  recruitmentCoordinator: string;
  hrAdministrator: string;
  company: string;
  department: string;
  division: string;
  location: string;
  costCenter: string;
}

export interface ApplicationFormAssets {
  assetAllocated: string;
  assetOitmCode: string;
  allocationStatus: string;
  allocationDate: string;
  allocationDateType: string;
}

export interface ApplicationFormDetail {
  personalInfo: ApplicationFormPersonalInfo;
  education: ApplicationFormEducationRow[];
  pastExperience: ApplicationFormPastExperienceRow[];
  remuneration: ApplicationFormRemuneration;
  leaveManagement: ApplicationFormLeaveRow[];
  hrSettings: ApplicationFormHrSettings;
  loginDetails: ApplicationFormLoginDetails;
  attachments: ApplicationFormAttachmentMeta[];
  requisition: ApplicationFormRequisition;
  assets?: ApplicationFormAssets;
}

export interface ApplicationFormRecord {
  EmployeeCode: string;
  EmployeeName: string;
  /** External attendance card number from the employee profile. */
  ExtEmpNo?: string;
  Department: string;
  EmployeeNature: string;
  Designation: string;
  ReportingManager: string;
  EmploymentType: string;
  EmploymentStatus: string;
  EmploymentCategory: string;
  status: string;
  selected?: boolean;
  /** Backend record id for view/detail API */
  apiId?: string;
  /** Login user id — used for biometrics / attendance matching */
  userId?: string;
  /** Populated when loaded from view API or saved locally */
  detail?: ApplicationFormDetail;
}

export interface EmployeeRosterRow {
  employee_id: string;
  shift_date: string;
  shift: string;
  role: string;
  hub: string;
  note: string | null;
}

export interface EmployeeRosterAddPayload {
  data: EmployeeRosterRow[];
}

export interface EmployeeRosterListRecord {
  employee_id: string;
  employee_name: string;
  department: string;
  designation: string;
  employment_status: string;
  shift_date: string;
  shift: string;
  role: string;
  hub: string;
  note: string | null;
}

export interface EmployeeMasterDataRecord {
  EmployeeID: number;
  EmployeeName: string;
  Department: string;
  Designation: string;
  EmploymentType: string;
  EmployeeCategory: string;
  WorkLevel: string;
  EmploymentStatus: string;
  selected: boolean;
}

const EMPLOYEE_PROFILE_ADD_URL = apiUrl('employee-profile-add');
const EMPLOYEE_PROFILE_LIST_URL = apiUrl('employee-profile-list');
const EMPLOYEE_PROFILE_VIEW_URL = apiUrl('employee-profile-detail');
const EMPLOYEE_PROFILE_UPDATE_URL = apiUrl('employee-profile-update');
const EMPLOYEE_PROFILE_DELETE_URL = apiUrl('employee-profile-delete');

const LEGACY_EMPLOYEE_CODE_OVERRIDES = new Map<string, string>([
  ['Emp-00003283', 'Emp-00000254'],
  ['Emp-00003312', 'Emp-00000255'],
  ['Emp-00003313', 'Emp-00000256'],
  ['Emp-00003314', 'Emp-00000257'],
]);

export function canonicalizeEmployeeCodeValue(value: string): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed || trimmed === '—') {
    return trimmed;
  }

  const overridden = LEGACY_EMPLOYEE_CODE_OVERRIDES.get(trimmed);
  if (overridden) {
    return overridden;
  }

  const prefixMatch = trimmed.match(/^Emp[-\\s]?(\\d+)$/i);
  if (prefixMatch) {
    const code = Number.parseInt(prefixMatch[1], 10);
    if (Number.isFinite(code) && code > 0) {
      return `Emp-${String(code).padStart(8, '0')}`;
    }
  }

  return trimmed;
}
const EMPLOYEE_ROSTER_ADD_URL = apiUrl('employee-roster-add');
const EMPLOYEE_ROSTER_LIST_URL = apiUrl('employee-roster-list');

export interface EmployeeProfileEducationPayload {
  institute: string;
  qualification: string;
  passingYear: string;
  fromDate: string;
  toDate: string;
  subject: string;
  marksGrades: string;
  notes: string;
}

export interface EmployeeProfilePastExperiencePayload {
  company: string;
  designation: string;
  position: string;
  duties: string;
  duration: string;
  fromDate: string;
  toDate: string;
  lastSalary: string;
  remarks: string;
}

export interface EmployeeProfileAttachmentPayload {
  type: string;
  fileName: string;
  fileUrl: string;
}

export interface EmployeeProfileLeaveRowPayload {
  leaveType: string;
  leavesAllocated: string;
  leavesAvailed: string;
  remainingLeave: string;
}

export interface EmployeeProfileRemunerationPayload {
  basicSalary: string;
  paymentMode: string;
  accountTitle: string;
  bankName: string;
  branchName: string;
  accountNo: string;
  accountType: string;
  effectiveDate: string;
  taxPercentage: string;
  dateOfJoining: string;
  cashSalaryPercentage: string;
  advancePercentAllowed: string;
  maximumLoanCapacity: string;
  maximumAdvanceCapacity: string;
  overTimeApplicable: string;
  allowancesApplicable: string;
  eobiApplicable: string;
  socialSecurityApplicable: string;
  fuelLimit: string;
  medicalAllowances: string;
  fuelAllowances: string;
  mobileAllowances: string;
  carAllowances: string;
  otherAllowances: string;
}

export interface EmployeeProfileLoginDetailPayload {
  employeeCode: string;
  userId: string;
  loginEmployeeName: string;
  password: string;
  status: number;
}

export interface EmployeeProfileAssetsPayload {
  assetAllocated: string;
  allocationStatus: string;
  allocationDateType: string;
  allocationDate: string;
}

/** Flat employee profile body expected by employee-profile-add / update APIs. */
export interface EmployeeProfileAddPayload {
  jobSpecificationId?: string;
  personName: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fatherOrHusbandName: string;
  gender: string;
  maritalStatus: string;
  dateOfBirth: string;
  nationality: string;
  religion: string;
  bloodGroup: string;
  nationalIdCardNo: string;
  incomeTaxNo: string;
  employmentNature: string;
  employeeCategory: string;
  employmentCategory?: string | null;
  workGradeLevel?: string | null;
  employmentStatus: string;
  hiringManager: string | null;
  remarks: string | null;
  department: string;
  departmentInAhcp?: string | null;
  branchLocation: string;
  costCenter: string | null;
  designation: string;
  jobDescription: string;
  roleSalary: string;
  email?: string | null;
  cashSalaryPercentage: number | string | null;
  basicSalary: number | string;
  paymentMode: string;
  accountTitle: string;
  bankName: string;
  branchName: string | null;
  accountNo: string;
  accountType: string;
  effectiveDate: string;
  taxPercentage: number | string | null;
  dateOfJoining: string;
  advancePercentAllowed: number | string;
  loanAmountAllowed: number | string | null;
  maximumLoanCapacity: number | string | null;
  maximumAdvanceCapacity: number | string | null;
  overTimeApplicable: boolean;
  allowancesApplicable: boolean;
  eobiApplicable: boolean;
  providentApplicable: boolean;
  socialSecurityApplicable: boolean;
  medicalAllowances: number | string;
  fuelAllowances: number | string | null;
  mobileAllowances: number | string;
  carAllowances: number | string;
  otherAllowances: number | string;
  fuelLimit: number | string | null;
  gratuityBalance: number | string;
  leaveEligibilityCriteria: string | null;
  leaveType: string;
  leaveDays: number | string;
  leavesAvailed: number | string;
  remainingLeaves: number | string;
  totalLeaves: number | string;
  assetAllocated: string | null;
  allocationStatus: string | null;
  allocationDateType: string | null;
  allocationDate: string | null;
  assetRecovered: string | null;
  requestStatus: string;
  contactNumber: string;
  emergencyContactNumber: string;
  street: string;
  streetNo: string;
  buildingFloorRoom: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  educationSections: Array<{
    qualification: string;
    institution: string;
    passingYear: string;
    institute?: string;
    fromDate?: string | null;
    toDate?: string | null;
    subject?: string;
    awardedQualification?: string;
    marksGrades?: string;
    notes?: string;
  }>;
  pastExperienceSections: Array<{
    company: string;
    designation: string;
    duration: string;
    position?: string;
    duties?: string;
    fromDate?: string | null;
    toDate?: string | null;
    lastSalary?: string;
    remarks?: string;
  }>;
  attachments: Array<{ fileName: string; fileUrl: string | null; type?: string }>;
  employeeMaster: number | string | null;
  salaryStructure: string;
  attendanceShiftManagement: string | null;
  leaveManagement: string;
  leaveManagementRows?: Array<{
    leaveType: string;
    leavesAllocated: string;
    leavesAvailed: string;
    remainingLeave?: string;
  }>;
  loanAdvancesForm: string | null;
  employeeCode: string;
  userId: number | string;
  loginEmployeeName: string;
  password: string;
  status: number;
}

const REMUNERATION_FIELD_KEYS: ReadonlyArray<[camel: string, snake: string]> = [
  ['basicSalary', 'basic_salary'],
  ['paymentMode', 'payment_mode'],
  ['accountTitle', 'account_title'],
  ['bankName', 'bank_name'],
  ['branchName', 'branch_name'],
  ['accountNo', 'account_no'],
  ['accountType', 'account_type'],
  ['effectiveDate', 'effective_date'],
  ['taxPercentage', 'tax_percentage'],
  ['dateOfJoining', 'date_of_joining'],
  ['cashSalaryPercentage', 'cash_salary_percentage'],
  ['advancePercentAllowed', 'advance_percent_allowed'],
  ['maximumLoanCapacity', 'maximum_loan_capacity'],
  ['loanAmountAllowed', 'loan_amount_allowed'],
  ['overTimeApplicable', 'over_time_applicable'],
  ['allowancesApplicable', 'allowances_applicable'],
  ['eobiApplicable', 'eobi_applicable'],
  ['providentApplicable', 'provident_applicable'],
  ['socialSecurityApplicable', 'social_security_applicable'],
  ['fuelLimit', 'fuel_limit'],
  ['leaveEligibilityCriteria', 'leave_eligibility_criteria'],
  ['leaveType', 'leave_type'],
  ['leaveDays', 'leave_days'],
  ['leavesAvailed', 'leaves_availed'],
  ['remainingLeaves', 'remaining_leaves'],
  ['totalLeaves', 'total_leaves'],
  ['medicalAllowances', 'medical_allowances'],
  ['fuelAllowances', 'fuel_allowances'],
  ['mobileAllowances', 'mobile_allowances'],
  ['carAllowances', 'car_allowances'],
  ['maximumAdvanceCapacity', 'maximum_advance_capacity'],
  ['otherAllowances', 'other_allowances'],
];

const REMUNERATION_EXTRA_KEYS: Readonly<Record<string, readonly string[]>> = {
  basicSalary: ['grossSalary', 'gross_salary', 'GrossSalary', 'salaryOffer', 'salary_offer'],
  overTimeApplicable: [
    'overtimeApplicable',
    'overtime_applicable',
    'OvertimeApplicable',
    'Overtime_Applicable',
    'isOvertimeApplicable',
    'is_overtime_applicable',
  ],
  medicalAllowances: ['medicalAllowance', 'medical_allowance', 'MedicalAllowances', 'MedicalAllowance'],
  fuelAllowances: ['fuelAllowance', 'fuel_allowance', 'FuelAllowances', 'FuelAllowance'],
  fuelLimit: ['FuelLimit', 'fuel_limit', 'petrolLimit', 'petrol_limit', 'fuelLiters', 'fuel_liters', 'allowedLiters', 'allowed_liters'],
  mobileAllowances: ['mobileAllowance', 'mobile_allowance', 'MobileAllowances', 'MobileAllowance'],
  carAllowances: ['carAllowance', 'car_allowance', 'CarAllowances', 'CarAllowance'],
  otherAllowances: [
    'otherAllowance',
    'other_allowance',
    'OtherAllowances',
    'OtherAllowance',
    'packagePerks',
    'package_perks',
  ],
  maximumLoanCapacity: ['loanAmountAllowed', 'loan_amount_allowed', 'MaximumLoanCapacity', 'LoanAmountAllowed'],
  maximumAdvanceCapacity: ['advanceCapacity', 'advance_capacity', 'MaximumAdvanceCapacity', 'AdvanceCapacity'],
};

@Injectable({
  providedIn: 'root'
})
export class ApplicationFormService {
  private readonly http = inject(HttpClient);
  private readonly applicationRecords = signal<ApplicationFormRecord[]>([]);
  private readonly attachmentMetaCache = new Map<string, ApplicationFormAttachmentMeta[]>();
  private readonly profileSectionCache = new Map<
    string,
    {
      education: ApplicationFormEducationRow[];
      pastExperience: ApplicationFormPastExperienceRow[];
    }
  >();

  getApplicationRecords(): ApplicationFormRecord[] {
    return this.applicationRecords();
  }

  cacheEmployeeAttachments(identifier: string, attachments: ApplicationFormAttachmentMeta[]): void {
    const key = identifier.trim();
    if (!key || !attachments.length) {
      return;
    }
    this.attachmentMetaCache.set(
      key,
      attachments.map((attachment) => ({ ...attachment })),
    );
  }

  cacheEmployeeProfileSections(
    identifier: string,
    education: ApplicationFormEducationRow[],
    pastExperience: ApplicationFormPastExperienceRow[],
  ): void {
    const key = identifier.trim();
    if (!key || (!education.length && !pastExperience.length)) {
      return;
    }

    this.profileSectionCache.set(key, {
      education: education.map((row) => ({ ...row })),
      pastExperience: pastExperience.map((row) => ({ ...row })),
    });
  }

  extractApiIdFromResponse(response: unknown): string {
    if (!response || typeof response !== 'object') {
      return '';
    }
    const obj = response as Record<string, unknown>;
    const data = obj['data'];
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const nestedId = (data as Record<string, unknown>)['id'];
      if (nestedId !== undefined && nestedId !== null) {
        return String(nestedId).trim();
      }
    }
    const id = obj['id'];
    return id !== undefined && id !== null ? String(id).trim() : '';
  }

  resolveAttachmentForLabel(attachment: ApplicationFormAttachmentMeta): string {
    return attachment.type?.trim() || attachment.attachmentFor?.trim() || '';
  }

  private mergeAttachmentsWithCache(
    identifiers: Array<string | number | undefined | null>,
    attachments: ApplicationFormAttachmentMeta[],
  ): ApplicationFormAttachmentMeta[] {
    let cached: ApplicationFormAttachmentMeta[] | undefined;
    for (const identifier of identifiers) {
      if (identifier === undefined || identifier === null) {
        continue;
      }
      const key = String(identifier).trim();
      if (key && this.attachmentMetaCache.has(key)) {
        cached = this.attachmentMetaCache.get(key);
        break;
      }
    }

    if (!cached?.length) {
      return attachments;
    }

    return attachments.map((attachment, index) => {
      const cachedMatch =
        cached![index] ??
        cached!.find(
          (item) =>
            item.fileName === attachment.fileName &&
            (item.fileUrl === attachment.fileUrl || !item.fileUrl || !attachment.fileUrl),
        ) ??
        cached!.find((item) => item.fileName === attachment.fileName);

      const label =
        attachment.type ||
        attachment.attachmentFor ||
        cachedMatch?.type ||
        cachedMatch?.attachmentFor ||
        '';

      return {
        ...attachment,
        type: label,
        attachmentFor: label,
      };
    });
  }

  private mergeProfileSectionsWithCache(
    identifiers: Array<string | number | undefined | null>,
    education: ApplicationFormEducationRow[],
    pastExperience: ApplicationFormPastExperienceRow[],
  ): {
    education: ApplicationFormEducationRow[];
    pastExperience: ApplicationFormPastExperienceRow[];
  } {
    if (education.length || pastExperience.length) {
      return { education, pastExperience };
    }

    for (const identifier of identifiers) {
      if (identifier === undefined || identifier === null) {
        continue;
      }

      const key = String(identifier).trim();
      const cached = key ? this.profileSectionCache.get(key) : undefined;
      if (cached && (cached.education.length || cached.pastExperience.length)) {
        return {
          education: cached.education.map((row) => ({ ...row })),
          pastExperience: cached.pastExperience.map((row) => ({ ...row })),
        };
      }
    }

    return { education, pastExperience };
  }

  getNextEmployeeCode(): number {
    const records = this.applicationRecords();
    if (records.length === 0) {
      return 1;
    }

    const parsedCodes = records
      .map((record) => this.parseEmployeeCodeSequence(record.EmployeeCode))
      .filter((value): value is number => value > 0)
      .sort((left, right) => left - right);

    if (parsedCodes.length === 0) {
      return 1;
    }

    let latestCode = parsedCodes[0];
    for (let index = 1; index < parsedCodes.length; index += 1) {
      const currentCode = parsedCodes[index];
      const gap = currentCode - latestCode;
      if (gap <= 1000) {
        latestCode = currentCode;
      } else {
        break;
      }
    }

    return latestCode + 1;
  }

  normalizeEmployeeCodeValue(value: string): string {
    return canonicalizeEmployeeCodeValue(value);
  }

  parseEmployeeCodeSequence(value: string): number {
    const trimmed = String(value ?? '').trim();
    if (!trimmed || trimmed === '—') {
      return 0;
    }

    const normalized = this.normalizeEmployeeCodeValue(trimmed);
    const direct = Number.parseInt(normalized, 10);
    if (Number.isFinite(direct) && direct > 0 && String(direct) === normalized) {
      return direct;
    }

    const match = normalized.match(/(\d+)$/);
    if (match) {
      return Number.parseInt(match[1], 10) || 0;
    }

    return 0;
  }

  formatEmployeeUserId(code: number): string {
    return `Emp-${String(code).padStart(8, '0')}`;
  }

  addApplicationRecord(record: ApplicationFormRecord): void {
    this.applicationRecords.update((list) => [...list, record]);
  }

  upsertApplicationRecord(record: ApplicationFormRecord): void {
    this.applicationRecords.update((list) => {
      const index = list.findIndex((item) =>
        record.apiId
          ? item.apiId === record.apiId
          : item.EmployeeCode === record.EmployeeCode,
      );
      if (index === -1) {
        return [...list, record];
      }

      const next = [...list];
      next[index] = {
        ...next[index],
        ...record,
        detail: record.detail ?? next[index].detail,
      };
      return next;
    });
  }

  removeApplicationRecord(record: ApplicationFormRecord): void {
    this.applicationRecords.update((list) =>
      list.filter((item) =>
        record.apiId
          ? item.apiId !== record.apiId
          : item.EmployeeCode !== record.EmployeeCode,
      ),
    );
  }

  addEmployeeProfile(payload: EmployeeProfileAddPayload): Observable<unknown> {
    return this.http.post(EMPLOYEE_PROFILE_ADD_URL, this.serializeEmployeeProfilePayload(payload));
  }

  addEmployeeRoster(payload: EmployeeRosterAddPayload): Observable<unknown> {
    return this.http.post(EMPLOYEE_ROSTER_ADD_URL, payload);
  }

  fetchEmployeeRosterList(): Observable<EmployeeRosterListRecord[]> {
    return this.http.get<unknown>(EMPLOYEE_ROSTER_LIST_URL).pipe(
      map((response) => this.extractApiItems(response).map((item) => this.mapApiItemToEmployeeRoster(item))),
    );
  }

  updateEmployeeProfile(id: string | number, payload: EmployeeProfileAddPayload): Observable<unknown> {
    const identifier = encodeURIComponent(String(id));
    return this.http.post(
      `${EMPLOYEE_PROFILE_UPDATE_URL}/${identifier}`,
      this.serializeEmployeeProfilePayload(payload),
    );
  }

  deleteEmployeeProfile(id: string | number): Observable<unknown> {
    const identifier = encodeURIComponent(String(id));
    return this.http.delete(`${EMPLOYEE_PROFILE_DELETE_URL}/${identifier}`);
  }

  fetchEmployeeProfiles(): Observable<ApplicationFormRecord[]> {
    return this.http.get<unknown>(EMPLOYEE_PROFILE_LIST_URL).pipe(
      map((response) =>
        this.extractApiItems(response).map((item) => {
          const normalized = this.normalizeEmployeeProfileItem(item) ?? item;
          return this.mapApiItemToFullRecord(normalized);
        }),
      ),
      tap((records) => {
        this.applicationRecords.set(records);
      }),
    );
  }

  /** Serializes application form detail into the flat API payload shape. */
  buildFlatEmployeeProfilePayload(
    detail: ApplicationFormDetail,
    options: {
      jobSpecificationId?: string;
      education?: ApplicationFormEducationRow[];
      pastExperience?: ApplicationFormPastExperienceRow[];
    } = {},
  ): EmployeeProfileAddPayload {
    const personal = detail.personalInfo;
    const remuneration = detail.remuneration;
    const login = detail.loginDetails;
    const hr = detail.hrSettings;
    const assets = detail.assets;
    const primaryLeave = detail.leaveManagement[0] ?? {
      leaveType: '',
      leavesAllocated: '',
      leavesAvailed: '',
      remainingLeave: '',
    };

    const toApiNumber = (value: string): number | string => {
      const trimmed = value.trim();
      if (!trimmed) {
        return '';
      }
      const numeric = Number.parseFloat(trimmed.replace(/,/g, ''));
      return Number.isFinite(numeric) ? numeric : trimmed;
    };

    const toNullableApiNumber = (value: string): number | string | null => {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const numeric = Number.parseFloat(trimmed.replace(/,/g, ''));
      return Number.isFinite(numeric) ? numeric : trimmed;
    };

    const toApiDate = (value: string): string => {
      const trimmed = value.trim();
      if (!trimmed) {
        return '';
      }
      return formatDateToApiIso(trimmed);
    };

    const toApiFlag = (value: string, defaultValue = false): boolean => {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return defaultValue;
      }
      if (normalized === 'yes' || normalized === 'true' || normalized === '1') {
        return true;
      }
      if (normalized === 'no' || normalized === 'false' || normalized === '0') {
        return false;
      }
      return defaultValue;
    };

    const toLoginStatusNumber = (): number => {
      const raw = String(login.status ?? '').trim();
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : 1;
    };

    const paymentModeForApi = (mode: string): string => {
      if (mode === 'Bank') {
        return 'Bank Transfer';
      }
      return mode;
    };

    const leaveDays = primaryLeave.leavesAllocated || remuneration.leaveDays;
    const leavesAvailed = primaryLeave.leavesAvailed || remuneration.leavesAvailed;
    const remainingLeaves = primaryLeave.remainingLeave || remuneration.remainingLeaves;

    const toNullableString = (value: string | undefined | null): string | null => {
      const trimmed = sanitizeApiText(value);
      return trimmed || null;
    };

    const reportingManager = personal.reportingManager || detail.requisition.hiringManager;
    const branchCode = resolveBranchCode(
      personal.branchLocation || detail.requisition.location || '',
    );
    const educationSource = options.education ?? detail.education ?? [];
    const experienceSource = options.pastExperience ?? detail.pastExperience ?? [];
    const educationRows = this.filterEducationRows(educationSource);
    const experienceRows = this.filterPastExperienceRows(experienceSource);
    const mappedEducation = educationRows.map((row) =>
      this.mapEducationRowForApi(row, toApiDate, toNullableString),
    );
    const mappedExperience = experienceRows.map((row) =>
      this.mapPastExperienceRowForApi(row, toApiDate, toNullableString),
    );

    return {
      jobSpecificationId: options.jobSpecificationId?.trim() || detail.requisition.reqId || undefined,
      personName: personal.personName,
      firstName: personal.firstName,
      middleName: toNullableString(personal.middleName),
      lastName: personal.lastName,
      fatherOrHusbandName: personal.fatherOrHusbandName,
      email: null,
      gender: personal.gender,
      maritalStatus: personal.maritalStatus,
      dateOfBirth: toApiDate(personal.dateOfBirth) || personal.dateOfBirth,
      nationality: personal.nationality,
      religion: personal.religion,
      bloodGroup: personal.bloodGroup,
      nationalIdCardNo: personal.nationalIdCardNo,
      incomeTaxNo: personal.incomeTaxNo,
      employmentNature: personal.employmentNature,
      employeeCategory: personal.employmentCategory,
      employmentCategory: toNullableString(personal.employmentCategory),
      workGradeLevel: toNullableString(personal.workGradeLevel || personal.roleSalary),
      hiringManager: toNullableString(reportingManager),
      remarks: toNullableString(personal.remarks),
      employmentStatus:
        normalizeEmploymentStatus(personal.employmentStatus) || 'Permanent',
      department: detail.requisition.department || personal.departmentInAhcp,
      departmentInAhcp: toNullableString(personal.departmentInAhcp),
      designation: personal.designation,
      jobDescription: personal.jobDescription,
      roleSalary: personal.roleSalary || personal.workGradeLevel,
      costCenter: toNullableString(personal.costCenter),
      cashSalaryPercentage: toNullableApiNumber(remuneration.cashSalaryPercentage),
      basicSalary: toApiNumber(remuneration.basicSalary),
      paymentMode: paymentModeForApi(remuneration.paymentMode),
      accountTitle: remuneration.accountTitle,
      bankName: remuneration.bankName,
      branchName: toNullableString(remuneration.branchName),
      branchLocation: branchCode,
      accountNo: remuneration.accountNo,
      accountType: remuneration.accountType,
      effectiveDate: toApiDate(remuneration.effectiveDate),
      taxPercentage: toNullableApiNumber(remuneration.taxPercentage),
      dateOfJoining: toApiDate(remuneration.dateOfJoining),
      advancePercentAllowed: toApiNumber(remuneration.advancePercentAllowed),
      loanAmountAllowed: toNullableApiNumber(
        remuneration.loanAmountAllowed || remuneration.maximumLoanCapacity,
      ),
      maximumLoanCapacity: toNullableApiNumber(remuneration.maximumLoanCapacity),
      maximumAdvanceCapacity: toNullableApiNumber(remuneration.maximumAdvanceCapacity),
      overTimeApplicable: toApiFlag(remuneration.overTimeApplicable),
      allowancesApplicable: toApiFlag(remuneration.allowancesApplicable),
      eobiApplicable: toApiFlag(remuneration.eobiApplicable),
      providentApplicable: toApiFlag(remuneration.providentApplicable),
      socialSecurityApplicable: toApiFlag(remuneration.socialSecurityApplicable),
      fuelLimit: this.parseFuelLimitForApi(remuneration.fuelLimit),
      leaveType: primaryLeave.leaveType || remuneration.leaveType,
      leaveDays: toApiNumber(leaveDays),
      leavesAvailed: toApiNumber(leavesAvailed),
      remainingLeaves: toApiNumber(remainingLeaves),
      totalLeaves: toApiNumber(leaveDays || remuneration.totalLeaves),
      leaveEligibilityCriteria: toNullableString(remuneration.leaveEligibilityCriteria),
      medicalAllowances: toApiNumber(remuneration.medicalAllowances),
      fuelAllowances: toNullableApiNumber(remuneration.fuelAllowances),
      mobileAllowances: toApiNumber(remuneration.mobileAllowances),
      carAllowances: toApiNumber(remuneration.carAllowances),
      otherAllowances: toApiNumber(remuneration.otherAllowances),
      gratuityBalance: toApiNumber(remuneration.gratuityBalance || remuneration.grauity),
      assetAllocated: toNullableString(assets?.assetAllocated),
      allocationStatus: toNullableString(assets?.allocationStatus),
      allocationDateType: toNullableString(assets?.allocationDateType),
      allocationDate: assets?.allocationDate?.trim()
        ? toApiDate(assets.allocationDate)
        : null,
      assetRecovered:
        assets?.allocationStatus?.trim().toLowerCase() === 'recovered'
          ? 'Yes'
          : null,
      requestStatus: hr.requestStatus?.trim() || 'Pending',
      contactNumber: personal.contactNumber,
      emergencyContactNumber: personal.emergencyContactNumber,
      street: personal.street,
      streetNo: personal.streetNo,
      buildingFloorRoom: toNullableString(personal.buildingFloorRoom) ?? '',
      city: personal.city,
      state: personal.state,
      country: personal.country,
      zipCode: personal.zipCode,
      educationSections: mappedEducation,
      pastExperienceSections: mappedExperience,
      attachments: detail.attachments.map((row) => ({
        fileName: row.fileName,
        fileUrl: row.fileUrl || null,
        type: row.type || row.attachmentFor,
      })),
      employeeMaster: toNullableApiNumber(hr.employeeMaster),
      salaryStructure: hr.salaryStructure || personal.workGradeLevel || personal.roleSalary,
      attendanceShiftManagement: toNullableString(hr.attendanceShiftManagement),
      leaveManagement: hr.leaveManagement?.trim() || 'Enabled',
      leaveManagementRows: detail.leaveManagement.map((row) => ({
        leaveType: row.leaveType,
        leavesAllocated: row.leavesAllocated,
        leavesAvailed: row.leavesAvailed,
        remainingLeave: row.remainingLeave,
      })),
      loanAdvancesForm: toNullableString(hr.loanAdvancesForm),
      employeeCode: login.employeeCode,
      userId: toApiNumber(login.userId) || login.userId,
      loginEmployeeName: login.employeeName,
      password: login.password,
      status: toLoginStatusNumber(),
    };
  }

  private filterEducationRows(rows: ApplicationFormEducationRow[]): ApplicationFormEducationRow[] {
    return rows.filter((row) =>
      [
        row.qualification,
        row.institute,
        row.institution,
        row.passingYear,
        row.fromDate,
        row.toDate,
        row.subject,
        row.awardedQualification,
        row.marksGrades,
        row.notes,
      ].some((value) => String(value ?? '').trim()),
    );
  }

  private filterPastExperienceRows(
    rows: ApplicationFormPastExperienceRow[],
  ): ApplicationFormPastExperienceRow[] {
    return rows.filter((row) =>
      [
        row.company,
        row.position,
        row.designation,
        row.duration,
        row.fromDate,
        row.toDate,
        row.duties,
        row.remarks,
        row.lastSalary,
      ].some((value) => String(value ?? '').trim()),
    );
  }

  private mapEducationRowForApi(
    row: ApplicationFormEducationRow,
    toApiDate: (value: string) => string,
    toNullableString: (value: string | undefined | null) => string | null,
  ): EmployeeProfileAddPayload['educationSections'][number] {
    const institution = sanitizeApiText(row.institution || row.institute);
    const fromDate = toApiDate(row.fromDate);
    const toDate = toApiDate(row.toDate);

    return {
      qualification: sanitizeApiText(row.qualification),
      institution,
      institute: institution,
      passingYear: sanitizeApiText(row.passingYear),
      fromDate: fromDate || null,
      toDate: toDate || null,
      subject: toNullableString(row.subject) ?? '',
      awardedQualification: toNullableString(row.awardedQualification) ?? '',
      marksGrades: toNullableString(row.marksGrades) ?? '',
      notes: toNullableString(row.notes) ?? '',
    };
  }

  private mapPastExperienceRowForApi(
    row: ApplicationFormPastExperienceRow,
    toApiDate: (value: string) => string,
    toNullableString: (value: string | undefined | null) => string | null,
  ): EmployeeProfileAddPayload['pastExperienceSections'][number] {
    const designation = sanitizeApiText(row.designation || row.position);
    const fromDate = toApiDate(row.fromDate);
    const toDate = toApiDate(row.toDate);

    return {
      company: sanitizeApiText(row.company),
      designation,
      position: designation,
      duration: sanitizeApiText(row.duration),
      duties: toNullableString(row.duties) ?? '',
      fromDate: fromDate || null,
      toDate: toDate || null,
      lastSalary: toNullableString(row.lastSalary) ?? '',
      remarks: toNullableString(row.remarks) ?? '',
    };
  }

  private mapEducationSectionsSnakeCase(
    rows: EmployeeProfileAddPayload['educationSections'],
  ): Array<Record<string, string | null>> {
    return rows.map((row) => ({
      qualification: row.qualification || null,
      institution: row.institution || row.institute || null,
      institute: row.institute || row.institution || null,
      passing_year: row.passingYear || null,
      from_date: row.fromDate || null,
      to_date: row.toDate || null,
      subject: row.subject || null,
      awarded_qualification: row.awardedQualification || null,
      marks_grades: row.marksGrades || null,
      notes: row.notes || null,
    }));
  }

  private mapPastExperienceSectionsSnakeCase(
    rows: EmployeeProfileAddPayload['pastExperienceSections'],
  ): Array<Record<string, string | null>> {
    return rows.map((row) => ({
      company: row.company || null,
      designation: row.designation || row.position || null,
      position: row.position || row.designation || null,
      duration: row.duration || null,
      duties: row.duties || null,
      from_date: row.fromDate || null,
      to_date: row.toDate || null,
      last_salary: row.lastSalary || null,
      remarks: row.remarks || null,
    }));
  }

  /** Builds nested remuneration object expected by employee-profile add/update APIs. */
  private buildApiRemunerationObject(
    payload: EmployeeProfileAddPayload,
  ): Record<string, unknown> {
    return {
      basicSalary: payload.basicSalary,
      paymentMode: payload.paymentMode,
      accountTitle: payload.accountTitle,
      bankName: payload.bankName,
      branchName: payload.branchName,
      accountNo: payload.accountNo,
      accountType: payload.accountType,
      costCenter: payload.costCenter,
      effectiveDate: payload.effectiveDate,
      taxPercentage: payload.taxPercentage,
      dateOfJoining: payload.dateOfJoining,
      cashSalaryPercentage: payload.cashSalaryPercentage,
      advancePercentAllowed: payload.advancePercentAllowed,
      maximumLoanCapacity: payload.maximumLoanCapacity,
      maximumAdvanceCapacity: payload.maximumAdvanceCapacity,
      overTimeApplicable: payload.overTimeApplicable,
      allowancesApplicable: payload.allowancesApplicable,
      allowances_applicable: payload.allowancesApplicable,
      eobiApplicable: payload.eobiApplicable,
      eobi_applicable: payload.eobiApplicable,
      providentApplicable: payload.providentApplicable,
      provident_applicable: payload.providentApplicable,
      socialSecurityApplicable: payload.socialSecurityApplicable,
      fuelLimit: payload.fuelLimit,
      leaveEligibilityCriteria: payload.leaveEligibilityCriteria,
      leaveType: payload.leaveType,
      leaveDays: payload.leaveDays,
      leavesAvailed: payload.leavesAvailed,
      remainingLeaves: payload.remainingLeaves,
      medicalAllowances: payload.medicalAllowances,
      fuelAllowances: payload.fuelAllowances,
      mobileAllowances: payload.mobileAllowances,
      carAllowances: payload.carAllowances,
      otherAllowances: payload.otherAllowances,
      gratuity_balance: payload.gratuityBalance,
    };
  }

  private buildApiAssetsObject(payload: EmployeeProfileAddPayload): Record<string, unknown> {
    return {
      assetAllocated: payload.assetAllocated,
      allocationStatus: payload.allocationStatus,
      allocationDateType: payload.allocationDateType,
      allocationDate: payload.allocationDate,
    };
  }

  private buildApiLoginDetailObject(payload: EmployeeProfileAddPayload): Record<string, unknown> {
    return {
      employeeCode: payload.employeeCode,
      loginEmployeeName: payload.loginEmployeeName,
      employeeName: payload.loginEmployeeName,
      userId: payload.userId,
      password: payload.password,
      status: payload.status,
    };
  }

  private mapLeaveManagementRowsForApi(
    rows: NonNullable<EmployeeProfileAddPayload['leaveManagementRows']>,
  ): Array<Record<string, unknown>> {
    return rows.map((row) => ({
      leaveType: row.leaveType,
      leave_type: row.leaveType,
      leavesAllocated: row.leavesAllocated,
      leaves_allocated: row.leavesAllocated,
      leavesAvailed: row.leavesAvailed,
      leaves_availed: row.leavesAvailed,
      remainingLeave: row.remainingLeave ?? '',
      remaining_leave: row.remainingLeave ?? '',
    }));
  }

  /** Ensures section arrays are sent in every shape the backend may accept. */
  private serializeEmployeeProfilePayload(
    payload: EmployeeProfileAddPayload,
  ): Record<string, unknown> {
    const educationSections = payload.educationSections ?? [];
    const pastExperienceSections = payload.pastExperienceSections ?? [];
    const leaveManagementRows = payload.leaveManagementRows ?? [];

    return {
      ...payload,
      fuel_limit: payload.fuelLimit,
      remuneration: this.buildApiRemunerationObject(payload),
      assets: this.buildApiAssetsObject(payload),
      loginDetail: this.buildApiLoginDetailObject(payload),
      leaveManagement: this.mapLeaveManagementRowsForApi(leaveManagementRows),
      educationSections,
      education_sections: this.mapEducationSectionsSnakeCase(educationSections),
      education: educationSections,
      pastExperienceSections,
      past_experience_sections: this.mapPastExperienceSectionsSnakeCase(pastExperienceSections),
      pastExperience: pastExperienceSections,
    };
  }

  /**
   * Loads list summaries then enriches with profile detail so login userId
   * (e.g. 00000003) is available for biometrics matching.
   */
  fetchEmployeeProfilesForAttendance(): Observable<ApplicationFormRecord[]> {
    return this.fetchEmployeeProfiles().pipe(
      switchMap((records) => {
        if (records.length === 0) {
          return of<ApplicationFormRecord[]>([]);
        }

        const enrichable = records.filter((record) => !!record.apiId?.trim());
        if (enrichable.length === 0) {
          return of(records);
        }

        return this.fetchEmployeeProfileDetailsInBatches(enrichable, 8).pipe(
          last(),
          map((detailed) => this.mergeEmployeeProfileRecords(records, detailed)),
          catchError(() => of(records)),
        );
      }),
    );
  }

  mergeEmployeeProfileRecordsForAttendance(
    summaries: ApplicationFormRecord[],
    detailed: ApplicationFormRecord[],
  ): ApplicationFormRecord[] {
    return this.mergeEmployeeProfileRecords(summaries, detailed);
  }

  private mergeEmployeeProfileRecords(
    summaries: ApplicationFormRecord[],
    detailed: ApplicationFormRecord[],
  ): ApplicationFormRecord[] {
    if (detailed.length === 0) {
      return summaries;
    }

    const detailByKey = new Map<string, ApplicationFormRecord>();
    for (const record of detailed) {
      const keys = new Set<string>();
      for (const key of [record.apiId, record.userId, record.EmployeeCode, record.detail?.loginDetails.userId]) {
        const normalized = key?.trim();
        if (!normalized) {
          continue;
        }
        keys.add(normalized);
        if (/^\d+$/.test(normalized)) {
          keys.add(normalized.padStart(8, '0'));
        }
        const empMatch = normalized.match(/^Emp-(\d+)$/i);
        if (empMatch) {
          keys.add(empMatch[1].padStart(8, '0'));
        }
      }

      for (const key of keys) {
        detailByKey.set(key, record);
      }
    }

    return summaries.map((summary) => {
      const candidates = [summary.apiId, summary.userId, summary.EmployeeCode]
        .map((value) => value?.trim())
        .filter(Boolean) as string[];

      for (const key of candidates) {
        const match = detailByKey.get(key);
        if (match) {
          return match;
        }
      }

      return summary;
    });
  }

  fetchEmployeeProfileDetail(id: string | number): Observable<ApplicationFormRecord> {
    const identifier = encodeURIComponent(String(id));
    return this.http.get<unknown>(`${EMPLOYEE_PROFILE_VIEW_URL}/${identifier}`).pipe(
      map((response) => {
        const item = this.extractApiSingle(response);
        if (!item) {
          throw new Error('Employee profile not found.');
        }
        return this.mapApiItemToFullRecord(item);
      }),
    );
  }

  /**
   * Loads employee profile details in small batches to avoid API rate limits (HTTP 429).
   * Emits the accumulated list after each batch so callers can render progressively.
   */
  fetchEmployeeProfileDetailsInBatches(
    records: ApplicationFormRecord[],
    batchSize = 5,
  ): Observable<ApplicationFormRecord[]> {
    const targets = records.filter((record) => !!record.apiId);
    if (targets.length === 0) {
      return of([]);
    }

    const safeBatchSize = Math.max(1, batchSize);

    return from(this.chunkRecords(targets, safeBatchSize)).pipe(
      concatMap((batch) =>
        forkJoin(
          batch.map((record) =>
            this.fetchEmployeeProfileDetail(record.apiId!).pipe(
              catchError(() => of(record)),
            ),
          ),
        ),
      ),
      scan((allResults, batchResults) => [...allResults, ...batchResults], [] as ApplicationFormRecord[]),
    );
  }

  private chunkRecords<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private extractApiSingle(response: unknown): Record<string, unknown> | null {
    if (!response || typeof response !== 'object') {
      return null;
    }
    if (Array.isArray(response)) {
      const first = response[0];
      if (!first || typeof first !== 'object') {
        return null;
      }
      return this.normalizeEmployeeProfileItem(first as Record<string, unknown>);
    }

    return this.normalizeEmployeeProfileItem(response as Record<string, unknown>);
  }

  private normalizeEmployeeProfileItem(wrapper: Record<string, unknown>): Record<string, unknown> | null {
    const unwrapped = this.unwrapEmployeeProfileRecord(wrapper);
    if (!unwrapped) {
      return null;
    }

    let merged = this.mergeFlatRemunerationFields(wrapper, unwrapped);

    for (const key of ['data', 'Data', 'result', 'Result']) {
      const nested = this.pickNestedRecord(wrapper[key]);
      if (nested && nested !== unwrapped) {
        merged = this.mergeFlatRemunerationFields(nested, merged);
        merged = this.mergeProfileCollections(nested, merged);
      }
    }

    merged = this.mergeProfileCollections(wrapper, merged);
    merged = this.mergeProfileCollections(unwrapped, merged);

    const resolvedRemuneration = this.resolveRemunerationSource(merged);
    if (Object.keys(resolvedRemuneration).length === 0) {
      return merged;
    }

    const existingNested = this.pickNestedRecord(merged['remuneration']);
    return {
      ...merged,
      remuneration: {
        ...(existingNested ?? {}),
        ...resolvedRemuneration,
      },
    };
  }

  private unwrapEmployeeProfileRecord(
    obj: Record<string, unknown>,
    ancestors: Record<string, unknown>[] = [],
  ): Record<string, unknown> | null {
    if (this.looksLikeEmployeeProfileRecord(obj)) {
      let result = { ...obj };
      for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        result = this.mergeFlatRemunerationFields(ancestors[index], result);
        result = this.mergeProfileCollections(ancestors[index], result);
      }
      result = this.mergeFlatRemunerationFields(obj, result);
      result = this.mergeProfileCollections(obj, result);
      return result;
    }

    const nestedKeys = [
      'data',
      'Data',
      'employee',
      'Employee',
      'profile',
      'Profile',
      'user',
      'User',
      'employeeProfile',
      'employee_profile',
      'EmployeeProfile',
      'result',
      'Result',
    ];

    const nextAncestors = [...ancestors, obj];
    for (const key of nestedKeys) {
      const nested = obj[key];
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const unwrapped = this.unwrapEmployeeProfileRecord(
          nested as Record<string, unknown>,
          nextAncestors,
        );
        if (unwrapped) {
          let merged = this.mergeFlatRemunerationFields(obj, unwrapped);
          merged = this.mergeProfileCollections(obj, merged);
          return merged;
        }
      }
    }

    return this.looksLikeEmployeeProfileRecord(obj) ? obj : null;
  }

  private mergeFlatRemunerationFields(
    source: Record<string, unknown>,
    target: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged = { ...target };
    const layers = [source, this.resolveRemunerationSource(source)];

    for (const layer of layers) {
      if (!layer || Object.keys(layer).length === 0) {
        continue;
      }

      for (const [camel, snake] of REMUNERATION_FIELD_KEYS) {
        const flatValue = this.pickRemunerationRawValue(layer, camel, snake);
        if (flatValue !== '' && this.pickRemunerationRawValue(merged, camel, snake) === '') {
          merged[camel] = flatValue;
        }
      }
    }

    const resolvedRemuneration = this.resolveRemunerationSource(merged);
    if (Object.keys(resolvedRemuneration).length > 0) {
      const existingNested = this.pickNestedRecord(merged['remuneration']);
      merged['remuneration'] = {
        ...(existingNested ?? {}),
        ...resolvedRemuneration,
      };
    }

    return merged;
  }

  private looksLikeEmployeeProfileRecord(obj: Record<string, unknown>): boolean {
    return !!(
      obj['personName'] ||
      obj['person_name'] ||
      obj['firstName'] ||
      obj['first_name'] ||
      obj['employeeCode'] ||
      obj['employee_code'] ||
      obj['remuneration'] ||
      obj['Remuneration'] ||
      obj['basicSalary'] ||
      obj['basic_salary'] ||
      obj['educationSections'] ||
      obj['education_sections'] ||
      obj['education'] ||
      obj['pastExperienceSections'] ||
      obj['past_experience_sections'] ||
      obj['pastExperience'] ||
      obj['past_experience'] ||
      obj['loginDetail'] ||
      obj['loginDetails'] ||
      obj['login_detail']
    );
  }

  private resolveRemunerationSource(item: Record<string, unknown>): Record<string, unknown> {
    const merged: Record<string, unknown> = {};

    const nestedCandidates = [
      item['remuneration'],
      item['Remuneration'],
      item['remunerationDetails'],
      item['remuneration_details'],
    ];

    for (const candidate of nestedCandidates) {
      if (typeof candidate === 'string' && candidate.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(candidate) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            this.mergeNonEmptyRemunerationFields(merged, parsed as Record<string, unknown>);
          }
        } catch {
          // Ignore invalid JSON strings.
        }
        continue;
      }

      const nested = this.pickNestedRecord(candidate);
      if (nested) {
        this.mergeNonEmptyRemunerationFields(merged, nested);
      }
    }

    for (const [camel, snake] of REMUNERATION_FIELD_KEYS) {
      const flatValue = this.pickRemunerationRawValue(item, camel, snake);
      if (flatValue !== '' && this.pickRemunerationRawValue(merged, camel, snake) === '') {
        merged[camel] = flatValue;
      }
    }

    return merged;
  }

  private mergeNonEmptyRemunerationFields(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): void {
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined || value === null || String(value).trim() === '') {
        continue;
      }

      if (!target[key] || String(target[key]).trim() === '') {
        target[key] = value;
      }
    }
  }

  private pickRemunerationValue(
    source: Record<string, unknown>,
    camel: string,
    snake?: string,
  ): string {
    const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
    const extra = REMUNERATION_EXTRA_KEYS[camel] ?? [];
    const keys = [camel, snake, pascal, ...extra].filter(
      (key, index, list): key is string => !!key && list.indexOf(key) === index,
    );

    for (const key of keys) {
      const raw = source[key];
      if (raw === undefined || raw === null) {
        continue;
      }

      const value = sanitizeApiText(raw);
      if (value !== '') {
        return value;
      }
    }

    return '';
  }

  private pickRemunerationRawValue(
    source: Record<string, unknown>,
    camel: string,
    snake?: string,
  ): string {
    return (
      this.pickRemunerationValue(source, camel, snake) ||
      this.pickFieldValue(source, camel, snake)
    );
  }

  private pickFieldValue(
    source: Record<string, unknown>,
    camel: string,
    snake?: string,
  ): string {
    const pascal = camel.charAt(0).toUpperCase() + camel.slice(1);
    const keys = [camel, snake, pascal].filter((key): key is string => !!key);

    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }

    return '';
  }

  private pickRemField(
    item: Record<string, unknown>,
    remunerationSource: Record<string, unknown>,
    camel: string,
    snake?: string,
  ): string {
    const fromRemuneration = this.pickRemunerationRawValue(remunerationSource, camel, snake);
    if (fromRemuneration !== '') {
      return fromRemuneration;
    }

    return this.pickRemunerationRawValue(item, camel, snake);
  }

  /** Reads `fuelLimit` from flat or nested employee profile API shapes. */
  readFuelLimitFromProfileItem(item: Record<string, unknown>): string {
    const remunerationSource = this.resolveRemunerationSource(item);
    const nestedRemuneration = this.pickNestedRecord(item['remuneration']);

    const candidates: unknown[] = [
      item['fuelLimit'],
      item['fuel_limit'],
      item['FuelLimit'],
      item['petrolLimit'],
      item['petrol_limit'],
      item['fuelLiters'],
      item['fuel_liters'],
      item['allowedLiters'],
      item['allowed_liters'],
      remunerationSource['fuelLimit'],
      remunerationSource['fuel_limit'],
      remunerationSource['FuelLimit'],
      remunerationSource['petrolLimit'],
      remunerationSource['petrol_limit'],
      remunerationSource['fuelLiters'],
      remunerationSource['fuel_liters'],
      remunerationSource['allowedLiters'],
      remunerationSource['allowed_liters'],
      nestedRemuneration?.['fuelLimit'],
      nestedRemuneration?.['fuel_limit'],
      nestedRemuneration?.['FuelLimit'],
    ];

    for (const candidate of candidates) {
      const formatted = this.formatFuelLimitForForm(
        candidate as string | number | null | undefined,
      );
      if (formatted !== '') {
        return formatted;
      }
    }

    return '';
  }

  /** Parses fuel limit form text for API (`null` when empty). */
  parseFuelLimitForApi(value: string | undefined | null): number | null {
    const trimmed = sanitizeApiText(value);
    if (!trimmed) {
      return null;
    }

    const numeric = Number.parseFloat(trimmed.replace(/,/g, ''));
    return Number.isFinite(numeric) ? numeric : null;
  }

  /** Maps API `fuelLimit` (number | string | null) to form display text. */
  formatFuelLimitForForm(value: string | number | null | undefined): string {
    if (value === undefined || value === null) {
      return '';
    }

    const text = String(value).trim();
    if (!text || text.toLowerCase() === 'null') {
      return '';
    }

    const numeric = Number.parseFloat(text.replace(/,/g, ''));
    if (Number.isFinite(numeric)) {
      return Number.isInteger(numeric) ? String(numeric) : String(numeric);
    }

    return text;
  }

  computeMaximumAdvanceCapacity(
    advancePercentAllowed: string | number | null | undefined,
    basicSalary: string | number | null | undefined,
  ): string {
    const percentStr = sanitizeApiText(advancePercentAllowed);
    const salaryStr = sanitizeApiText(basicSalary);

    if (!percentStr || !salaryStr) {
      return '';
    }

    const percent = Number.parseFloat(percentStr.replace(/,/g, ''));
    const salary = Number.parseFloat(salaryStr.replace(/,/g, ''));

    if (!Number.isFinite(percent) || !Number.isFinite(salary)) {
      return '';
    }

    const capacity = (percent / 100) * salary;
    const rounded = Math.round(capacity * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  }

  resolveMaximumAdvanceCapacity(
    remuneration: Pick<
      ApplicationFormRemuneration,
      'maximumAdvanceCapacity' | 'advancePercentAllowed' | 'basicSalary'
    >,
  ): string {
    const stored = sanitizeApiText(remuneration.maximumAdvanceCapacity);
    if (stored) {
      return stored;
    }

    return this.computeMaximumAdvanceCapacity(
      remuneration.advancePercentAllowed,
      remuneration.basicSalary,
    );
  }

  private resolveMaximumAdvanceCapacityValue(
    stored: string,
    advancePercentAllowed: string,
    basicSalary: string,
  ): string {
    const direct = sanitizeApiText(stored);
    if (direct) {
      return direct;
    }

    return this.computeMaximumAdvanceCapacity(advancePercentAllowed, basicSalary);
  }

  private extractApiItems(response: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(response)) {
      return response.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }
    if (response && typeof response === 'object') {
      const candidate = (response as { data?: unknown; users?: unknown }).data
        ?? (response as { data?: unknown; users?: unknown }).users;
      if (Array.isArray(candidate)) {
        return candidate.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
      }
    }
    return [];
  }

  private mapApiItemToEmployeeRoster(item: Record<string, unknown>): EmployeeRosterListRecord {
    const pick = (...keys: string[]): string => {
      for (const key of keys) {
        const value = item[key];
        if (value !== undefined && value !== null && String(value).trim()) {
          return String(value).trim();
        }
      }
      return '';
    };

    return {
      employee_id: pick('employee_id', 'employeeId', 'employeeID', 'EmployeeCode', 'employee_code'),
      employee_name: pick('employee_name', 'employeeName', 'EmployeeName', 'person_name', 'personName'),
      department: pick('department', 'Department'),
      designation: pick('designation', 'Designation'),
      employment_status: pick('employment_status', 'employmentStatus', 'EmploymentStatus'),
      shift_date: pick('shift_date', 'shiftDate'),
      shift: pick('shift', 'Shift'),
      role: pick('role', 'Role'),
      hub: pick('hub', 'Hub'),
      note: pick('note', 'Note', 'notes', 'Notes') || null,
    };
  }

  private resolveEmployeeCodeFromApiItem(item: Record<string, unknown>): string {
    const asString = (value: unknown): string =>
      value === undefined || value === null ? '' : String(value).trim();

    const loginSource =
      this.pickNestedRecord(item['loginDetail']) ??
      this.pickNestedRecord(item['loginDetails']) ??
      this.pickNestedRecord(item['login_detail']);

    const fromLogin = loginSource
      ? pickFrom(loginSource, 'employeeCode', 'employee_code') ||
        pickFrom(loginSource, 'userId', 'user_id')
      : '';

    const employeeCode =
      asString(item['employeeCode']) ||
      asString(item['employee_code']) ||
      fromLogin ||
      asString(item['userId']) ||
      asString(item['user_id']) ||
      '';

    return this.normalizeEmployeeCodeValue(employeeCode || '—');
  }

  private resolveUserIdFromApiItem(item: Record<string, unknown>): string {
    const asString = (value: unknown): string =>
      value === undefined || value === null ? '' : String(value).trim();

    const loginSource =
      this.pickNestedRecord(item['loginDetail']) ??
      this.pickNestedRecord(item['loginDetails']) ??
      this.pickNestedRecord(item['login_detail']);

    const fromLogin = loginSource
      ? pickFrom(loginSource, 'userId', 'user_id')
      : '';

    const topLevel =
      asString(item['userId']) ||
      asString(item['user_id']) ||
      asString(item['loginUserId']) ||
      asString(item['login_user_id']);
    const resolved = fromLogin || topLevel;
    if (resolved) {
      return this.extractLoginUserId(resolved);
    }

    const loginEmployeeCode = loginSource
      ? pickFrom(loginSource, 'employeeCode', 'employee_code')
      : '';
    const fromLoginCode = this.extractLoginUserId(loginEmployeeCode);
    if (fromLoginCode) {
      return fromLoginCode;
    }

    const employeeCode =
      asString(item['employeeCode']) ||
      asString(item['employee_code']) ||
      asString(item['EmployeeID']) ||
      asString(item['employeeID']) ||
      asString(item['EmployeeId']) ||
      asString(item['employeeId']);
    return this.extractLoginUserId(employeeCode);
  }

  /** Biometric / login user id (e.g. 00002) — not display employee code (e.g. EMP-00002). */
  private extractLoginUserId(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '—') {
      return '';
    }

    const empMatch = trimmed.match(/^Emp-(\d+)$/i);
    if (empMatch) {
      return empMatch[1];
    }

    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }

    return '';
  }

  private mapApiItemToRecord(item: Record<string, unknown>): ApplicationFormRecord {
    const asString = (value: unknown): string =>
      value === undefined || value === null ? '' : String(value).trim();
    const personalInfoSource =
      this.pickNestedRecord(item['personalInfo']) ??
      this.pickNestedRecord(item['personal_info']) ??
      item;
    const requisitionSource =
      this.pickNestedRecord(item['requisition']) ??
      this.pickNestedRecord(item['requisition_detail']) ??
      item;
    const employeeCode = this.resolveEmployeeCodeFromApiItem(item);
    const personName =
      pickFrom(personalInfoSource, 'personName', 'person_name') ||
      pickFrom(personalInfoSource, 'employeeName', 'employee_name') ||
      asString(item['personName']) ||
      asString(item['person_name']) ||
      asString(item['employeeName']) ||
      asString(item['employee_name']);
    const composedName = [
      pickFrom(personalInfoSource, 'firstName', 'first_name') || asString(item['firstName']),
      pickFrom(personalInfoSource, 'middleName', 'middle_name') || asString(item['middleName']),
      pickFrom(personalInfoSource, 'lastName', 'last_name') || asString(item['lastName']),
    ]
      .filter(Boolean)
      .join(' ');
    const loginEmployeeName =
      asString(item['loginEmployeeName']) || asString(item['login_employee_name']);
    const employeeName = personName || composedName || loginEmployeeName;

    const apiId = asString(item['id']) || (employeeCode !== '—' ? employeeCode : '');
    const userId = this.resolveUserIdFromApiItem(item);
    const extEmpNo =
      pickFrom(personalInfoSource, 'ExtEmpNo', 'extEmpNo') ||
      pickFrom(personalInfoSource, 'ext_emp_no') ||
      asString(item['ExtEmpNo']) ||
      asString(item['extEmpNo']) ||
      asString(item['ext_emp_no']);

    return {
      EmployeeCode: employeeCode,
      EmployeeName: employeeName || '—',
      Department:
        pickFrom(personalInfoSource, 'departmentInAhcp', 'department_in_ahcp') ||
        pickFrom(requisitionSource, 'department') ||
        asString(item['departmentInAhcp']) ||
        asString(item['department_in_ahcp']) ||
        asString(item['department']) ||
        '—',
      EmployeeNature:
        pickFrom(personalInfoSource, 'employmentNature', 'employment_nature') ||
        sanitizeApiText(item['employmentNature']) ||
        sanitizeApiText(item['employment_nature']) ||
        '—',
      Designation:
        pickFrom(personalInfoSource, 'designation') ||
        pickFrom(requisitionSource, 'internalJobTitle', 'internal_job_title') ||
        asString(item['designation']) ||
        '—',
      ReportingManager:
        pickFrom(personalInfoSource, 'reportingManager', 'reporting_manager') ||
        pickFrom(requisitionSource, 'hiringManager', 'hiring_manager') ||
        asString(item['reportingManager']) ||
        asString(item['reporting_manager']) ||
        asString(item['hiringManager']) ||
        asString(item['hiring_manager']) ||
        '—',
      EmploymentType:
        pickFrom(personalInfoSource, 'employmentType', 'employment_type') ||
        pickFrom(requisitionSource, 'division') ||
        asString(item['employmentType']) ||
        asString(item['employment_type']) ||
        '—',
      EmploymentStatus:
        normalizeEmploymentStatus(
          pickFrom(personalInfoSource, 'employmentStatus', 'employment_status') ||
            asString(item['employmentStatus']) ||
            asString(item['employment_status']),
        ) || 'Permanent',
      EmploymentCategory:
        pickFrom(personalInfoSource, 'employmentCategory', 'employment_category') ||
        asString(item['employeeCategory']) ||
        asString(item['employee_category']) ||
        asString(item['employmentCategory']) ||
        asString(item['employment_category']) ||
        '—',
      status:
        normalizeEmploymentStatus(
          pickFrom(personalInfoSource, 'employmentStatus', 'employment_status') ||
            asString(item['employmentStatus']) ||
            asString(item['employment_status']),
        ) ||
        asString(item['requestStatus']) ||
        asString(item['request_status']) ||
        'Permanent',
      selected: false,
      apiId: apiId || undefined,
      userId: userId || undefined,
      ExtEmpNo: extEmpNo || undefined,
    };
  }

  private mapApiItemToFullRecord(item: Record<string, unknown>): ApplicationFormRecord {
    const summary = this.mapApiItemToRecord(item);
    const asString = (value: unknown): string =>
      value === undefined || value === null ? '' : String(value).trim();
    const personalInfoSource =
      this.pickNestedRecord(item['personalInfo']) ??
      this.pickNestedRecord(item['personal_info']) ??
      item;
    const requisitionSource =
      this.pickNestedRecord(item['requisition']) ??
      this.pickNestedRecord(item['requisition_detail']) ??
      item;
    const hrSettingsSource =
      this.pickNestedRecord(item['hrSettings']) ??
      this.pickNestedRecord(item['hr_settings']) ??
      item;
    const pick = (camel: string, snake?: string): string =>
      pickFrom(personalInfoSource, camel, snake) ||
      pickFrom(requisitionSource, camel, snake) ||
      asString(item[camel]) ||
      (snake ? asString(item[snake]) : '');

    const educationRaw = this.collectProfileSectionArray(
      [
        'educationSections',
        'education_sections',
        'education',
        'educations',
        'employeeEducation',
        'employee_education',
      ],
      item,
      personalInfoSource,
      requisitionSource,
      'education',
    );
    const experienceRaw = this.collectProfileSectionArray(
      [
        'pastExperienceSections',
        'past_experience_sections',
        'pastExperience',
        'past_experience',
        'pastExperiences',
        'employeePastExperience',
        'employee_past_experience',
      ],
      item,
      personalInfoSource,
      requisitionSource,
      'experience',
    );
    const attachmentsRaw = this.collectProfileSectionArray(
      ['attachments', 'employeeAttachments', 'employee_attachments'],
      item,
      personalInfoSource,
      requisitionSource,
    );

    const asNumberString = (value: unknown): string => {
      if (value === undefined || value === null || value === '') {
        return '';
      }
      return String(value).trim();
    };

    const education = Array.isArray(educationRaw)
      ? educationRaw
          .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
          .map((row) => {
            const institution = pickFrom(row, 'institution') || pickFrom(row, 'institute');
            return {
              institute: institution,
              institution,
              qualification: pickFrom(row, 'qualification'),
              passingYear: pickFrom(row, 'passingYear', 'passing_year'),
              fromDate: formatDateForInput(pickFrom(row, 'fromDate', 'from_date')),
              toDate: formatDateForInput(pickFrom(row, 'toDate', 'to_date')),
              subject: pickFrom(row, 'subject'),
              awardedQualification: pickFrom(row, 'awardedQualification', 'awarded_qualification'),
              marksGrades: pickFrom(row, 'marksGrades', 'marks_grades'),
              notes: pickFrom(row, 'notes'),
            };
          })
      : [];

    const pastExperience = Array.isArray(experienceRaw)
      ? experienceRaw
          .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
          .map((row) => {
            const designation = pickFrom(row, 'designation') || pickFrom(row, 'position');
            return {
              company: pickFrom(row, 'company'),
              position: designation,
              designation,
              duration: pickFrom(row, 'duration'),
              fromDate: formatDateForInput(pickFrom(row, 'fromDate', 'from_date')),
              toDate: formatDateForInput(pickFrom(row, 'toDate', 'to_date')),
              duties: pickFrom(row, 'duties'),
              remarks: pickFrom(row, 'remarks'),
              lastSalary: asString(row['lastSalary'] ?? row['last_salary']),
            };
          })
      : [];

    const mergedSections = this.mergeProfileSectionsWithCache(
      [
        summary.apiId,
        asString(item['id']),
        asString(item['employeeCode']),
        asString(item['employee_code']),
        asString(item['userId']),
        asString(item['user_id']),
        summary.EmployeeCode,
      ],
      education,
      pastExperience,
    );

    const attachments = Array.isArray(attachmentsRaw)
      ? attachmentsRaw
          .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
          .map((row) => {
            const attachmentFor =
              pickFrom(row, 'attachmentFor', 'attachment_for') ||
              pickFrom(row, 'type') ||
              pickFrom(row, 'documentType', 'document_type');
            return {
              type: attachmentFor,
              attachmentFor,
              fileName: pickFrom(row, 'fileName', 'file_name') || pickFrom(row, 'file'),
              fileUrl: pickFrom(row, 'fileUrl', 'file_url'),
            };
          })
      : [];

    const mergedAttachments = this.mergeAttachmentsWithCache(
      [
        summary.apiId,
        asString(item['id']),
        asString(item['employeeCode']),
        asString(item['employee_code']),
        asString(item['userId']),
        asString(item['user_id']),
        summary.EmployeeCode,
      ],
      attachments,
    );

    const remunerationSource = this.resolveRemunerationSource(item);
    const loginSource =
      this.pickNestedRecord(item['loginDetail']) ??
      this.pickNestedRecord(item['loginDetails']) ??
      this.pickNestedRecord(item['login_detail']);

    const pickRem = (camel: string, snake?: string): string =>
      this.pickRemField(item, remunerationSource, camel, snake);

    const pickLogin = (camel: string, snake?: string): string =>
      (loginSource ? pickFrom(loginSource, camel, snake) : '') || pickFrom(item, camel, snake);

    const overTimeRaw = pickRem('overTimeApplicable', 'over_time_applicable');
    const overTimeApplicable = this.yesNoFromApi(overTimeRaw);

    const roleSalary =
      pick('roleSalary', 'role_salary') || pick('roleAndSalary', 'role_and_salary');
    const salaryStructure = pick('salaryStructure', 'salary_structure') || roleSalary;
    const jobSpecificationId = pick('jobSpecificationId', 'job_specification_id');

    const detail: ApplicationFormDetail = {
      personalInfo: {
        personName: pick('personName', 'person_name'),
        firstName: pick('firstName', 'first_name'),
        middleName: pick('middleName', 'middle_name'),
        lastName: pick('lastName', 'last_name'),
        fatherOrHusbandName: pick('fatherOrHusbandName', 'father_or_husband_name'),
        gender: pick('gender'),
        maritalStatus: pick('maritalStatus', 'marital_status'),
        dateOfBirth: formatDateOfBirthFromApi(pick('dateOfBirth', 'date_of_birth')),
        nationality: pick('nationality'),
        religion: pick('religion'),
        bloodGroup: pick('bloodGroup', 'blood_group'),
        nationalIdCardNo: pick('nationalIdCardNo', 'national_id_card_no'),
        incomeTaxNo: pick('incomeTaxNo', 'income_tax_no'),
        contactNumber: pick('contactNumber', 'contact_number'),
        emergencyContactNumber: pick('emergencyContactNumber', 'emergency_contact_number'),
        street: pick('street'),
        streetNo: pick('streetNo', 'street_no'),
        buildingFloorRoom: pick('buildingFloorRoom', 'building_floor_room'),
        city: pick('city'),
        state: pick('state'),
        country: pick('country'),
        zipCode: pick('zipCode', 'zip_code'),
        employmentNature: pick('employmentNature', 'employment_nature'),
        employmentCategory:
          pick('employeeCategory', 'employee_category') ||
          pick('employmentCategory', 'employment_category'),
        employmentStatus: normalizeEmploymentStatus(pick('employmentStatus', 'employment_status')),
        departmentInAhcp: pick('department') || pick('departmentInAhcp', 'department_in_ahcp'),
        designation: pick('designation'),
        jobDescription: pick('jobDescription', 'job_description'),
        roleSalary,
        workGradeLevel:
          pick('workGradeLevel', 'work_grade_level') || roleSalary || salaryStructure,
        branchLocation: resolveBranchCode(
          pick('branchLocation', 'branch_location') ||
            pick('branch', 'branch') ||
            pick('location', 'location'),
        ),
        costCenter: pickRem('costCenter', 'cost_center') || pick('costCenter', 'cost_center'),
        reportingManager:
          pick('reportingManager', 'reporting_manager') ||
          pick('hiringManager', 'hiring_manager'),
        remarks: pick('remarks'),
      },
      education: mergedSections.education,
      pastExperience: mergedSections.pastExperience,
      remuneration: {
        basicSalary: pickRem('basicSalary', 'basic_salary'),
        paymentMode: pickRem('paymentMode', 'payment_mode'),
        accountTitle: pickRem('accountTitle', 'account_title'),
        bankName: pickRem('bankName', 'bank_name'),
        branchName: pickRem('branchName', 'branch_name'),
        accountNo: pickRem('accountNo', 'account_no'),
        accountType: pickRem('accountType', 'account_type'),
        effectiveDate: formatDateForInput(pickRem('effectiveDate', 'effective_date')),
        taxPercentage:
          pickRem('taxPercentage', 'tax_percentage') ||
          pickRem('taxArrangementPercentage', 'tax_arrangement_percentage'),
        dateOfJoining: formatDateForInput(pickRem('dateOfJoining', 'date_of_joining')),
        advancePercentAllowed: pickRem('advancePercentAllowed', 'advance_percent_allowed'),
        loanAmountAllowed:
          pickRem('loanAmountAllowed', 'loan_amount_allowed') ||
          pickRem('maximumLoanCapacity', 'maximum_loan_capacity'),
        overTimeApplicable,
        leaveType: pickRem('leaveType', 'leave_type'),
        leaveDays: asNumberString(pickRem('leaveDays', 'leave_days')),
        leavesAvailed: asNumberString(pickRem('leavesAvailed', 'leaves_availed')),
        remainingLeaves: asNumberString(pickRem('remainingLeaves', 'remaining_leaves')),
        totalLeaves: asNumberString(pickRem('totalLeaves', 'total_leaves')),
        medicalAllowances: asNumberString(pickRem('medicalAllowances', 'medical_allowances')),
        fuelAllowances: asNumberString(pickRem('fuelAllowances', 'fuel_allowances')),
        mobileAllowances: asNumberString(pickRem('mobileAllowances', 'mobile_allowances')),
        carAllowances: asNumberString(pickRem('carAllowances', 'car_allowances')),
        maximumLoanCapacity: asNumberString(
          pickRem('maximumLoanCapacity', 'maximum_loan_capacity') ||
          pickRem('loanAmountAllowed', 'loan_amount_allowed'),
        ),
        maximumAdvanceCapacity: asNumberString(
          this.resolveMaximumAdvanceCapacityValue(
            pickRem('maximumAdvanceCapacity', 'maximum_advance_capacity'),
            pickRem('advancePercentAllowed', 'advance_percent_allowed'),
            pickRem('basicSalary', 'basic_salary'),
          ),
        ),
        otherAllowances: asNumberString(pickRem('otherAllowances', 'other_allowances')),
        allowancesApplicable: this.yesNoFromApi(
          pickRem('allowancesApplicable', 'allowances_applicable'),
        ) || 'Yes',
        cashSalaryPercentage:
          pickRem('cashSalaryPercentage', 'cash_salary_percentage') ||
          pickRem('percentageOfSalaryInCash', 'percentage_of_salary_in_cash'),
        eobiApplicable:
          this.yesNoFromApi(pickRem('eobiApplicable', 'eobi_applicable')) || 'Yes',
        socialSecurityApplicable: this.yesNoFromApi(
          pickRem('socialSecurityApplicable', 'social_security_applicable'),
        ),
        providentApplicable: this.yesNoFromApi(pickRem('providentApplicable', 'provident_applicable')),
        fuelLimit: this.readFuelLimitFromProfileItem(item),
        grauity: asNumberString(pickRem('grauity', 'grauity') || pickRem('gratuityBalance', 'gratuity_balance')),
        gratuityBalance: asNumberString(pickRem('grauity', 'grauity') || pickRem('gratuityBalance', 'gratuity_balance')),
        leaveEligibilityCriteria: pickRem('leaveEligibilityCriteria', 'leave_eligibility_criteria'),
      },
      leaveManagement: this.mapLeaveManagementRows(item, {
        leaveType: pickRem('leaveType', 'leave_type'),
        leaveDays: asNumberString(pickRem('leaveDays', 'leave_days')),
        leavesAvailed: asNumberString(pickRem('leavesAvailed', 'leaves_availed')),
        remainingLeaves: asNumberString(pickRem('remainingLeaves', 'remaining_leaves')),
      }),
      hrSettings: {
        employeeMaster: asNumberString(item['employeeMaster'] ?? item['employee_master']),
        salaryStructure,
        attendanceShiftManagement: this.yesNoFromApi(
          this.pickCaseInsensitive(
            [hrSettingsSource, item],
            [
              'attendanceShiftManagement',
              'employeeShiftApplicable',
              'shiftApplicable',
              'shiftManagementApplicable',
            ],
          ),
        ) || pick('attendanceShiftManagement', 'attendance_shift_management'),
        leaveManagement: pick('leaveManagement', 'leave_management'),
        loanAdvancesForm: pick('loanAdvancesForm', 'loan_advances_form'),
        requestStatus: pick('requestStatus', 'request_status'),
      },
      loginDetails: {
        employeeCode:
          pickLogin('employeeCode', 'employee_code') ||
          (summary.EmployeeCode !== '—' ? summary.EmployeeCode : ''),
        legacyCode: pickLogin('legacyCode', 'legacy_code') || summary.ExtEmpNo || '',
        employeeName:
          pickLogin('loginEmployeeName', 'login_employee_name') ||
          pickLogin('employeeName', 'employee_name') ||
          summary.EmployeeName,
        userId: pickLogin('userId', 'user_id') || summary.userId || '',
        password: pickLogin('password'),
        status: pickLogin('status') || asString(item['status']),
      },
      attachments: mergedAttachments,
      requisition: {
        copyExisting: false,
        reqId: jobSpecificationId,
        internalJobTitle: summary.Designation !== '—' ? summary.Designation : '',
        hiringManager:
          pick('hiringManager', 'hiring_manager') ||
          pick('reportingManager', 'reporting_manager') ||
          (summary.ReportingManager !== '—' ? summary.ReportingManager : ''),
        recruiter: '',
        recruitmentCollaborator: '',
        requisitionAdministrator: '',
        recruitmentCoordinator: '',
        hrAdministrator: '',
        company: summary.EmployeeNature !== '—' ? summary.EmployeeNature : '',
        department: summary.Department !== '—' ? summary.Department : '',
        division: summary.EmploymentType !== '—' ? summary.EmploymentType : '',
        location:
          pick('branchLocation', 'branch_location') || pick('branch', 'branch') || pick('location', 'location'),
        costCenter: pickRem('costCenter', 'cost_center') || pick('costCenter', 'cost_center'),
      },
      assets: this.mapApiAssets(item),
    };

    return {
      ...summary,
      userId: detail.loginDetails.userId?.trim() || summary.userId,
      EmployeeCode:
        summary.EmployeeCode && summary.EmployeeCode !== '—'
          ? summary.EmployeeCode
          : detail.loginDetails.employeeCode,
      EmployeeName: detail.personalInfo.personName || summary.EmployeeName,
      detail,
    };
  }

  findRecordByLoginUserId(userId: string): ApplicationFormRecord | undefined {
    const normalized = userId.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    return this.applicationRecords().find((record) => {
      const loginUserId = record.detail?.loginDetails.userId?.trim().toLowerCase() ?? '';
      const employeeCode = String(record.EmployeeCode);
      return loginUserId === normalized || employeeCode === normalized;
    });
  }

  /** Profile for the signed-in user when a matching employee application record exists. */
  getSignedInUserRecord(sessionUserId: string | null, sessionUserName?: string | null): ApplicationFormRecord | undefined {
    const normalizedUserId = sessionUserId?.trim() ?? '';
    const normalizedUserName = sessionUserName?.trim() ?? '';

    if (!normalizedUserId && !normalizedUserName) {
      return undefined;
    }

    if (normalizedUserId) {
      const directMatch = this.findRecordByLoginUserId(normalizedUserId);
      if (directMatch) {
        return directMatch;
      }
    }

    if (normalizedUserName) {
      return this.findRecordBySessionUserName(normalizedUserName);
    }

    return undefined;
  }

  private findRecordBySessionUserName(userName: string): ApplicationFormRecord | undefined {
    const normalized = userName.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }

    return this.applicationRecords().find((record) => {
      const employeeName = record.EmployeeName?.trim().toLowerCase() ?? '';
      const detailName = record.detail?.personalInfo?.personName?.trim().toLowerCase() ?? '';
      const loginName = record.detail?.loginDetails?.employeeName?.trim().toLowerCase() ?? '';
      const loginUserId = record.detail?.loginDetails?.userId?.trim().toLowerCase() ?? '';
      const topLevelUserId = record.userId?.trim().toLowerCase() ?? '';
      const employeeCode = record.EmployeeCode?.trim().toLowerCase() ?? '';

      return (
        employeeName === normalized ||
        detailName === normalized ||
        loginName === normalized ||
        loginUserId === normalized ||
        topLevelUserId === normalized ||
        employeeCode === normalized
      );
    });
  }

  updateLoginPassword(sessionUserId: string, newPassword: string): boolean {
    const normalized = sessionUserId.trim().toLowerCase();
    if (!normalized || !newPassword.trim()) {
      return false;
    }

    let updated = false;
    this.applicationRecords.update((list) =>
      list.map((record) => {
        const loginUserId = record.detail?.loginDetails.userId?.trim().toLowerCase() ?? '';
        if (loginUserId !== normalized) {
          return record;
        }
        updated = true;
        return {
          ...record,
          detail: record.detail
            ? {
                ...record.detail,
                loginDetails: {
                  ...record.detail.loginDetails,
                  password: newPassword,
                },
              }
            : record.detail,
        };
      })
    );
    return updated;
  }

  getEmployeeMasterDataRecords(): EmployeeMasterDataRecord[] {
    return this.applicationRecords().map((record) => ({
      EmployeeID: this.parseEmployeeCodeSequence(record.EmployeeCode),
      EmployeeName: record.EmployeeName,
      Department: record.Department,
      Designation: record.Designation,
      EmploymentType: record.EmploymentType,
      EmployeeCategory: record.EmploymentCategory,
      WorkLevel: record.EmployeeNature,
      EmploymentStatus: record.EmploymentStatus || record.status,
      selected: record.selected ?? false
    }));
  }

  private pickNestedRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private pickCaseInsensitive(
    sources: Record<string, unknown>[],
    fieldNames: string[],
  ): unknown {
    const normalizedNames = new Set(fieldNames.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, '')));
    for (const source of sources) {
      const match = Object.entries(source).find(([key, value]) =>
        normalizedNames.has(key.toLowerCase().replace(/[^a-z0-9]/g, '')) &&
        value !== undefined &&
        value !== null &&
        String(value).trim() !== '',
      );
      if (match) {
        return match[1];
      }
    }
    return undefined;
  }

  private parseJsonArray(
    value: unknown,
    sectionHint?: 'education' | 'experience',
  ): unknown[] {
    if (Array.isArray(value)) {
      return value.filter((entry) => entry !== null && entry !== undefined);
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const nestedValues = Object.values(record).filter(
        (entry) => entry !== null && entry !== undefined && typeof entry === 'object' && !Array.isArray(entry),
      );
      if (nestedValues.length) {
        return nestedValues;
      }

      if (sectionHint === 'education') {
        if (
          record['qualification'] ||
          record['institution'] ||
          record['institute'] ||
          record['passingYear'] ||
          record['passing_year']
        ) {
          return [record];
        }
      }

      if (sectionHint === 'experience') {
        if (
          record['company'] ||
          record['designation'] ||
          record['position'] ||
          record['duration']
        ) {
          return [record];
        }
      }
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return [];
      }

      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          return this.parseJsonArray(JSON.parse(trimmed) as unknown, sectionHint);
        } catch {
          return [];
        }
      }
    }

    return [];
  }

  private collectProfileSectionArray(
    keys: string[],
    ...sourcesAndHint: Array<Record<string, unknown> | 'education' | 'experience' | undefined>
  ): unknown[] {
    const sectionHint = sourcesAndHint.find(
      (value): value is 'education' | 'experience' => value === 'education' || value === 'experience',
    );
    const sources = sourcesAndHint.filter(
      (value): value is Record<string, unknown> =>
        value !== 'education' &&
        value !== 'experience' &&
        typeof value === 'object' &&
        value !== null &&
        value !== undefined,
    );

    for (const source of sources) {
      for (const key of keys) {
        const parsed = this.parseJsonArray(source[key], sectionHint);
        if (parsed.length) {
          return parsed;
        }
      }
    }

    return [];
  }

  private mergeProfileCollections(
    source: Record<string, unknown>,
    target: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged = { ...target };
    const collectionKeys: Array<{
      primary: string;
      aliases: string[];
      hint?: 'education' | 'experience';
    }> = [
      {
        primary: 'educationSections',
        aliases: ['education_sections', 'education', 'educations', 'employeeEducation', 'employee_education'],
        hint: 'education',
      },
      {
        primary: 'pastExperienceSections',
        aliases: [
          'past_experience_sections',
          'pastExperience',
          'past_experience',
          'pastExperiences',
          'employeePastExperience',
          'employee_past_experience',
        ],
        hint: 'experience',
      },
      {
        primary: 'attachments',
        aliases: ['employeeAttachments', 'employee_attachments'],
      },
    ];

    for (const { primary, aliases, hint } of collectionKeys) {
      if (this.parseJsonArray(merged[primary], hint).length) {
        continue;
      }

      for (const key of [primary, ...aliases]) {
        const parsed = this.parseJsonArray(source[key], hint);
        if (parsed.length) {
          merged[primary] = parsed;
          break;
        }
      }
    }

    return merged;
  }

  private mapLeaveManagementRows(
    item: Record<string, unknown>,
    legacyRemuneration?: {
      leaveType: string;
      leaveDays: string;
      leavesAvailed: string;
      remainingLeaves: string;
    },
  ): ApplicationFormLeaveRow[] {
    const raw = item['leaveManagement'] ?? item['leave_management'];
    if (Array.isArray(raw) && raw.length) {
      return raw
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => {
          const row = entry as Record<string, unknown>;
          const leavesAllocated = this.pickLeaveField(row, [
            'leavesAllocated',
            'leaves_allocated',
            'leaveDays',
            'leave_days',
          ]);
          const leavesAvailed = this.pickLeaveField(row, ['leavesAvailed', 'leaves_availed']);
          const remainingLeave = this.pickLeaveField(row, [
            'remainingLeave',
            'remaining_leave',
            'remainingLeaves',
            'remaining_leaves',
          ]);
          return {
            leaveType: this.pickLeaveField(row, ['leaveType', 'leave_type']),
            leavesAllocated,
            leavesAvailed,
            remainingLeave:
              remainingLeave || this.computeRemainingLeaveString(leavesAllocated, leavesAvailed),
          };
        })
        .filter((row) => row.leaveType || row.leavesAllocated || row.leavesAvailed);
    }

    if (legacyRemuneration?.leaveType?.trim() || legacyRemuneration?.leaveDays?.trim()) {
      const leavesAllocated = legacyRemuneration.leaveDays ?? '';
      const leavesAvailed = legacyRemuneration.leavesAvailed ?? '';
      return [
        {
          leaveType: legacyRemuneration.leaveType,
          leavesAllocated,
          leavesAvailed,
          remainingLeave:
            legacyRemuneration.remainingLeaves ||
            this.computeRemainingLeaveString(leavesAllocated, leavesAvailed),
        },
      ];
    }

    return [];
  }

  private pickLeaveField(row: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }
    return '';
  }

  private computeRemainingLeaveString(allocated: string, availed: string): string {
    const allocatedStr = allocated.trim();
    if (!allocatedStr) {
      return '';
    }
    const allocatedNum = Number.parseInt(allocatedStr, 10);
    if (!Number.isFinite(allocatedNum)) {
      return '';
    }
    const availedStr = availed.trim();
    const availedNum = availedStr ? Number.parseInt(availedStr, 10) : 0;
    if (!Number.isFinite(availedNum)) {
      return '';
    }
    return String(allocatedNum - availedNum);
  }

  private mapApiAssets(item: Record<string, unknown>): ApplicationFormAssets {
    const nested = item['assets'] ?? item['Assets'];
    const source =
      nested && typeof nested === 'object' && !Array.isArray(nested)
        ? (nested as Record<string, unknown>)
        : item;

    const pickAsset = (camel: string, snake: string): string => pickFrom(source, camel, snake);

    return {
      assetAllocated: pickAsset('assetAllocated', 'asset_allocated'),
      assetOitmCode: pickAsset('assetOitmCode', 'asset_oitm_code') || pickAsset('oitmCode', 'oitm_code'),
      allocationStatus: pickAsset('allocationStatus', 'allocation_status'),
      allocationDate: formatDateForInput(pickAsset('allocationDate', 'allocation_date')),
      allocationDateType: pickAsset('allocationDateType', 'allocation_date_type'),
    };
  }

  private yesNoFromApi(value: unknown): string {
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    const normalized = value === undefined || value === null ? '' : String(value).trim();
    if (!normalized) {
      return '';
    }
    if (normalized.toLowerCase() === 'true' || normalized === '1') {
      return 'Yes';
    }
    if (normalized.toLowerCase() === 'false' || normalized === '0') {
      return 'No';
    }
    if (normalized.toLowerCase() === 'yes') {
      return 'Yes';
    }
    if (normalized.toLowerCase() === 'no') {
      return 'No';
    }
    return normalized;
  }

}

function pickFrom(row: Record<string, unknown>, camel: string, snake?: string): string {
  const camelValue = sanitizeApiText(row[camel]);
  if (camelValue) {
    return camelValue;
  }

  if (snake) {
    const snakeValue = sanitizeApiText(row[snake]);
    if (snakeValue) {
      return snakeValue;
    }
  }

  return '';
}