import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  getNavigableHrMenuActions,
  HrMenuAction,
  resolveRecruitmentRoute,
} from '../../config/hr-menu.config';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { PublicHolidayService } from '../../services/public-holiday.service';

export type CompanyCalendarEventCategory = 'approved' | 'pending' | 'remote' | 'holiday' | 'dayoff' | 'office';

export interface CompanyCalendarEvent {
  id: string;
  title: string;
  date: string;
  category: CompanyCalendarEventCategory;
  time?: string;
  location?: string;
  description?: string;
  holidayColorIndex?: number;
}

export type DashboardRequestStatus = 'approved' | 'pending' | 'review' | 'withdrawn';

export interface DashboardSubmittedRequest {
  id: string;
  title: string;
  summary: string;
  dateLabel: string;
  status: string;
  statusType: DashboardRequestStatus;
}

export interface DashboardMilestone {
  id: string;
  date: string;
  title: string;
  description: string;
  detail?: string;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isWeekend: boolean;
  events: CompanyCalendarEvent[];
}

type CalendarView = 'month' | 'week' | 'day';

function calendarDate(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 12);
}

function firstOfMonth(date: Date): Date {
  return calendarDate(date.getFullYear(), date.getMonth(), 1);
}

function firstDayOfWeek(date: Date): Date {
  const mondayOffset = (date.getDay() + 6) % 7;
  return calendarDate(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset);
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class dashboardComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly permissionService = inject(PermissionService);
  private readonly publicHolidayService = inject(PublicHolidayService);
  private readonly today = new Date();
  private readonly hour = this.today.getHours();

  readonly menuActions = computed(() =>
    getNavigableHrMenuActions()
      .filter((action) => this.permissionService.canAccess(action.access))
      .map((action) =>
        action.value === 'recruitment'
          ? {
              ...action,
              route: resolveRecruitmentRoute((requirement) =>
                this.permissionService.canAccess(requirement),
              ),
            }
          : action,
      ),
  );

  readonly employeeName = computed(() => this.authService.getSessionUser()?.name?.trim() || 'there');
  readonly canManageCompanyHolidays = computed(() => this.authService.getSessionUser()?.is_admin === true);
  readonly accountEmail = computed(() => this.authService.getSessionUser()?.email?.trim() || '');
  readonly portalUserId = computed(() => this.authService.getSessionUser()?.id ?? null);
  readonly accountType = computed(() => this.authService.getSessionUser()?.is_admin ? 'Administrator' : 'Employee');
  readonly greeting = this.hour < 12 ? 'Good morning' : this.hour < 17 ? 'Good afternoon' : 'Good evening';
  readonly employeeServiceLabel = 'Employee Self-Service (ESS)';
  readonly calendarEvents = signal<CompanyCalendarEvent[]>([]);
  readonly holidayLoadError = signal(false);
  readonly holidayDialogOpen = signal(false);
  readonly holidayDate = signal(dateKey(this.today));
  readonly holidayDescription = signal('');
  readonly holidaySaving = signal(false);
  readonly holidayCreateError = signal('');
  readonly holidayCreateSuccess = signal('');
  readonly submittedRequests = signal<DashboardSubmittedRequest[]>([]);
  readonly milestones = signal<DashboardMilestone[]>([]);
  readonly activeRequestCount = computed(() =>
    this.submittedRequests().filter((request) => request.statusType !== 'withdrawn').length,
  );
  readonly monthAnchor = signal(firstOfMonth(this.today));
  readonly selectedDate = signal(new Date(
    this.today.getFullYear(),
    this.today.getMonth(),
    this.today.getDate(),
    12,
  ));
  readonly activeView = signal<CalendarView>('month');
  readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(this.monthAnchor()),
  );
  readonly calendarTitle = computed(() =>
    this.activeView() === 'day'
      ? new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(this.selectedDate())
      : this.activeView() === 'week'
        ? this.weekLabel()
        : this.monthLabel(),
  );
  readonly upcomingTimeOff = computed(() => {
    const todayKey = dateKey(this.today);
    const upcomingAbsences = this.calendarEvents()
      .filter((event) => event.category === 'approved' && event.date >= todayKey)
      .sort((left, right) => left.date.localeCompare(right.date) || (left.time ?? '').localeCompare(right.time ?? ''));
    return upcomingAbsences[0] ?? null;
  });
  readonly calendarDays = computed<CalendarDay[]>(() => {
    const month = this.monthAnchor();
    const firstDay = firstOfMonth(month);
    const gridStart = firstDayOfWeek(firstDay);
    const selectedKey = dateKey(this.selectedDate());
    const todayKey = dateKey(this.today);

    return Array.from({ length: 42 }, (_, index) => {
      const date = calendarDate(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
      return {
        date,
        isCurrentMonth: date.getMonth() === month.getMonth(),
        isToday: dateKey(date) === todayKey,
        isSelected: dateKey(date) === selectedKey,
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        events: this.eventsForDate(date),
      };
    });
  });
  readonly visibleWeekdays = computed(() => {
    if (this.activeView() === 'day') {
      return [new Intl.DateTimeFormat('en', { weekday: 'long' }).format(this.selectedDate())];
    }
    if (this.activeView() === 'week') {
      const weekStart = firstDayOfWeek(this.selectedDate());
      return Array.from({ length: 7 }, (_, index) =>
        new Intl.DateTimeFormat('en', { weekday: 'long' }).format(
          calendarDate(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index),
        ),
      );
    }
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  });
  readonly visibleCalendarDays = computed(() => {
    switch (this.activeView()) {
      case 'week': {
        const weekStart = firstDayOfWeek(this.selectedDate());
        return Array.from({ length: 7 }, (_, index) => this.calendarDay(
          calendarDate(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index),
        ));
      }
      case 'day':
        return [this.calendarDay(this.selectedDate())];
      default:
        return this.calendarDays();
    }
  });
  readonly calendarWeeks = computed(() => {
    const days = this.visibleCalendarDays();
    const daysPerRow = this.activeView() === 'month' ? 7 : days.length;
    return Array.from({ length: Math.ceil(days.length / daysPerRow) }, (_, weekIndex) =>
      days.slice(weekIndex * daysPerRow, (weekIndex + 1) * daysPerRow),
    );
  });

  ngOnInit(): void {
    this.loadPublicHolidays();
  }

  openHolidayDialog(): void {
    if (!this.canManageCompanyHolidays()) {
      return;
    }
    this.holidayDate.set(dateKey(this.today));
    this.holidayDescription.set('');
    this.holidayCreateError.set('');
    this.holidayCreateSuccess.set('');
    this.holidayDialogOpen.set(true);
  }

  closeHolidayDialog(): void {
    if (!this.holidaySaving()) {
      this.holidayDialogOpen.set(false);
    }
  }

  submitPublicHoliday(): void {
    const date = this.holidayDate();
    const description = this.holidayDescription().trim();
    if (!this.canManageCompanyHolidays() || this.holidaySaving()) {
      return;
    }
    if (!this.isValidDateKey(date) || !description || description.length > 200) {
      this.holidayCreateError.set('Enter a valid holiday date and description.');
      return;
    }

    this.holidaySaving.set(true);
    this.holidayCreateError.set('');
    this.publicHolidayService.addPublicHoliday({ date, description }).subscribe({
      next: (response) => {
        if (this.isApiFailure(response)) {
          this.holidayCreateError.set(this.apiMessage(response) || 'The holiday could not be saved.');
          this.holidaySaving.set(false);
          return;
        }

        const holidayDate = this.eventDisplayDate(date);
        const holidayColorIndex = this.calendarEvents().filter((event) => event.category === 'holiday').length % 8 + 1;
        const event: CompanyCalendarEvent = {
          id: `public-holiday-${date}-${description.toLocaleLowerCase()}`,
          title: description,
          date,
          category: 'holiday',
          description,
          holidayColorIndex,
        };
        this.calendarEvents.update((events) => [
          ...events.filter((existing) => existing.id !== event.id),
          event,
        ]);
        this.selectedDate.set(holidayDate);
        this.monthAnchor.set(firstOfMonth(holidayDate));
        this.holidaySaving.set(false);
        this.holidayDialogOpen.set(false);
        this.holidayCreateSuccess.set(`${description} was added to the calendar.`);
        this.loadPublicHolidays();
      },
      error: (error: unknown) => {
        console.error('Failed to add a company public holiday.', error);
        this.holidayCreateError.set('The holiday could not be saved. Please try again.');
        this.holidaySaving.set(false);
      },
    });
  }

  private loadPublicHolidays(): void {
    this.publicHolidayService.fetchPublicHolidays().subscribe({
      next: (holidays) => {
        this.holidayLoadError.set(false);
        const listedHolidayEvents = holidays.map((holiday, index) => ({
          id: `public-holiday-${holiday.id}`,
          title: holiday.description,
          date: holiday.date,
          category: 'holiday' as const,
          location: holiday.company,
          description: holiday.description,
          holidayColorIndex: index % 8 + 1,
        }));
        this.calendarEvents.update((events) => {
          const mergedHolidays = new Map<string, CompanyCalendarEvent>();
          for (const holiday of listedHolidayEvents) {
            mergedHolidays.set(this.holidayEventKey(holiday), holiday);
          }
          for (const holiday of events.filter((event) => event.category === 'holiday')) {
            const key = this.holidayEventKey(holiday);
            if (!mergedHolidays.has(key)) {
              mergedHolidays.set(key, holiday);
            }
          }
          return [
            ...events.filter((event) => event.category !== 'holiday'),
            ...mergedHolidays.values(),
          ];
        });
      },
      error: (error: unknown) => {
        console.error('Failed to load company public holidays for the dashboard calendar.', error);
        this.holidayLoadError.set(true);
      },
    });
  }

  private isValidDateKey(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  private holidayEventKey(event: CompanyCalendarEvent): string {
    return `${event.date}|${event.title.toLocaleLowerCase()}|${event.location?.toLocaleLowerCase() ?? ''}`;
  }

  private isApiFailure(response: unknown): boolean {
    return typeof response === 'object' && response !== null &&
      'status' in response && response.status === false;
  }

  private apiMessage(response: unknown): string {
    if (typeof response !== 'object' || response === null || !('message' in response)) {
      return '';
    }
    return typeof response.message === 'string' ? response.message : '';
  }

  openAction(action: HrMenuAction): void {
    void this.router.navigateByUrl(action.route);
  }

  changeMonth(offset: number): void {
    const selected = this.selectedDate();
    const nextDate = this.activeView() === 'month'
      ? calendarDate(this.monthAnchor().getFullYear(), this.monthAnchor().getMonth() + offset, 1)
      : calendarDate(
          selected.getFullYear(),
          selected.getMonth(),
          selected.getDate() + offset * (this.activeView() === 'week' ? 7 : 1),
        );
    this.monthAnchor.set(firstOfMonth(nextDate));
    this.selectedDate.set(nextDate);
  }

  goToToday(): void {
    this.monthAnchor.set(firstOfMonth(this.today));
    this.selectedDate.set(new Date(
      this.today.getFullYear(),
      this.today.getMonth(),
      this.today.getDate(),
      12,
    ));
  }

  selectDate(date: Date): void {
    this.selectedDate.set(date);
    if (date.getMonth() !== this.monthAnchor().getMonth() || date.getFullYear() !== this.monthAnchor().getFullYear()) {
      this.monthAnchor.set(firstOfMonth(date));
    }
  }

  eventCategoryLabel(category: CompanyCalendarEventCategory): string {
    return {
      approved: 'My approved absence',
      pending: 'My pending request',
      remote: 'My remote / WFH day',
      holiday: 'Statutory holiday',
      dayoff: 'Weekly day off',
      office: 'In-office shift',
    }[category];
  }

  holidayHue(colorIndex: number): number {
    return ((colorIndex - 1) * 137.508) % 360;
  }

  eventDisplayDate(date: string): Date {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  }

  private eventsForDate(date: Date): CompanyCalendarEvent[] {
    const key = dateKey(date);
    const events = this.calendarEvents()
      .filter((event) => event.date === key)
      .sort((left, right) => (left.time ?? '').localeCompare(right.time ?? ''));
    if (date.getDay() === 0) {
      events.push({
        id: `weekly-day-off-${key}`,
        title: 'Weekly Day Off',
        date: key,
        category: 'dayoff',
      });
    }
    return events;
  }

  private calendarDay(date: Date): CalendarDay {
    const selectedKey = dateKey(this.selectedDate());
    const todayKey = dateKey(this.today);
    return {
      date,
      isCurrentMonth: date.getMonth() === this.monthAnchor().getMonth(),
      isToday: dateKey(date) === todayKey,
      isSelected: dateKey(date) === selectedKey,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      events: this.eventsForDate(date),
    };
  }

  private weekLabel(): string {
    const start = firstDayOfWeek(this.selectedDate());
    const end = calendarDate(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).formatRange(start, end);
  }
}
