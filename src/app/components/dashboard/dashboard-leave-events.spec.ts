import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { ApplicationFormRecord } from '../../services/application-form.service';
import { LeaveApplicationRecord } from '../../services/leave-application.service';
import { dashboardEmployeeCode, dashboardLeaveEvents } from './dashboard';

describe('dashboardLeaveEvents', () => {
  it('uses the employee code associated with the signed-in profile login', () => {
    const employee = {
      EmployeeCode: 'Emp-00000011',
      detail: {
        loginDetails: {
          employeeCode: 'Emp-00000030',
        },
      },
    } as ApplicationFormRecord;

    expect(dashboardEmployeeCode(employee)).toBe('Emp-00000011');
  });

  it('expands the signed-in employee leave request to every inclusive date', () => {
    const applications = [
      {
        Id: 15,
        EmployeeId: 'Emp-00000042',
        LeaveType: 'Annual Leave',
        RequestStatus: 'Submitted',
        FromDate: '2026-10-10',
        ToDate: '2026-10-20',
      },
      {
        Id: 16,
        EmployeeId: 'EMP-00000043',
        LeaveType: 'Sick Leave',
        RequestStatus: 'Approved',
        FromDate: '2026-10-12',
        ToDate: '2026-10-12',
      },
      {
        Id: 17,
        EmployeeId: 'EMP-00000042',
        LeaveType: 'Annual Leave',
        RequestStatus: 'Rejected',
        FromDate: '2026-10-12',
        ToDate: '2026-10-12',
      },
    ] as LeaveApplicationRecord[];

    const events = dashboardLeaveEvents(applications);

    expect(events).toHaveLength(12);
    expect(events[0]).toMatchObject({
      date: '2026-10-10',
      title: 'Annual Leave',
      category: 'pending',
    });
    expect(events[10]).toMatchObject({
      date: '2026-10-20',
      title: 'Annual Leave',
      category: 'pending',
    });
    expect(events[11]).toMatchObject({
      date: '2026-10-12',
      title: 'Sick Leave',
      category: 'approved',
    });
  });

  it('shows Manzoor’s submitted leave range when API dates use mixed formats', () => {
    const events = dashboardLeaveEvents([
      {
        Id: 18,
        EmployeeId: 'Emp-00000011',
        LeaveType: 'Special',
        RequestStatus: 'Submitted',
        FromDate: '01/10/2026',
        ToDate: '2026-10-10T00:00:00.000000Z',
      },
    ] as LeaveApplicationRecord[]);

    expect(events).toHaveLength(10);
    expect(events[0]).toMatchObject({
      date: '2026-10-01',
      title: 'Special Leave',
      category: 'pending',
    });
    expect(events[9]).toMatchObject({
      date: '2026-10-10',
      category: 'pending',
    });
  });

  it('displays employee-scoped leave when the API response omits employee id', () => {
    const events = dashboardLeaveEvents([{
      Id: 19,
      EmployeeId: '—',
      LeaveType: 'Annual Leave',
      RequestStatus: 'Submitted',
      FromDate: '2026-10-12',
      ToDate: '2026-10-14',
    } as LeaveApplicationRecord]);

    expect(events.map((event) => event.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
    ]);
  });
});
