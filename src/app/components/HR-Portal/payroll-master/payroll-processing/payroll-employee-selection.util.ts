export function selectPayrollEmployeesForSubmission<T>(
  employees: readonly T[],
  isApproved: (employee: T) => boolean,
): T[] {
  const approvedEmployees = employees.filter(isApproved);
  return approvedEmployees.length > 0 ? approvedEmployees : [...employees];
}
