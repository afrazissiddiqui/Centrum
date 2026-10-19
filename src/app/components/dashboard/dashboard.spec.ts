import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { PublicHolidayRecord, PublicHolidayService } from '../../services/public-holiday.service';
import { dashboardComponent } from './dashboard';

describe('Dashboard', () => {
  let component: dashboardComponent;
  let fixture: ComponentFixture<dashboardComponent>;
  let sessionUser: { name: string; is_admin: boolean };

  beforeEach(async () => {
    sessionUser = { name: 'Alex Wong', is_admin: false };
    await TestBed.configureTestingModule({
      imports: [dashboardComponent],
      providers: [
        { provide: Router, useValue: { navigateByUrl: () => Promise.resolve(true) } },
        { provide: AuthService, useValue: { getSessionUser: () => sessionUser } },
        { provide: PermissionService, useValue: { canAccess: () => true } },
        {
          provide: PublicHolidayService,
          useValue: {
            fetchPublicHolidays: () => of([]),
            addPublicHoliday: () => of({ status: true }),
          },
        },
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

  it('loads company public holidays into the calendar with their company label', () => {
    const holiday: PublicHolidayRecord = {
      id: 'holiday-1',
      date: '2026-03-23',
      description: 'Pakistan Day',
      company: 'Al Hafiz',
    };
    const publicHolidayService = TestBed.inject(PublicHolidayService);
    spyOn(publicHolidayService, 'fetchPublicHolidays').and.returnValue(of([holiday]));

    component.ngOnInit();

    expect(component.calendarEvents()).toContain({
      id: 'public-holiday-holiday-1',
      title: 'Pakistan Day',
      date: '2026-03-23',
      category: 'holiday',
      location: 'Al Hafiz',
      description: 'Pakistan Day',
    });
  });

  it('marks every Sunday as a weekly day off in calendar views', () => {
    component.selectedDate.set(new Date(2026, 9, 11, 12));
    component.activeView.set('day');

    expect(component.visibleCalendarDays()[0].events).toContain({
      id: 'weekly-day-off-2026-10-11',
      title: 'Weekly Day Off',
      date: '2026-10-11',
      category: 'dayoff',
    });
  });

  it('assigns different colors to each listed public holiday', () => {
    const publicHolidayService = TestBed.inject(PublicHolidayService);
    spyOn(publicHolidayService, 'fetchPublicHolidays').and.returnValue(of([
      { id: '1', date: '2026-03-23', description: 'Pakistan Day' },
      { id: '2', date: '2026-05-01', description: 'Labour Day' },
    ]));

    component.ngOnInit();

    expect(component.calendarEvents()
      .filter((event) => event.category === 'holiday')
      .map((event) => event.holidayColorIndex)).toEqual([1, 2]);
  });

  it('shows the add holiday action only to administrators', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.holiday-add-button')).toBeNull();

    sessionUser.is_admin = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.holiday-add-button')).not.toBeNull();
  });

  it('posts an administrator holiday and selects its calendar date', () => {
    sessionUser.is_admin = true;
    const holiday: PublicHolidayRecord = {
      id: 'holiday-10',
      date: '2026-10-10',
      description: 'Pakistan Day',
    };
    const publicHolidayService = TestBed.inject(PublicHolidayService);
    spyOn(publicHolidayService, 'fetchPublicHolidays').and.returnValue(of([holiday]));
    const addHoliday = spyOn(publicHolidayService, 'addPublicHoliday').and.returnValue(of({ status: true }));

    component.openHolidayDialog();
    component.holidayDate.set('2026-10-10');
    component.holidayDescription.set('Pakistan Day');
    component.submitPublicHoliday();

    expect(addHoliday).toHaveBeenCalledWith({
      date: '2026-10-10',
      description: 'Pakistan Day',
    });
    expect(component.monthAnchor().getMonth()).toBe(9);
    expect(component.monthAnchor().getDate()).toBe(1);
    expect(component.selectedDate().getDate()).toBe(10);
    expect(component.calendarEvents().some((event) =>
      event.category === 'holiday' && event.date === '2026-10-10' && event.title === 'Pakistan Day',
    )).toBe(true);
    expect(component.holidayDialogOpen()).toBe(false);
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
