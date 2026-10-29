import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

/** True when the URL is a create/edit/form screen (not a list). */
export function isMiscellaneousFormRoute(url: string): boolean {
  const path = url.split('?')[0].split('#')[0];
  return (
    /\/miscellaneous\/good-receipt-note\/(create|edit)(\/|$)/.test(path) ||
    /\/miscellaneous\/delivery\/(create|edit)(\/|$)/.test(path) ||
    /\/miscellaneous\/inventory-transfer\/(create|edit)(\/|$)/.test(path) ||
    /\/miscellaneous\/inventory-transfer-request\/(create|edit)(\/|$)/.test(path) ||
    /\/miscellaneous\/good-issue\/(create|edit)(\/|$)/.test(path) ||
    /\/miscellaneous\/crushed-risen-consumption\/(create|edit)(\/|$)/.test(path)
  );
}

@Injectable({ providedIn: 'root' })
export class MiscellaneousLayoutService {
  private readonly router = inject(Router);
  readonly sidebarCollapsed = signal(false);

  toggleSidebar(): void {
    this.sidebarCollapsed.update((state) => !state);
  }

  /** Hide sidebar so the form uses the full content area. */
  enterFormMode(): void {
    this.sidebarCollapsed.set(true);
  }

  /** Show sidebar again on list screens. */
  exitFormMode(): void {
    this.sidebarCollapsed.set(false);
  }

  backToModuleHome(): void {
    this.exitFormMode();
    void this.router.navigateByUrl('/miscellaneous');
  }
}
