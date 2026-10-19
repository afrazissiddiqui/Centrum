import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { apiUrl } from '../../config/api.config';

export interface GatePassBusinessPartner {
  code: string;
  name: string;
  cardType?: string;
}

const BUSINESS_PARTNERS_URL = apiUrl('business_partners');

@Injectable({ providedIn: 'root' })
export class GatePassBusinessPartnerService {
  private readonly http = inject(HttpClient);
  private readonly partners = signal<GatePassBusinessPartner[]>([]);
  private readonly allPartners = signal<GatePassBusinessPartner[]>([]);
  private readonly customers = signal<GatePassBusinessPartner[]>([]);
  private readonly suppliers = signal<GatePassBusinessPartner[]>([]);
  private loaded = false;
  private loading = false;
  private load$?: Observable<GatePassBusinessPartner[]>;
  private allLoaded = false;
  private allLoad$?: Observable<GatePassBusinessPartner[]>;
  private customerLoaded = false;
  private customerLoading = false;
  private customerLoad$?: Observable<GatePassBusinessPartner[]>;
  private supplierLoaded = false;
  private supplierLoad$?: Observable<GatePassBusinessPartner[]>;

  ensureLoaded(): Observable<GatePassBusinessPartner[]> {
    if (this.loaded) {
      return of(this.partners());
    }

    if (!this.load$) {
      this.loading = true;
      this.load$ = this.http.get<unknown>(BUSINESS_PARTNERS_URL).pipe(
        map((response) =>
          this.extractApiItems(response)
            .map((item) => this.mapPartner(item))
            .filter((partner) => {
              const cardType = partner.cardType?.trim().toUpperCase();
              return cardType !== 'C';
            }),
        ),
        tap((records) => {
          this.partners.set(records);
          this.loaded = true;
          this.loading = false;
        }),
        catchError(() => {
          this.partners.set([]);
          this.loading = false;
          this.loaded = false;
          this.load$ = undefined;
          return of([]);
        }),
        shareReplay(1),
      );
    }

    return this.load$;
  }

  ensureAllLoaded(): Observable<GatePassBusinessPartner[]> {
    if (this.allLoaded) {
      return of(this.allPartners());
    }

    if (!this.allLoad$) {
      this.allLoad$ = this.http.get<unknown>(BUSINESS_PARTNERS_URL).pipe(
        map((response) =>
          this.extractApiItems(response)
            .map((item) => this.mapPartner(item))
            .filter((partner) => partner.code || partner.name),
        ),
        tap((records) => {
          this.allPartners.set(records);
          this.allLoaded = true;
        }),
        catchError(() => {
          this.allPartners.set([]);
          this.allLoaded = true;
          return of([]);
        }),
      );
    }

    return this.allLoad$;
  }

  ensureCustomersLoaded(): Observable<GatePassBusinessPartner[]> {
    if (this.customerLoaded) {
      return of(this.customers());
    }

    if (!this.customerLoad$) {
      this.customerLoading = true;
      this.customerLoad$ = this.http.get<unknown>(BUSINESS_PARTNERS_URL).pipe(
        map((response) =>
          this.extractApiItems(response)
            .map((item) => this.mapPartner(item))
            .filter((partner) => {
              const cardType = partner.cardType?.trim().toUpperCase();
              return cardType === 'C';
            }),
        ),
        tap((records) => {
          this.customers.set(records);
          this.customerLoaded = true;
          this.customerLoading = false;
        }),
        catchError(() => {
          this.customers.set([]);
          this.customerLoaded = true;
          this.customerLoading = false;
          return of([]);
        }),
      );
    }

    return this.customerLoad$;
  }

  isLoading(): boolean {
    return this.loading;
  }

  customersLoading(): boolean {
    return this.customerLoading;
  }

  search(query: string, limit = 8): GatePassBusinessPartner[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }

    return this.partners()
      .filter(
        (partner) =>
          partner.code.toLowerCase().includes(q) ||
          partner.name.toLowerCase().includes(q),
      )
      .slice(0, limit);
  }

  searchAll(query: string, limit = 8): GatePassBusinessPartner[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }

    return this.allPartners()
      .filter((partner) => partner.code.toLowerCase().includes(q) || partner.name.toLowerCase().includes(q))
      .slice(0, limit);
  }

  searchCustomers(query: string, limit = 50): GatePassBusinessPartner[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return this.customers();
    }

    return this.customers()
      .filter((partner) => partner.code.toLowerCase().includes(q) || partner.name.toLowerCase().includes(q))
      .slice(0, limit);
  }

  ensureSuppliersLoaded(): Observable<GatePassBusinessPartner[]> {
    if (this.supplierLoaded) {
      return of(this.suppliers());
    }

    if (!this.supplierLoad$) {
      this.supplierLoad$ = this.http.get<unknown>(BUSINESS_PARTNERS_URL).pipe(
        map((response) =>
          this.extractApiItems(response)
            .map((item) => this.mapPartner(item))
            .filter((partner) => partner.cardType?.trim().toUpperCase() === 'S'),
        ),
        tap((records) => {
          this.suppliers.set(records);
          this.supplierLoaded = true;
        }),
        catchError(() => {
          this.suppliers.set([]);
          this.supplierLoaded = true;
          return of([]);
        }),
      );
    }

    return this.supplierLoad$;
  }

  searchSuppliers(query: string, limit = 8): GatePassBusinessPartner[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [];
    }

    return this.suppliers()
      .filter((partner) => partner.code.toLowerCase().includes(q) || partner.name.toLowerCase().includes(q))
      .slice(0, limit);
  }

  private extractApiItems(response: unknown): Array<Record<string, unknown>> {
    if (!response) {
      return [];
    }

    if (Array.isArray(response)) {
      return response.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }

    if (typeof response !== 'object') {
      return [];
    }

    const obj = response as Record<string, unknown>;
    const arrayKeys = [
      'data',
      'items',
      'results',
      'records',
      'list',
      'businessPartners',
      'business_partners',
    ];

    for (const key of arrayKeys) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
      }
    }

    const nestedData = obj['data'];
    if (nestedData && typeof nestedData === 'object') {
      const nestedItems = this.extractApiItems(nestedData);
      if (nestedItems.length > 0) {
        return nestedItems;
      }
    }

    if (
      obj['code'] ||
      obj['name'] ||
      obj['businessPartnerCode'] ||
      obj['business_partner_code'] ||
      obj['CardCode'] ||
      obj['CardName']
    ) {
      return [obj];
    }

    return [];
  }

  private mapPartner(item: Record<string, unknown>): GatePassBusinessPartner {
    const cardType = this.pickString([item], ['cardType', 'CardType', 'type', 'Type']);

    return {
      code: this.pickString([item], [
        'code',
        'businessPartnerCode',
        'business_partner_code',
        'partnerCode',
        'partner_code',
        'CardCode',
      ]),
      name: this.pickString([item], [
        'name',
        'businessPartnerName',
        'business_partner_name',
        'partnerName',
        'partner_name',
        'CardName',
      ]),
      cardType,
    };
  }

  private pickString(sources: Array<Record<string, unknown>>, keys: string[]): string {
    for (const source of sources) {
      for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          return String(value).trim();
        }
      }
    }
    return '';
  }
}
