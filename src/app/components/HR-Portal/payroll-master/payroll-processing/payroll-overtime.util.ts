import type { OvertimeListRecord } from '../../../../services/overtime-list.service';

export function sumSubmittedOvertimeHours(
  records: OvertimeListRecord[],
  employeeKeys: string[],
  payrollMonth: string,
): number {
  const normalizedEmployeeKeys = new Set(
    employeeKeys.map(normalizeKey).filter(Boolean),
  );

  return records.reduce((total, record) => {
    const values = record.values;
    const flag = getValue(values, ['flag']);
    if (!isSubmitted(flag)) {
      return total;
    }

    const matchesEmployee = getValues(values, ['employeeCode', 'employeeId']).some(
      (employeeKey) => normalizedEmployeeKeys.has(normalizeKey(employeeKey)),
    );
    if (!matchesEmployee) {
      return total;
    }

    const overtimeDate = getValue(values, ['overtimeDate', 'otDate', 'date']);
    if (getPayrollMonth(overtimeDate) !== payrollMonth) {
      return total;
    }

    const overtimeHours = Number(getValue(values, ['overtimeHours']) ?? 0);
    return total + (Number.isFinite(overtimeHours) && overtimeHours > 0 ? overtimeHours : 0);
  }, 0);
}

function getValue(record: Record<string, unknown>, keys: string[]): unknown {
  return getValues(record, keys)[0];
}

function getValues(record: Record<string, unknown>, keys: string[]): unknown[] {
  const normalizedKeys = new Set(keys.map(normalizeKey));
  return Object.entries(record)
    .filter(
      ([key, value]) =>
        normalizedKeys.has(normalizeKey(key)) &&
        value !== undefined &&
        value !== null &&
        String(value).trim() !== '',
    )
    .map(([, value]) => value);
}

function normalizeKey(value: unknown): string {
  return String(value ?? '').toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSubmitted(value: unknown): boolean {
  return value === true || ['1', 'true', 'yes'].includes(String(value ?? '').trim().toLocaleLowerCase());
}

function getPayrollMonth(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof value !== 'string') {
    return '';
  }
  const match = value.trim().match(/^(\d{4})-(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}` : '';
}
