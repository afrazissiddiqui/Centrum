import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { dashboardComponent } from './dashboard';

describe('Dashboard', () => {
  let component: dashboardComponent;
  let fixture: ComponentFixture<dashboardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [dashboardComponent],
      providers: [
        { provide: Router, useValue: { navigateByUrl: () => Promise.resolve(true) } },
        { provide: AuthService, useValue: { getSessionUser: () => ({ name: 'Alex Wong' }) } },
        { provide: PermissionService, useValue: { canAccess: () => true } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(dashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('builds a six-week calendar and moves between months', () => {
    const initialMonth = component.monthAnchor();
    expect(component.calendarDays().length).toBe(42);
    expect(component.visibleWeekdays()).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);

    component.changeMonth(1);

    expect(component.monthAnchor().getMonth()).toBe((initialMonth.getMonth() + 1) % 12);
    expect(component.monthAnchor().getFullYear()).toBe(
      initialMonth.getMonth() === 11 ? initialMonth.getFullYear() + 1 : initialMonth.getFullYear(),
    );
    expect(component.selectedDate().getDate()).toBe(1);
  });

  it('selects dates and surfaces matching employee calendar events', () => {
    const selectedDate = component.selectedDate();
    component.calendarEvents.set([
      {
        id: 'company-event',
        title: 'Company town hall',
        date: [
          selectedDate.getFullYear(),
          String(selectedDate.getMonth() + 1).padStart(2, '0'),
          String(selectedDate.getDate()).padStart(2, '0'),
        ].join('-'),
        category: 'approved',
      },
    ]);

    const selectedDay = component.calendarDays().find((day) => day.isSelected);
    expect(selectedDay?.events.map((event) => event.title)).toEqual(['Company town hall']);
  });

  it('returns to the current month from a different date', () => {
    component.changeMonth(1);

    component.goToToday();

    expect(component.monthAnchor().getMonth()).toBe(new Date().getMonth());
    expect(component.monthAnchor().getFullYear()).toBe(new Date().getFullYear());
    expect(component.selectedDate().getDate()).toBe(new Date().getDate());
  });

  it('shows the selected Monday-to-Sunday week', () => {
    component.activeView.set('week');

    const week = component.visibleCalendarDays();

    expect(week.length).toBe(7);
    expect(component.visibleWeekdays().length).toBe(7);
    expect(week[0].date.getDay()).toBe(1);
    expect(week[6].date.getDay()).toBe(0);
  });

  it('shows a single weekday heading in day view', () => {
    component.activeView.set('day');

    expect(component.visibleWeekdays()).toEqual([
      new Intl.DateTimeFormat('en', { weekday: 'long' }).format(component.selectedDate()),
    ]);
    expect(component.visibleCalendarDays().length).toBe(1);
  });

  it('shows request and milestone sections without inventing records', () => {
    const requestSection = fixture.nativeElement.querySelector('.requests-card') as HTMLElement;
    const milestoneSection = fixture.nativeElement.querySelector('.milestones-card') as HTMLElement;

    expect(requestSection.textContent).toContain('0 Active Requests');
    expect(requestSection.textContent).toContain('No submitted requests yet');
    expect(requestSection.querySelectorAll('.request-row').length).toBe(0);
    expect(milestoneSection.textContent).toContain('You’re all caught up');
    expect(milestoneSection.querySelectorAll('.milestone-row').length).toBe(0);
  });

  it('counts submitted requests while excluding withdrawn requests', () => {
    component.submittedRequests.set([
      {
        id: 'request-approved',
        title: 'Annual leave',
        summary: 'Five working days',
        dateLabel: 'Nov 03 – Nov 07',
        status: 'Approved',
        statusType: 'approved',
      },
      {
        id: 'request-withdrawn',
        title: 'Personal leave',
        summary: 'One day',
        dateLabel: 'Nov 12',
        status: 'Withdrawn',
        statusType: 'withdrawn',
      },
    ]);

    expect(component.activeRequestCount()).toBe(1);
  });
});
