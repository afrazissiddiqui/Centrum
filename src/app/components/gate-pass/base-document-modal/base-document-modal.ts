import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription, finalize } from 'rxjs';
import { GatePassModule, OpenBaseDocument, OpenBaseDocumentsService } from '../open-base-documents.service';
import { resolveGatePassLocation, resolveGatePassLocationFromBplId } from '../gate-pass-location.options';
import { resolveBranchCode } from '../../setup/gl-account-determination/gl-account-branch.options';
import { displayDateSlash } from '../../../utils/date-format.util';
import { AuthService } from '../../../services/auth.service';
import { UserSetupService } from '../../../services/user-setup.service';
import { buildCompactPageNumbers } from '../../../utils/pagination.util';

@Component({
  selector: 'app-base-document-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './base-document-modal.html',
  styleUrl: './base-document-modal.css',
})
export class BaseDocumentModalComponent implements OnChanges, OnDestroy {
  private readonly openBaseDocuments = inject(OpenBaseDocumentsService);
  private readonly authService = inject(AuthService);
  private readonly userSetupService = inject(UserSetupService);

  @Input() open = false;
  @Input() gatePassModule: GatePassModule = 'igp';
  /** Must match the Type dropdown value for the active gate-pass form. */
  @Input() documentType = '';

  @Output() openChange = new EventEmitter<boolean>();
  @Output() documentPicked = new EventEmitter<OpenBaseDocument>();

  readonly documents = signal<OpenBaseDocument[]>([]);
  readonly loading = signal(false);
  readonly searchText = signal('');
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly pageSizeOptions = [5, 10, 25, 50];
  readonly skeletonRows = Array.from({ length: 5 }, (_, index) => index);

  readonly filteredDocuments = computed(() => {
    const search = this.searchText().trim().toLowerCase();
    const docs = this.documents();
    if (!search) {
      return docs;
    }
    return docs.filter((doc) => {
      const hay = [
        doc.number,
        doc.title,
        doc.businessPartnerName,
        doc.partner,
        doc.businessPartnerCode,
        doc.bplId,
        doc.date,
        doc.docDate,
      ]
        .filter((value) => value != null && value !== '')
        .join(' ')
        .toLowerCase();
      return hay.includes(search);
    });
  });

  readonly paginatedDocuments = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredDocuments().slice(start, start + this.pageSize());
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredDocuments().length / this.pageSize())),
  );

  readonly pages = computed(() => buildCompactPageNumbers(this.totalPages(), this.currentPage()));

  Math = Math;
  readonly displayDateSlash = displayDateSlash;
  private loadSubscription?: Subscription;

  ngOnDestroy(): void {
    this.cancelLoad();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['open'] || changes['documentType'] || changes['gatePassModule']) && this.open) {
      this.loadDocuments();
      return;
    }

    if (changes['open'] && !this.open) {
      this.cancelLoad();
      this.documents.set([]);
      this.loading.set(false);
      this.resetListState();
    }
  }

  close(): void {
    this.openChange.emit(false);
  }

  onSearchChange(): void {
    this.currentPage.set(1);
  }

  setPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  onPageSizeChange(): void {
    this.currentPage.set(1);
  }

  onBackdropClick(): void {
    this.close();
  }

  onModalClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  select(doc: OpenBaseDocument): void {
    this.documentPicked.emit(doc);
    this.close();
  }

  getBplLabel(bplId?: string): string {
    return resolveGatePassLocationFromBplId(bplId) || bplId?.trim() || '—';
  }

  private cancelLoad(): void {
    this.loadSubscription?.unsubscribe();
    this.loadSubscription = undefined;
  }

  private resetListState(): void {
    this.searchText.set('');
    this.currentPage.set(1);
  }

  private loadDocuments(): void {
    this.cancelLoad();
    this.resetListState();

    const branchCodes = this.resolveCurrentUserBranchCodes();
    if (branchCodes.length === 0 && this.userSetupService.users().length === 0) {
      this.loading.set(true);
      this.documents.set([]);
      this.loadSubscription = this.userSetupService.fetchUsers().pipe(finalize(() => this.loading.set(false))).subscribe({
        next: () => {
          this.loadDocumentsWithBranchFilter(this.resolveCurrentUserBranchCodes());
        },
        error: () => {
          this.loadDocumentsWithBranchFilter([]);
        },
      });
      return;
    }

    this.loadDocumentsWithBranchFilter(branchCodes);
  }

  private loadDocumentsWithBranchFilter(branchCodes: string[]): void {
    const fetch$ = this.getApiFetch$();
    if (fetch$) {
      this.loading.set(true);
      this.documents.set([]);
      this.loadSubscription = fetch$
        .pipe(finalize(() => this.loading.set(false)))
        .subscribe({
          next: (documents) => {
            this.documents.set(this.filterOpenDocuments(documents, branchCodes));
          },
          error: () => {
            this.documents.set([]);
          },
        });
      return;
    }

    this.loading.set(false);
    this.documents.set(this.filterOpenDocuments(this.openBaseDocuments.listOpenByType(this.gatePassModule, this.documentType), branchCodes));
  }

  private filterOpenDocuments(documents: OpenBaseDocument[], branchCodes: string[]): OpenBaseDocument[] {
    const isOgpDelivery = this.gatePassModule === 'ogp' && this.documentType === 'Delivery';
    const openDocs = isOgpDelivery
      ? documents
      : documents.filter((doc) => doc.status === undefined || doc.status === 'O');
    if (!branchCodes.length) {
      return openDocs;
    }

    const allowedLocations = branchCodes
      .map((code) => this.branchCodeToLocation(code))
      .filter((location): location is string => Boolean(location));

    if (allowedLocations.length === 0) {
      return openDocs;
    }

    return openDocs.filter((doc) => this.documentMatchesAllowedLocations(doc, allowedLocations));
  }

  private resolveCurrentUserBranchCodes(): string[] {
    const sessionUser = this.authService.getSessionUser() as Record<string, unknown> | null;
    const branchValues = [
      sessionUser?.['branch'],
      sessionUser?.['branches'],
      sessionUser?.['Branch'],
      sessionUser?.['Branches'],
    ];

    const foundCodes = new Set<string>();
    for (const value of branchValues) {
      this.collectBranchCodes(value, foundCodes);
    }

    if (foundCodes.size === 0) {
      const sessionUserId = this.authService.getSessionUserId();
      const users = this.userSetupService.users();
      const matchingUser = users.find((user) => {
        const userRecord = user as Record<string, unknown>;
        const userId = userRecord['id'] ?? userRecord['Id'] ?? userRecord['ID'];
        const email = userRecord['email'] ?? userRecord['Email'];
        const name = userRecord['name'] ?? userRecord['Name'];
        const compareValues = [String(userId ?? ''), String(email ?? ''), String(name ?? '')];
        return compareValues.some((value) => value && value === String(sessionUserId ?? ''));
      });

      if (matchingUser) {
        const matchingRecord = matchingUser as Record<string, unknown>;
        const directBranch = matchingRecord['branch'] ?? matchingRecord['branches'] ?? matchingRecord['Branch'] ?? matchingRecord['Branches'];
        this.collectBranchCodes(directBranch, foundCodes);
      }

      if (foundCodes.size === 0) {
        const sessionEmail = sessionUser?.['email'] ?? sessionUser?.['Email'];
        if (typeof sessionEmail === 'string' && sessionEmail.trim()) {
          const byEmail = users.find((user) => {
            const userRecord = user as Record<string, unknown>;
            const email = userRecord['email'] ?? userRecord['Email'];
            return typeof email === 'string' && email.trim().toLowerCase() === sessionEmail.trim().toLowerCase();
          });
          if (byEmail) {
            const byEmailRecord = byEmail as Record<string, unknown>;
            const directBranch = byEmailRecord['branch'] ?? byEmailRecord['branches'] ?? byEmailRecord['Branch'] ?? byEmailRecord['Branches'];
            this.collectBranchCodes(directBranch, foundCodes);
          }
        }
      }
    }

    return [...foundCodes];
  }

  private collectBranchCodes(value: unknown, codes: Set<string>): void {
    if (Array.isArray(value)) {
      value.forEach((entry) => this.collectBranchCodes(entry, codes));
      return;
    }

    if (typeof value === 'number') {
      this.addBranchCode(String(value), codes);
      return;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      this.addBranchCode(trimmed, codes);
    }
  }

  private addBranchCode(value: string, codes: Set<string>): void {
    const branchCode = resolveBranchCode(value);
    if (branchCode && resolveGatePassLocationFromBplId(branchCode)) {
      codes.add(branchCode);
    }
  }

  private branchCodeToLocation(branchCode: string): string | null {
    return resolveGatePassLocationFromBplId(branchCode) || null;
  }

  private documentMatchesAllowedLocations(doc: OpenBaseDocument, allowedLocations: string[]): boolean {
    const documentLocation = resolveGatePassLocation(doc.location ?? doc.fromUnit ?? doc.bplId ?? '');
    if (documentLocation) {
      return allowedLocations.includes(documentLocation);
    }

    const fallbackLocation = resolveGatePassLocationFromBplId(doc.bplId ?? '');
    if (fallbackLocation) {
      return allowedLocations.includes(fallbackLocation);
    }

    return true;
  }

  private getApiFetch$(): Observable<OpenBaseDocument[]> | null {
    if (this.gatePassModule === 'ogp' && this.documentType === 'Delivery') {
      return this.openBaseDocuments.fetchDeliveries();
    }

    const usesApi =
      this.gatePassModule === 'igp' ||
      this.gatePassModule === 'ogp' ||
      this.gatePassModule === 'agp';

    if (!usesApi) {
      return null;
    }

    if (this.documentType === 'Sales return request' || this.documentType === 'Sales Return Request') {
      return this.openBaseDocuments.fetchSalesReturnRequests();
    }

    if (this.documentType === 'Purchase Order') {
      return this.openBaseDocuments.fetchPurchaseOrders();
    }

    if (this.documentType === 'Purchase Request') {
      return this.openBaseDocuments.fetchPurchaseRequests();
    }

    return null;
  }
}
