import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  getNavigableHrMenuActions,
  HrMenuAction,
  resolveRecruitmentRoute,
} from '../../config/hr-menu.config';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';

export type CompanyCalendarEventCategory = 'approved' | 'pending' | 'remote' | 'holiday' | 'office';

export interface CompanyCalendarEvent {
  id: string;
  title: string;
  date: string;
  category: CompanyCalendarEventCategory;
  time?: string;
  location?: string;
  description?: string;
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
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class dashboardComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly permissionService = inject(PermissionService);
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
  readonly accountEmail = computed(() => this.authService.getSessionUser()?.email?.trim() || '');
  readonly portalUserId = computed(() => this.authService.getSessionUser()?.id ?? null);
  readonly accountType = computed(() => this.authService.getSessionUser()?.is_admin ? 'Administrator' : 'Employee');
  readonly greeting = this.hour < 12 ? 'Good morning' : this.hour < 17 ? 'Good afternoon' : 'Good evening';
  readonly employeeServiceLabel = 'Employee Self-Service (ESS)';
  readonly calendarEvents = signal<CompanyCalendarEvent[]>([]);
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
      office: 'In-office shift',
    }[category];
  }

  eventDisplayDate(date: string): Date {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  }

  private eventsForDate(date: Date): CompanyCalendarEvent[] {
    const key = dateKey(date);
    return this.calendarEvents()
      .filter((event) => event.date === key)
      .sort((left, right) => (left.time ?? '').localeCompare(right.time ?? ''));
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
