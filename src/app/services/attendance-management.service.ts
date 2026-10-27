import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, last, map, of, switchMap, throwError } from 'rxjs';
import { BIOMETRICS_API_BASE_URL, BIOMETRICS_API_KEY } from '../config/api.config';
import { ApplicationFormRecord, ApplicationFormService } from './application-form.service';

export type AttendanceQueryMode = 'today' | 'date' | 'dateRange';

export interface AttendanceQuery {
  mode: AttendanceQueryMode;
  userId?: string;
  date?: string;
  fromDate?: string;
  toDate?: string;
}

export interface AttendancePunchRecord {
  No: number;
  EmployeeId: string;
  PunchDatetime: string;
  DeviceNo: string;
  Status: string;
  WorkingHours?: string;
  selected?: boolean;
}

export interface AttendanceDailyRecord {
  EmployeeId: string;
  EmployeeName: string;
  AttendanceDate: string;
  PunchIn: string;
  PunchOut: string;
  PunchInDevice: string;
  PunchOutDevice: string;
  WorkingMinutes: number;
  WorkingHours: string;
  AttendanceStatus: 'Present' | 'Absent';
  PunchCount: number;
  Punches: AttendancePunchRecord[];
  selected?: boolean;
}

/** Lightweight row used for filtering, sorting, and pagination before page materialization. */
export interface AttendanceSlotRef {
  employeeKey: string;
  displayId: string;
  employeeName: string;
  date: string;
  status: 'Present' | 'Absent';
  punchIn: string;
  punchOut: string;
  punchInDevice: string;
  punchOutDevice: string;
  workingMinutes: number;
  workingHours: string;
  punchCount: number;
}

interface AttendanceSession {
  query: AttendanceQuery;
  employees: ApplicationFormRecord[];
  index: EmployeeAttendanceIndex;
  punchGroups: Map<string, AttendancePunchRecord[]>;
  slots: AttendanceSlotRef[];
}

interface BiometricsPunchApiRecord {
  No?: number;
  id?: string | number;
  card_no?: string;
  hours_worked?: unknown;
  date?: unknown;
  Date?: unknown;
  attendance_date?: unknown;
  AttendanceDate?: unknown;
  attendanceDate?: unknown;
  punch_date?: unknown;
  PunchDate?: unknown;
  punchDate?: unknown;
  punch_in?: string | null;
  punch_out?: string | null;
  machine_id?: string | number;
  'Employee ID'?: string;
  'User ID'?: string;
  EmployeeId?: string;
  employeeId?: string;
  UserId?: string;
  userId?: string;
  PunchDatetime?: string;
  punchDatetime?: string;
  'Punch Datetime'?: string;
  'Device No'?: string;
  DeviceNo?: string;
  deviceNo?: string;
  Status?: string | null;
  status?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class AttendanceManagementService {
  private readonly http = inject(HttpClient);
  private readonly applicationFormService = inject(ApplicationFormService);
  private readonly sessionState = signal<AttendanceSession | null>(null);
  private lastQuery: AttendanceQuery = { mode: 'today' };

  readonly slots = computed(() => this.sessionState()?.slots ?? []);
  readonly totalSlotCount = computed(() => this.slots().length);

  loadSession(query: AttendanceQuery): Observable<number> {
    const normalizedQuery = this.normalizeQuery(query);
    this.lastQuery = normalizedQuery;
    const cachedEmployees = this.applicationFormService.getApplicationRecords();
    const employees$ = cachedEmployees.length
      ? of(cachedEmployees)
      : this.applicationFormService.fetchEmployeeProfiles();

    return employees$.pipe(
      switchMap((employees) =>
        this.fetchPunches(normalizedQuery, employees).pipe(
          map((punches) => {
            const session = this.createSession(punches, employees, normalizedQuery);
            this.sessionState.set(session);
            return session.slots.length;
          }),
        ),
      ),
    );
  }

  fetchDailyAttendance(
    employee: ApplicationFormRecord,
    date: string,
  ): Observable<AttendanceDailyRecord | null> {
    const userId =
      employee.ExtEmpNo?.trim() ||
      employee.detail?.loginDetails.legacyCode?.trim() ||
      employee.userId?.trim() ||
      employee.detail?.loginDetails.userId?.trim() ||
      employee.EmployeeCode;
    const query: AttendanceQuery = { mode: 'date', userId, date };

    return this.fetchPunches(query, [employee]).pipe(
      map((punches) => {
        const session = this.createSession(punches, [employee], query);
        const slot = session.slots.find((item) => item.date === date);
        if (!slot) {
          return null;
        }

        const groupedPunches = session.punchGroups.get(attendanceGroupKey(slot.employeeKey, date)) ?? [];
        return this.slotToDailyRecord(slot, groupedPunches);
      }),
    );
  }

  fetchRosterAttendance(
    employees: ApplicationFormRecord[],
    fromDate: string,
    toDate: string,
  ): Observable<Map<string, AttendanceDailyRecord>> {
    const query: AttendanceQuery = { mode: 'dateRange', fromDate, toDate };
    return this.fetchPunches(query, employees).pipe(
      map((punches) => {
        const session = this.createSession(punches, employees, query);
        const employeeCodeByAttendanceKey = new Map<string, string>();
        for (const employee of employees) {
          const candidates = [
            employee.ExtEmpNo,
            employee.detail?.loginDetails.legacyCode,
            resolveAttendanceUserId(employee),
            employee.userId,
            employee.EmployeeCode,
          ];
          for (const candidate of candidates) {
            if (!candidate?.trim()) {
              continue;
            }
            const attendanceKey = resolvePunchKey(candidate, session.index.aliasToCanonical);
            if (attendanceKey) {
              employeeCodeByAttendanceKey.set(attendanceKey, employee.EmployeeCode);
            }
          }
        }

        const attendanceByEmployeeDay = new Map<string, AttendanceDailyRecord>();
        for (const slot of session.slots) {
          if (slot.status !== 'Present') {
            continue;
          }
          const employeeCode = employeeCodeByAttendanceKey.get(slot.employeeKey);
          if (!employeeCode) {
            continue;
          }
          const punchesForDay = session.punchGroups.get(attendanceGroupKey(slot.employeeKey, slot.date)) ?? [];
          attendanceByEmployeeDay.set(
            `${employeeCode.toLowerCase()}|${slot.date}`,
            this.slotToDailyRecord(slot, punchesForDay),
          );
        }
        return attendanceByEmployeeDay;
      }),
    );
  }

  fetchEmployeeRosterAttendance(
    employee: ApplicationFormRecord,
    fromDate: string,
    toDate: string,
  ): Observable<Map<string, AttendanceDailyRecord>> {
    const userId =
      employee.ExtEmpNo?.trim() ||
      employee.detail?.loginDetails.legacyCode?.trim() ||
      resolveAttendanceUserId(employee) ||
      employee.EmployeeCode;
    const query: AttendanceQuery = { mode: 'dateRange', userId, fromDate, toDate };
    return this.fetchPunches(query, [employee]).pipe(
      map((punches) => {
        const session = this.createSession(punches, [employee], query);
        const attendanceByEmployeeDay = new Map<string, AttendanceDailyRecord>();
        for (const slot of session.slots) {
          if (slot.status !== 'Present') {
            continue;
          }
          const punchesForDay = session.punchGroups.get(attendanceGroupKey(slot.employeeKey, slot.date)) ?? [];
          attendanceByEmployeeDay.set(
            `${employee.EmployeeCode.toLowerCase()}|${slot.date}`,
            this.slotToDailyRecord(slot, punchesForDay),
          );
        }
        return attendanceByEmployeeDay;
      }),
    );
  }

  materializeSlots(slotRefs: AttendanceSlotRef[]): AttendanceDailyRecord[] {
    const session = this.sessionState();
    if (!session) {
      return [];
    }

    return slotRefs.map((slot) => {
      const punches = sortPunchesChronologically(
        session.punchGroups.get(attendanceGroupKey(slot.employeeKey, slot.date)) ?? [],
      );
      return this.slotToDailyRecord(slot, punches);
    });
  }

  /** Fetches profile detail only for the given summaries (current page). */
  enrichEmployeeSummaries(summaries: ApplicationFormRecord[]): Observable<void> {
    const session = this.sessionState();
    if (!session || summaries.length === 0) {
      return of(void 0);
    }

    const targets = summaries.filter((record) => !!record.apiId?.trim());
    if (targets.length === 0) {
      return of(void 0);
    }

    return this.applicationFormService.fetchEmployeeProfileDetailsInBatches(targets, targets.length).pipe(
      last(),
      map((detailed) => {
        if (detailed.length === 0) {
          return;
        }

        const merged = this.applicationFormService.mergeEmployeeProfileRecordsForAttendance(
          session.employees,
          detailed,
        );
        const refreshed = this.createSessionFromEmployees(
          session.query,
          merged,
          session.punchGroups,
        );
        this.sessionState.set(refreshed);
      }),
      catchError(() => of(void 0)),
    );
  }

  getLastQuery(): AttendanceQuery {
    return { ...this.lastQuery };
  }

  clearSession(): void {
    this.sessionState.set(null);
  }

  getEmployeeSummariesForKeys(employeeKeys: string[]): ApplicationFormRecord[] {
    const session = this.sessionState();
    if (!session || employeeKeys.length === 0) {
      return [];
    }

    const wanted = new Set(employeeKeys);
    return session.employees.filter((employee) => {
      if (!employee.apiId?.trim()) {
        return false;
      }

      const userId = resolveAttendanceUserId(employee);
      const cardNo = employee.ExtEmpNo?.trim();
      if (!userId && !cardNo) {
        return false;
      }

      return [userId, cardNo]
        .filter((value): value is string => !!value)
        .some((value) => wanted.has(canonicalAttendanceKey(value)));
    });
  }

  private createSession(
    punches: AttendancePunchRecord[],
    employees: ApplicationFormRecord[],
    query: AttendanceQuery,
  ): AttendanceSession {
    const queryDates = resolveQueryDates(query);
    const index = buildEmployeeAttendanceIndex(employees);
    const punchGroups = new Map<string, AttendancePunchRecord[]>();

    for (const punch of punches) {
      const punchDate = extractIsoDate(punch.PunchDatetime);
      if (!punchDate) {
        continue;
      }

      const employeeKey = resolvePunchKey(punch.EmployeeId, index.aliasToCanonical);
      if (!employeeKey) {
        continue;
      }

      registerPunchEmployeeAliases(index, employeeKey, punch.EmployeeId);
      ensurePunchOnlyEmployee(index, employeeKey, punch.EmployeeId);
      attachEmployeeNameFromAliases(index, employeeKey, punch.EmployeeId);

      const groupKey = attendanceGroupKey(employeeKey, punchDate);
      const group = punchGroups.get(groupKey) ?? [];
      group.push(punch);
      punchGroups.set(groupKey, group);
    }

    const slots = this.buildAttendanceSlots(query, queryDates, index, punchGroups);

    return {
      query,
      employees,
      index,
      punchGroups,
      slots,
    };
  }

  private createSessionFromEmployees(
    query: AttendanceQuery,
    employees: ApplicationFormRecord[],
    punchGroups: Map<string, AttendancePunchRecord[]>,
  ): AttendanceSession {
    const queryDates = resolveQueryDates(query);
    const index = buildEmployeeAttendanceIndex(employees);

    for (const groupKey of punchGroups.keys()) {
      const parsed = parseAttendanceGroupKey(groupKey);
      if (!parsed) {
        continue;
      }
      const punches = punchGroups.get(groupKey) ?? [];
      const rawId = punches[0]?.EmployeeId ?? parsed.employeeKey;
      registerPunchEmployeeAliases(index, parsed.employeeKey, rawId);
      ensurePunchOnlyEmployee(index, parsed.employeeKey, rawId);
      attachEmployeeNameFromAliases(index, parsed.employeeKey, rawId);
    }

    const slots = this.buildAttendanceSlots(query, queryDates, index, punchGroups);

    return {
      query,
      employees,
      index,
      punchGroups,
      slots,
    };
  }

  private buildAttendanceSlots(
    query: AttendanceQuery,
    queryDates: string[],
    index: EmployeeAttendanceIndex,
    punchGroups: Map<string, AttendancePunchRecord[]>,
  ): AttendanceSlotRef[] {
    const slots: AttendanceSlotRef[] = [];
    const covered = new Set<string>();

    for (const [groupKey, dayPunches] of punchGroups) {
      const parsed = parseAttendanceGroupKey(groupKey);
      if (!parsed) {
        continue;
      }

      const displayId =
        index.displayIdByKey.get(parsed.employeeKey) ?? formatAttendanceUserId(parsed.employeeKey);
      const employeeName = index.nameByKey.get(parsed.employeeKey) ?? '';
      slots.push(
        this.buildSlotRef(parsed.employeeKey, displayId, employeeName, parsed.date, dayPunches),
      );
      covered.add(groupKey);
    }

    const rosterKeys = collectRosterEmployeeKeys(query, index);
    for (const employeeKey of rosterKeys) {
      const displayId = index.displayIdByKey.get(employeeKey) ?? formatAttendanceUserId(employeeKey);
      const employeeName = index.nameByKey.get(employeeKey) ?? '';

      for (const date of queryDates) {
        const groupKey = attendanceGroupKey(employeeKey, date);
        if (covered.has(groupKey)) {
          continue;
        }
        slots.push(this.buildSlotRef(employeeKey, displayId, employeeName, date, []));
      }
    }

    return slots.sort(compareAttendanceSlots);
  }

  private buildSlotRef(
    employeeKey: string,
    displayId: string,
    employeeName: string,
    date: string,
    punches: AttendancePunchRecord[],
  ): AttendanceSlotRef {
    // API returns punch rows only (no punch-in / punch-out fields). Any row = Present.
    if (punches.length === 0) {
      return {
        employeeKey,
        displayId,
        employeeName,
        date,
        status: 'Absent',
        punchIn: '',
        punchOut: '',
        punchInDevice: '',
        punchOutDevice: '',
        workingMinutes: 0,
        workingHours: '',
        punchCount: 0,
      };
    }

    const sorted = sortPunchesChronologically(punches);
    const firstPunch = sorted[0];
    const secondPunch = sorted.length >= 2 ? sorted[1] : null;
    const workingHours = sorted.find((punch) => punch.WorkingHours?.trim())?.WorkingHours?.trim() ?? '';

    return {
      employeeKey,
      displayId,
      employeeName,
      date,
      status: 'Present',
      punchIn: firstPunch.PunchDatetime,
      punchOut: secondPunch?.PunchDatetime ?? '',
      punchInDevice: firstPunch.DeviceNo,
      punchOutDevice: secondPunch?.DeviceNo ?? '',
      workingMinutes:
        parseWorkingDurationMinutes(workingHours) ??
        calcWorkingMinutes(firstPunch.PunchDatetime, secondPunch?.PunchDatetime ?? ''),
      workingHours,
      punchCount: sorted.length,
    };
  }

  private slotToDailyRecord(slot: AttendanceSlotRef, punches: AttendancePunchRecord[]): AttendanceDailyRecord {
    const sorted = sortPunchesChronologically(punches);

    return {
      EmployeeId: slot.displayId,
      EmployeeName: slot.employeeName,
      AttendanceDate: slot.date,
      PunchIn: slot.punchIn,
      PunchOut: slot.punchOut,
      PunchInDevice: slot.punchInDevice,
      PunchOutDevice: slot.punchOutDevice,
      WorkingMinutes: slot.workingMinutes,
      WorkingHours: slot.workingHours,
      AttendanceStatus: slot.status,
      PunchCount: slot.punchCount,
      Punches: sorted,
      selected: false,
    };
  }

  /**
   * Pioneer biometrics endpoints (see API docs):
   * - Today all:        /EmployeeData
   * - Today employee:   /EmployeeData/{employeeId}
   * - Date all:         /EmployeeData/Date/{yyyy-MM-dd}
   * - Date employee:    /EmployeeData/Date/{yyyy-MM-dd}/{employeeId}
   * - Range all:        /EmployeeData/DateRange/{from}/{to}/
   * - Range employee:   /EmployeeData/DateRange/{from}/{to}/{employeeId}
   */
  buildQueryUrl(query: AttendanceQuery, cardNo?: string): string {
    const normalized = this.normalizeQuery(query);
    const dates = resolveAttendanceRequestDates(normalized);
    const params = new URLSearchParams({
      from_date: dates.fromDate,
      to_date: dates.toDate,
      type: 'calculated',
    });
    const requestCardNo = cardNo?.trim() || normalized.userId?.trim();
    if (requestCardNo) {
      params.set('card_no', formatAttendanceCardNo(requestCardNo));
    }
    return `${BIOMETRICS_API_BASE_URL}/rawpunch?${params.toString()}`;
  }

  /** Fallback when the scoped URL returns no rows or fails. */
  buildFallbackPunchUrl(query: AttendanceQuery): string {
    return this.buildQueryUrl(query);
  }

  fetchCalculatedWorkingHours(query: AttendanceQuery, extEmpNo: string): Observable<string | null> {
    if (!extEmpNo.trim()) {
      return of(null);
    }

    return this.http
      .get(this.buildQueryUrl(query, extEmpNo), {
        headers: new HttpHeaders({ 'X-API-Key': BIOMETRICS_API_KEY }),
        responseType: 'text',
      })
      .pipe(
        map((response) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(response) as unknown;
          } catch {
            return null;
          }

          const hours = this.extractApiItems(parsed)
            .map((item) => item.hours_worked)
            .find((value): value is string => typeof value === 'string' && !!value.trim());
          return hours?.trim() ?? null;
        }),
        catchError(() => of(null)),
      );
  }

  fetchCalculatedWorkingHoursByDate(
    query: AttendanceQuery,
    extEmpNo: string,
  ): Observable<Array<{ date: string; hoursWorked: string }>> {
    if (!extEmpNo.trim()) {
      return of([]);
    }

    return this.http
      .get(this.buildQueryUrl(query, extEmpNo), {
        headers: new HttpHeaders({ 'X-API-Key': BIOMETRICS_API_KEY }),
        responseType: 'text',
      })
      .pipe(
        map((response) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(response) as unknown;
          } catch {
            return [];
          }

          return this.extractApiItems(parsed).flatMap((item) => {
            const dateValue = item.date ?? item.Date ?? item.attendance_date ?? item.AttendanceDate ??
              item.attendanceDate ?? item.punch_date ?? item.PunchDate ?? item.punchDate ??
              item.PunchDatetime ?? item.punch_in;
            const date = typeof dateValue === 'string'
              ? dateValue.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0]
              : undefined;
            const hoursValue = item.hours_worked;
            const hoursWorked = typeof hoursValue === 'string' || typeof hoursValue === 'number'
              ? String(hoursValue).trim()
              : '';
            return date && hoursWorked ? [{ date, hoursWorked }] : [];
          });
        }),
        catchError(() => of([])),
      );
  }

  private fetchPunches(
    query: AttendanceQuery,
    employees: ApplicationFormRecord[],
  ): Observable<AttendancePunchRecord[]> {
    const normalized = this.normalizeQuery(query);
    const requestedCardNo = normalized.userId?.trim();
    if (!requestedCardNo) {
      return this.loadPunchUrl(this.buildQueryUrl(normalized));
    }

    const legacyCode = resolveEmployeeLegacyCode(normalized.userId ?? '', employees);
    return this.loadPunchUrl(this.buildQueryUrl(normalized, legacyCode || requestedCardNo));
  }

  private loadPunchUrl(url: string): Observable<AttendancePunchRecord[]> {

    const parse = (response: unknown): AttendancePunchRecord[] => {
      if (typeof response === 'string') {
        const trimmed = response.trim();
        if (trimmed.startsWith('<!') || trimmed.toLowerCase().startsWith('<html')) {
          throw new Error(
            'Biometrics proxy is not configured. Deploy with public/web.config (IIS ARR proxy for /biometrics-api) or use ng serve with proxy.conf.json.',
          );
        }

        try {
          response = JSON.parse(trimmed) as unknown;
        } catch {
          throw new Error('Biometrics API returned invalid JSON.');
        }
      }

      return this.extractApiItems(response).flatMap((item) => this.mapApiItem(item));
    };

    const loadUrl = (url: string) =>
      this.http
        .get(url, {
          headers: new HttpHeaders({ 'X-API-Key': BIOMETRICS_API_KEY }),
          responseType: 'text',
        })
        .pipe(
        map((text) => parse(text)),
        catchError((error: unknown) => {
          const status = (error as { status?: number })?.status;
          if (status === 0) {
            return throwError(
              () =>
                new Error(
                  'Biometrics API is unreachable. Check the network connection and confirm pioneerattendance.com:3002 is available through /biometrics-api.',
                ),
            );
          }

          if (status === 502 || status === 504) {
            return throwError(
              () =>
                new Error(
                  `Biometrics API proxy could not reach pioneerattendance.com:3002 (HTTP ${status}). Verify that the attendance API server is running and reachable.`,
                ),
            );
          }

          const statusText = (error as { statusText?: string })?.statusText;
          return throwError(
            () =>
              new Error(
                `Biometrics API request failed${status ? ` (HTTP ${status})` : ''}${statusText ? `: ${statusText}` : '.'}`,
              ),
          );
        }),
      );

    return loadUrl(url);
  }

  private buildFallbackPunchUrls(query: AttendanceQuery): string[] {
    return [];
  }

  private normalizeQuery(query: AttendanceQuery): AttendanceQuery {
    return {
      mode: query.mode,
      userId: query.userId?.trim() || undefined,
      date: query.date?.trim() || undefined,
      fromDate: query.fromDate?.trim() || undefined,
      toDate: query.toDate?.trim() || undefined,
    };
  }

  private mapApiItem(item: BiometricsPunchApiRecord): AttendancePunchRecord[] {
    const record = item as Record<string, unknown>;
    const punchIn = String(item.punch_in ?? '').trim();
    const punchOut = String(item.punch_out ?? '').trim();
    const dateValue = pickFirstNonEmptyString(
      item.date,
      item.Date,
      item.attendance_date,
      item.AttendanceDate,
      item.attendanceDate,
      item.punch_date,
      item.PunchDate,
      item.punchDate,
      punchIn,
      punchOut,
    );
    const punchDatetime = String(
      item.PunchDatetime ??
        item.punchDatetime ??
        item['Punch Datetime'] ??
        record['PunchDateTime'] ??
        record['punchDateTime'] ??
        record['DateTime'] ??
        record['dateTime'] ??
        '',
    ).trim();
    const rawEmployeeId = pickFirstNonEmptyString(
      item['Employee ID'],
      item.EmployeeId,
      item.employeeId,
      record['employeeID'],
      record['EmployeeID'],
      item['User ID'],
      item.userId,
      item.UserId,
      item.card_no,
    );
    const normalizedEmployeeId =
      canonicalAttendanceKey(rawEmployeeId) || extractAttendanceUserId(rawEmployeeId) || rawEmployeeId;

    const no = Number(item.No ?? item.id ?? record['no'] ?? 0);
    const deviceNo = String(
      item['Device No'] ?? item.DeviceNo ?? item.deviceNo ?? item.machine_id ?? record['DeviceNo'] ?? '',
      ).trim();
    const status = String(item.Status ?? item.status ?? '').trim();
    const workingHours = typeof item.hours_worked === 'string' || typeof item.hours_worked === 'number'
      ? String(item.hours_worked).trim()
      : '';

    if (punchIn || punchOut) {
      return [
        ...(punchIn ? [{ No: no, PunchDatetime: joinPunchDateAndTime(dateValue, punchIn) }] : []),
        ...(punchOut ? [{ No: no + 1, PunchDatetime: joinPunchDateAndTime(dateValue, punchOut) }] : []),
      ].map((punch) => ({
        ...punch,
        EmployeeId: normalizedEmployeeId,
        DeviceNo: deviceNo,
        Status: status,
        ...(workingHours ? { WorkingHours: workingHours } : {}),
        selected: false,
      }));
    }

    return [{
      No: no,
      EmployeeId: normalizedEmployeeId,
      PunchDatetime: punchDatetime,
      DeviceNo: deviceNo,
      Status: status,
      ...(workingHours ? { WorkingHours: workingHours } : {}),
      selected: false,
    }];
  }

  private extractApiItems(response: unknown): BiometricsPunchApiRecord[] {
    if (Array.isArray(response)) {
      return response.filter((item): item is BiometricsPunchApiRecord => !!item && typeof item === 'object');
    }

    if (!response || typeof response !== 'object') {
      return [];
    }

    const root = response as Record<string, unknown>;
    const candidates = [
      root['data'],
      root['Data'],
      root['items'],
      root['Items'],
      root['records'],
      root['Records'],
      root['employeeData'],
      root['EmployeeData'],
      root['result'],
      root['Result'],
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter((item): item is BiometricsPunchApiRecord => !!item && typeof item === 'object');
      }
      if (candidate && typeof candidate === 'object') {
        const nestedItems = this.extractApiItems(candidate);
        if (nestedItems.length) {
          return nestedItems;
        }
      }
    }

    if (
      root['Employee ID'] ||
      root['EmployeeId'] ||
      root['employeeId'] ||
      root['card_no'] ||
      root['punch_in'] !== undefined ||
      root['punch_out'] !== undefined ||
      root['hours_worked'] !== undefined ||
      root['PunchDatetime'] ||
      root['punchDatetime']
    ) {
      return [root as BiometricsPunchApiRecord];
    }

    return [];
  }
}

export function extractAttendanceUserId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '—') {
    return '';
  }

  const empMatch = trimmed.match(/^Emp-(\d+)$/i);
  if (empMatch) {
    return empMatch[1];
  }

  return trimmed;
}

export function resolveAttendanceUserId(employee: ApplicationFormRecord): string {
  const candidates = [
    employee.userId,
    employee.detail?.loginDetails.userId,
  ];

  for (const candidate of candidates) {
    const userId = extractAttendanceUserId(String(candidate ?? '').trim());
    if (/^\d+$/.test(userId)) {
      return userId;
    }
  }

  const employeeCode = employee.EmployeeCode?.trim();
  if (employeeCode && employeeCode !== '—') {
    const fromCode = extractAttendanceUserId(employeeCode);
    if (/^\d+$/.test(fromCode)) {
      return fromCode;
    }
  }

  return '';
}

function resolveEmployeeLegacyCode(userId: string, employees: ApplicationFormRecord[]): string {
  const requestedUserKey = canonicalAttendanceKey(extractAttendanceUserId(userId));
  if (!requestedUserKey) {
    return '';
  }

  const employee = employees.find((record) =>
    [
      resolveAttendanceUserId(record),
      record.userId,
      record.EmployeeCode,
      record.detail?.loginDetails.userId,
      record.detail?.loginDetails.employeeCode,
    ].some((candidate) =>
      !!candidate &&
      canonicalAttendanceKey(extractAttendanceUserId(candidate)) === requestedUserKey,
    ),
  );

  return employee?.ExtEmpNo?.trim() || employee?.detail?.loginDetails.legacyCode?.trim() || '';
}

/** Normalizes biometric / login ids to a shared comparable key (8-digit numeric when possible). */
export function canonicalAttendanceKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const empMatch = trimmed.match(/^Emp-(\d+)$/i);
  if (empMatch) {
    return empMatch[1].padStart(8, '0');
  }

  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(8, '0');
  }

  return trimmed.toLowerCase();
}

export function formatAttendanceUserId(value: string): string {
  const extracted = extractAttendanceUserId(value);
  if (/^\d+$/.test(extracted)) {
    return `Emp-${extracted.padStart(8, '0')}`;
  }
  return extracted || value.trim();
}

export function normalizeEmployeeId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(8, '0');
  }
  return trimmed;
}

export function resolveQueryDates(query: AttendanceQuery): string[] {
  switch (query.mode) {
    case 'today':
      return [formatIsoDate(new Date())];
    case 'date':
      return [query.date?.trim() || formatIsoDate(new Date())];
    case 'dateRange': {
      const fromDate = query.fromDate?.trim() || formatIsoDate(new Date());
      const toDate = query.toDate?.trim() || fromDate;
      const [start, end] = normalizeDateRange(fromDate, toDate);
      return enumerateIsoDates(start, end);
    }
  }
}

function biometricsPathEmployeeId(userId: string): string {
  const extracted = extractAttendanceUserId(userId);
  if (!extracted) {
    return userId.trim();
  }

  const canonical = canonicalAttendanceKey(extracted);
  if (/^\d{8}$/.test(canonical)) {
    return canonical;
  }

  return extracted;
}

function formatAttendanceCardNo(value: string): string {
  const digits = extractAttendanceUserId(value);
  return /^\d+$/.test(digits) ? digits.padStart(8, '0') : value.trim();
}

function resolveAttendanceRequestDates(query: AttendanceQuery): { fromDate: string; toDate: string } {
  if (query.mode === 'date') {
    const date = query.date ?? formatIsoDate(new Date());
    return { fromDate: date, toDate: date };
  }

  if (query.mode === 'dateRange') {
    const fromDate = query.fromDate ?? formatIsoDate(new Date());
    const toDate = query.toDate ?? fromDate;
    const [rangeStart, rangeEnd] = normalizeDateRange(fromDate, toDate);
    return { fromDate: rangeStart, toDate: rangeEnd };
  }

  const today = formatIsoDate(new Date());
  return { fromDate: today, toDate: today };
}

function pickFirstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const text = value === undefined || value === null ? '' : String(value).trim();
    if (text) {
      return text;
    }
  }
  return '';
}

interface EmployeeAttendanceIndex {
  aliasToCanonical: Map<string, string>;
  nameByKey: Map<string, string>;
  displayIdByKey: Map<string, string>;
}

function attendanceKeyVariants(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const variants = new Set<string>();
  variants.add(trimmed);
  variants.add(trimmed.toLowerCase());

  const canonical = canonicalAttendanceKey(trimmed);
  if (canonical) {
    variants.add(canonical);
  }

  if (/^\d+$/.test(trimmed)) {
    variants.add(trimmed.padStart(8, '0'));
    variants.add(String(Number.parseInt(trimmed, 10)));
  }

  const empMatch = trimmed.match(/^Emp-(\d+)$/i);
  if (empMatch) {
    const digits = empMatch[1];
    variants.add(digits.padStart(8, '0'));
    variants.add(digits);
    variants.add(String(Number.parseInt(digits, 10)));
  }

  return Array.from(variants).filter(Boolean);
}

function registerEmployeeAliases(
  index: EmployeeAttendanceIndex,
  canonical: string,
  displayId: string,
  employeeName: string,
  candidates: Array<string | undefined>,
): void {
  if (!index.nameByKey.has(canonical)) {
    index.nameByKey.set(canonical, employeeName);
  }
  if (!index.displayIdByKey.has(canonical)) {
    index.displayIdByKey.set(canonical, formatAttendanceUserId(displayId));
  }

  for (const candidate of candidates) {
    if (!candidate?.trim()) {
      continue;
    }
    for (const variant of attendanceKeyVariants(candidate)) {
      index.aliasToCanonical.set(variant, canonical);
    }
  }
}

function buildEmployeeAttendanceIndex(employees: ApplicationFormRecord[]): EmployeeAttendanceIndex {
  const index: EmployeeAttendanceIndex = {
    aliasToCanonical: new Map<string, string>(),
    nameByKey: new Map<string, string>(),
    displayIdByKey: new Map<string, string>(),
  };

  for (const employee of employees) {
    const rawUserId = resolveAttendanceUserId(employee);
    const cardNo = employee.ExtEmpNo?.trim() || '';
    if (!rawUserId && !cardNo) {
      continue;
    }

    const loginCode = employee.detail?.loginDetails.employeeCode?.trim() || '';
    const rawCode = employee.EmployeeCode?.trim();
    const employeeCode = rawCode && rawCode !== '—' ? rawCode : '';
    const canonical = canonicalAttendanceKey(cardNo || rawUserId);
    const employeeName = employee.EmployeeName?.trim() || '';

    registerEmployeeAliases(index, canonical, employee.apiId?.trim() || cardNo || rawUserId, employeeName, [
      rawUserId,
      cardNo,
      canonical,
      employee.userId,
      employee.detail?.loginDetails.userId,
      employeeCode,
      loginCode,
      employee.apiId,
    ]);
  }

  return index;
}

function attachEmployeeNameFromAliases(
  index: EmployeeAttendanceIndex,
  employeeKey: string,
  rawPunchId: string,
): void {
  if (index.nameByKey.get(employeeKey)?.trim()) {
    return;
  }

  for (const variant of attendanceKeyVariants(rawPunchId)) {
    const canonical = index.aliasToCanonical.get(variant);
    if (!canonical) {
      continue;
    }

    const name = index.nameByKey.get(canonical)?.trim();
    if (!name) {
      continue;
    }

    index.nameByKey.set(employeeKey, name);
    const displayId = index.displayIdByKey.get(canonical);
    if (displayId) {
      index.displayIdByKey.set(employeeKey, displayId);
    }
    return;
  }
}

function attendanceGroupKey(employeeKey: string, date: string): string {
  return `${employeeKey}|${date}`;
}

function parseAttendanceGroupKey(
  groupKey: string,
): { employeeKey: string; date: string } | null {
  const separatorIndex = groupKey.indexOf('|');
  if (separatorIndex <= 0) {
    return null;
  }

  const employeeKey = groupKey.slice(0, separatorIndex);
  const date = groupKey.slice(separatorIndex + 1);
  if (!employeeKey || !date) {
    return null;
  }

  return { employeeKey, date };
}

function registerPunchEmployeeAliases(
  index: EmployeeAttendanceIndex,
  employeeKey: string,
  rawPunchId: string,
): void {
  for (const variant of attendanceKeyVariants(rawPunchId)) {
    index.aliasToCanonical.set(variant, employeeKey);
  }
  if (!index.displayIdByKey.has(employeeKey)) {
    index.displayIdByKey.set(employeeKey, formatAttendanceUserId(rawPunchId));
  }
}

function compareAttendanceSlots(left: AttendanceSlotRef, right: AttendanceSlotRef): number {
  if (left.status !== right.status) {
    return left.status === 'Present' ? -1 : 1;
  }

  const dateCompare = right.date.localeCompare(left.date);
  if (dateCompare !== 0) {
    return dateCompare;
  }

  return left.displayId.localeCompare(right.displayId, undefined, { numeric: true });
}

function collectRosterEmployeeKeys(query: AttendanceQuery, index: EmployeeAttendanceIndex): string[] {
  const filteredId = query.userId?.trim();
  if (filteredId) {
    const key =
      resolvePunchKey(filteredId, index.aliasToCanonical) || canonicalAttendanceKey(filteredId);
    return key ? [key] : [];
  }

  return Array.from(index.nameByKey.keys()).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
}

function resolvePunchKey(rawEmployeeId: string, aliasToCanonical: Map<string, string>): string {
  const normalized = canonicalAttendanceKey(rawEmployeeId) || rawEmployeeId.trim();
  const lookupCandidates = normalized ? [normalized, rawEmployeeId] : [rawEmployeeId];

  for (const candidate of lookupCandidates) {
    for (const variant of attendanceKeyVariants(candidate)) {
      const canonical = aliasToCanonical.get(variant);
      if (canonical) {
        return canonical;
      }
    }
  }

  return normalized || rawEmployeeId.trim().toLowerCase();
}

function ensurePunchOnlyEmployee(
  index: EmployeeAttendanceIndex,
  canonical: string,
  rawEmployeeId: string,
): void {
  if (index.nameByKey.has(canonical)) {
    return;
  }

  index.nameByKey.set(canonical, '');
  index.displayIdByKey.set(canonical, formatAttendanceUserId(rawEmployeeId));
  for (const variant of attendanceKeyVariants(rawEmployeeId)) {
    index.aliasToCanonical.set(variant, canonical);
  }
}

function joinPunchDateAndTime(dateValue: string, punchValue: string): string {
  if (!punchValue || /^\d{4}-\d{2}-\d{2}[T\s]/.test(punchValue)) {
    return punchValue;
  }

  const date = extractIsoDate(dateValue);
  if (date && /^\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*[AP]M)?$/i.test(punchValue)) {
    return `${date}T${punchValue}`;
  }

  return punchValue;
}

function sortPunchesChronologically(punches: AttendancePunchRecord[]): AttendancePunchRecord[] {
  return [...punches].sort((left, right) => {
    const leftTime = Date.parse(left.PunchDatetime);
    const rightTime = Date.parse(right.PunchDatetime);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.No - right.No;
  });
}

function extractIsoDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) {
    return isoPrefix[1];
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    return `${dmyMatch[3]}-${month}-${day}`;
  }

  const dotnetMatch = trimmed.match(/\/Date\((\d+)\)\//);
  if (dotnetMatch) {
    const parsed = Number.parseInt(dotnetMatch[1], 10);
    if (Number.isFinite(parsed)) {
      return formatIsoDate(new Date(parsed));
    }
  }

  if (/^\d{10,13}$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    const millis = trimmed.length <= 10 ? parsed * 1000 : parsed;
    if (Number.isFinite(millis)) {
      return formatIsoDate(new Date(millis));
    }
  }

  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) {
    return formatIsoDate(new Date(parsed));
  }

  return '';
}

export function calcWorkingMinutes(punchIn: string, punchOut: string): number {
  const inTime = Date.parse(punchIn);
  const outTime = Date.parse(punchOut);
  if (!Number.isFinite(inTime) || !Number.isFinite(outTime) || outTime <= inTime) {
    return 0;
  }
  return Math.round((outTime - inTime) / 60000);
}

export function parseWorkingDurationMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const duration = trimmed.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/i);
  if (duration && (duration[1] !== undefined || duration[2] !== undefined)) {
    return Math.round(Number(duration[1] ?? 0) * 60 + Number(duration[2] ?? 0));
  }

  const numericHours = Number(trimmed);
  return Number.isFinite(numericHours) && numericHours >= 0
    ? Math.round(numericHours * 60)
    : null;
}

export function formatWorkingDuration(minutes: number): string {
  if (!minutes || minutes <= 0) {
    return '—';
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return `${remainder}m`;
  }
  if (remainder === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainder}m`;
}

export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeDateRange(fromDate: string, toDate: string): [string, string] {
  const from = Date.parse(fromDate);
  const to = Date.parse(toDate);
  if (Number.isFinite(from) && Number.isFinite(to) && from > to) {
    return [toDate, fromDate];
  }
  return [fromDate, toDate];
}

function enumerateIsoDates(fromDate: string, toDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) {
    return [fromDate];
  }

  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates.length > 0 ? dates : [fromDate];
}

export function formatPunchDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '—';
  }

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatPunchTime(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '—';
  }

  const match = trimmed.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const hours24 = Number(match[1]);
    const minutes = match[2];
    const seconds = match[3] ? `:${match[3]}` : '';
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    return `${hours12}:${minutes}${seconds} ${period}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  const hours24 = parsed.getHours();
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  const seconds = String(parsed.getSeconds()).padStart(2, '0');
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  const hasSeconds = parsed.getSeconds() > 0 || trimmed.includes(':');
  return `${hours12}:${minutes}${hasSeconds ? `:${seconds}` : ''} ${period}`;
}
