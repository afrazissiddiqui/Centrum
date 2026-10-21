import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { LeaveApplicationRecord } from '../../services/leave-application.service';
import { dashboardLeaveEvents } from './dashboard';

describe('dashboardLeaveEvents', () => {
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

    const events = dashboardLeaveEvents(applications, ['EMP-00000042']);

    expect(events).toHaveLength(11);
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
    ] as LeaveApplicationRecord[], ['Emp-00000011']);

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
});
