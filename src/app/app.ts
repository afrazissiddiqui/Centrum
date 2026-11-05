import { Component, CUSTOM_ELEMENTS_SCHEMA, signal, ChangeDetectionStrategy, computed, ElementRef, ViewChild, HostListener, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Router } from '@angular/router';
import { NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ViewProfileComponent } from './components/profile/view-profile';
import { ApplicationFormService } from './services/application-form.service';
import { AuthService } from './services/auth.service';
import { resolveShellbarTitle, resolveShellbarSearchPlaceholder } from './utils/shellbar-title.util';
import { HR_MENU_OPTIONS, HrMenuOption, resolveRecruitmentRoute } from './config/hr-menu.config';
import { ShellbarSearchService } from './services/shellbar-search.service';
import { PermissionService } from './services/permission.service';

type HrMenuOptionLocal = HrMenuOption;

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ViewProfileComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  protected readonly title = signal('SAPQC');
  protected readonly hrDropdownOpen = signal(false);
  protected readonly profileDropdownOpen = signal(false);
  protected readonly profileDrawerOpen = signal(false);
  protected readonly selectedHeaderTitle = signal('Home');
  protected readonly hoveredHeaderTitle = signal<string | null>(null);
  protected readonly selectedHrOption = signal<string>('dashboard');
  /** Parent HR menu item whose child options are shown. */
  protected readonly expandedHrMenuValue = signal<string | null>(null);
  /** Hide HR shellbar on full-page routes (e.g. login). */
  protected readonly showMainChrome = signal(true);

  @ViewChild('headerWrapper', { read: ElementRef })
  private headerWrapperRef?: ElementRef<HTMLElement>;

  @ViewChild('shellbarSearchInput')
  private shellbarSearchInput?: ElementRef<HTMLInputElement>;

  protected readonly shellbarSearch = inject(ShellbarSearchService);
  private readonly permissionService = inject(PermissionService);

  /** Ignore document click-close briefly after opening profile menu (same click bubble). */
  private profileMenuIgnoreCloseUntil = 0;
  protected readonly shellbarTitle = computed(() => {
    const label = this.hoveredHeaderTitle() ?? this.selectedHeaderTitle();
    return `${label} ▾`;
  });

  protected readonly profileAvatarInitials = computed(() => {
    const record = this.applicationFormService.getSignedInUserRecord(
      this.authService.getSessionUserId(),
      this.authService.getSessionUser()?.name ?? null,
    );
    const name = record?.EmployeeName?.trim() || this.authService.getSessionUser()?.name?.trim() || '';
    if (!name) {
      return 'UI';
    }
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  });

  protected readonly hrMenuOptions: HrMenuOptionLocal[] = HR_MENU_OPTIONS;

  protected get visibleHrMenuOptions(): HrMenuOptionLocal[] {
    return this.hrMenuOptions
      .map((option) => ({
        ...option,
        children: option.children?.filter((child) => this.permissionService.canAccess(child.access)),
      }))
      .filter(
        (option) =>
          this.permissionService.canAccess(option.access) &&
          (!option.children?.length || option.children.length > 0),
      );
  }

  constructor(
    private router: Router,
    private readonly authService: AuthService,
    private readonly applicationFormService: ApplicationFormService,
  ) {
    if (this.authService.isLoggedIn()) {
      this.permissionService.ensureLoaded().subscribe();
    }

    const initialKey = (this.router.url.split('?')[0] ?? '').replace(/^\//, '');
    this.showMainChrome.set(initialKey !== 'login');
    this.shellbarSearch.setPlaceholder(resolveShellbarSearchPlaceholder(initialKey));
    if (initialKey.startsWith('setup/') || initialKey === 'setup') {
      this.expandedHrMenuValue.set('setup');
    } else if (this.isHrModuleRoute(initialKey)) {
      this.expandedHrMenuValue.set('hr');
    }

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      )
      .subscribe((e) => {
        const url = e.urlAfterRedirects.split('?')[0] ?? '';
        const routeKey = url.replace(/^\//, '');

        const mappedTitle = resolveShellbarTitle(routeKey);

        this.selectedHeaderTitle.set(mappedTitle);
        this.selectedHrOption.set(this.resolveHrOptionValue(routeKey));
        if (routeKey.startsWith('setup/') || routeKey === 'setup') {
          this.expandedHrMenuValue.set('setup');
        } else if (this.isHrModuleRoute(routeKey)) {
          this.expandedHrMenuValue.set('hr');
        }
        this.showMainChrome.set(routeKey !== 'login');
        this.shellbarSearch.setPlaceholder(resolveShellbarSearchPlaceholder(routeKey));
        this.profileDropdownOpen.set(false);
        this.profileDrawerOpen.set(false);
      });

    effect(() => {
      const query = this.shellbarSearch.query();
      const input = this.shellbarSearchInput?.nativeElement;
      if (input && input.value !== query) {
        input.value = query;
      }
    });
  }

  toggleHrDropdown(): void {
    this.profileDropdownOpen.set(false);
    this.hrDropdownOpen.update((state) => {
      if (state) {
        this.collapseHrSubmenuUnlessActiveRoute();
      }
      return !state;
    });
  }

  onProfileShellbarClick(event: Event): void {
    event.stopPropagation();
    this.hrDropdownOpen.set(false);
    this.clearPreviewHrOption();
    this.profileDropdownOpen.update((open) => {
      if (!open) {
        this.profileMenuIgnoreCloseUntil = Date.now() + 200;
      }
      return !open;
    });
  }

  onViewProfile(event: Event): void {
    event.stopPropagation();
    this.profileDropdownOpen.set(false);
    this.hrDropdownOpen.set(false);
    this.profileDrawerOpen.set(true);
  }

  onProfileDrawerClosed(): void {
    this.profileDrawerOpen.set(false);
  }

  onSignOut(event: Event): void {
    event.stopPropagation();
    this.profileDropdownOpen.set(false);
    this.hrDropdownOpen.set(false);
    this.clearPreviewHrOption();
    this.authService.logout();
  }

  onShellbarClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const isShellbarActionClick = target.closest('.ui5-shellbar-action-button');
    const isCustomShellbarItemClick = event.composedPath().some(
      (node) => node instanceof HTMLElement && node.localName === 'ui5-shellbar-item',
    );
    const isSearchClick = target.closest('.ui5-shellbar-search-field-area');
    const isProfileClick =
      target.closest('[data-profile-btn]') || target.closest('.profile-trigger');

    if (isShellbarActionClick || isCustomShellbarItemClick || isSearchClick || isProfileClick) {
      return;
    }

    this.toggleHrDropdown();
  }

  onShellbarSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.shellbarSearch.updateFromShellbar(value);
  }

  onApprovalAuthoritySetupClick(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.hrDropdownOpen.set(false);
    this.profileDropdownOpen.set(false);
    this.clearPreviewHrOption();
    void this.router.navigate(['/employee-action/approval-authority-setup']);
  }

  onProductSwitchClick(event: Event): void {
    event.stopPropagation();
    this.hrDropdownOpen.set(false);
    this.profileDropdownOpen.set(false);
    this.clearPreviewHrOption();
    void this.router.navigate(['/forms-hub']);
  }

  previewHrOption(label: string): void {
    this.hoveredHeaderTitle.set(label);
  }

  clearPreviewHrOption(): void {
    this.hoveredHeaderTitle.set(null);
  }

  stopEvent(event: Event): void {
    event.stopPropagation();
  }

  onLogoClick(event: MouseEvent): void {
    event.stopPropagation();
    this.hrDropdownOpen.set(false);
    this.profileDropdownOpen.set(false);
    this.clearPreviewHrOption();
    this.goHome();
  }

  selectHrOption(option: HrMenuOptionLocal, event?: Event): void {
    event?.stopPropagation();
    this.profileDropdownOpen.set(false);

    if (option.children?.length) {
      const isExpanded = this.expandedHrMenuValue() === option.value;
      this.expandedHrMenuValue.set(isExpanded ? null : option.value);
      this.selectedHrOption.set(option.value);
      this.selectedHeaderTitle.set(option.label);
      return;
    }

    this.hrDropdownOpen.set(false);
    this.expandedHrMenuValue.set(null);
    this.selectedHrOption.set(option.value);
    this.selectedHeaderTitle.set(option.label);

    if (option.externalUrl) {
      window.location.href = option.externalUrl;
      return;
    }

    if (option.route) {
      const route =
        option.value === 'recruitment'
          ? resolveRecruitmentRoute((requirement) => this.permissionService.canAccess(requirement))
          : option.route;
      void this.router.navigate([route]);
    }
  }

  isHrOptionExpanded(option: HrMenuOptionLocal): boolean {
    return !!option.children?.length && this.expandedHrMenuValue() === option.value;
  }

  isHrOptionSelected(option: HrMenuOptionLocal): boolean {
    const selected = this.selectedHrOption();
    if (option.children?.length) {
      if (selected === option.value || selected.startsWith(`${option.value}/`)) {
        return true;
      }
      return option.children.some(
        (child) => selected === child.value || selected.startsWith(`${child.value}/`),
      );
    }
    return selected === option.value || selected.startsWith(`${option.value}/`);
  }

  private collapseHrSubmenuUnlessActiveRoute(): void {
    const routeKey = (this.router.url.split('?')[0] ?? '').replace(/^\//, '');
    if (
      !routeKey.startsWith('setup/') &&
      routeKey !== 'setup' &&
      !this.isHrModuleRoute(routeKey)
    ) {
      this.expandedHrMenuValue.set(null);
    }
  }

  private isHrModuleRoute(routeKey: string): boolean {
    return (
      routeKey === 'recruitment' ||
      routeKey.startsWith('recruitment/') ||
      routeKey === 'employee-action' ||
      routeKey.startsWith('employee-action/') ||
      routeKey === 'payroll-master' ||
      routeKey.startsWith('payroll-master/') ||
      routeKey === 'termination' ||
      routeKey.startsWith('termination/')
    );
  }

  private resolveHrOptionValue(routeKey: string): string {
    if (routeKey.startsWith('setup/')) {
      return routeKey;
    }
    if (routeKey === 'setup') {
      return 'setup';
    }
    return routeKey || 'dashboard';
  }

  goHome(): void {
    this.router.navigate(['/dashboard']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.hrDropdownOpen() && !this.profileDropdownOpen()) {
      return;
    }

    const wrapper = this.headerWrapperRef?.nativeElement;
    const target = event.target as HTMLElement | null;
    if (!wrapper || !target) {
      return;
    }

    if (
      this.profileDropdownOpen() &&
      Date.now() > this.profileMenuIgnoreCloseUntil &&
      !this.eventInvolvesProfileUi(event)
    ) {
      this.profileDropdownOpen.set(false);
    }

    if (!wrapper.contains(target)) {
      this.hrDropdownOpen.set(false);
      this.profileDropdownOpen.set(false);
      this.collapseHrSubmenuUnlessActiveRoute();
      this.clearPreviewHrOption();
      return;
    }

    if (this.hrDropdownOpen() && !this.eventInvolvesHrMenuUi(event)) {
      this.hrDropdownOpen.set(false);
      this.collapseHrSubmenuUnlessActiveRoute();
      this.clearPreviewHrOption();
    }
  }

  /** Includes shellbar profile control (shadow DOM) and our profile menu. */
  private eventInvolvesProfileUi(event: Event): boolean {
    return event.composedPath().some((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      return (
        node.matches('[data-profile-btn]') ||
        node.matches('.profile-trigger') ||
        node.matches('.profile-dropdown-menu') ||
        node.matches('ui5-avatar') ||
        node.classList.contains('ui5-shellbar-profile') ||
        node.classList.contains('ui5-shellbar-profile-avatar') ||
        node.getAttribute('slot') === 'profile' ||
        node.getAttribute('data-profile') !== null
      );
    });
  }

  private eventInvolvesHrMenuUi(event: Event): boolean {
    return event.composedPath().some((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      return (
        node.matches('.hr-dropdown-menu') ||
        node.matches('.hr-dropdown-group') ||
        node.matches('.hr-dropdown-submenu') ||
        node.matches('.hr-portal-header') ||
        node.classList.contains('hr-portal-header')
      );
    });
  }
}
