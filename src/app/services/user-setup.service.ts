import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { apiUrl } from '../config/api.config';
import { UserAuthorizationModule, authorizationToApiPayload } from '../utils/user-authorization.util';
import { GL_ACCOUNT_BRANCH_OPTIONS, resolveBranchCode } from '../components/setup/gl-account-determination/gl-account-branch.options';

export type { UserAuthorizationModule };

export interface UserSetupPayload {
  name: string;
  email: string;
  password?: string;
  employee_code?: string;
  branch?: Array<number | string>;
  department?: number;
  authorization: UserAuthorizationModule[];
}

export type UserListItem = Record<string, unknown>;

const USER_LIST_URL = apiUrl('user-list');
const USER_ADD_URL = apiUrl('user-add');
const USER_UPDATE_URL = apiUrl('user-update');
const USER_DELETE_URL = apiUrl('user-delete');
const USER_DETAIL_URL = apiUrl('user-detail');

@Injectable({
  providedIn: 'root',
})
export class UserSetupService {
  private readonly http = inject(HttpClient);
  private readonly userList = signal<UserListItem[]>([]);

  readonly users = this.userList.asReadonly();

  fetchUsers(): Observable<UserListItem[]> {
    return this.http.get<unknown>(USER_LIST_URL).pipe(
      map((response) => this.extractApiItems(response)),
      tap((users) => this.userList.set(users)),
    );
  }

  fetchUserDetail(id: string | number): Observable<UserListItem> {
    const identifier = encodeURIComponent(String(id));
    return this.http.get<unknown>(`${USER_DETAIL_URL}/${identifier}`).pipe(
      map((response) => this.extractSingleRecord(response)),
    );
  }

  addUser(payload: UserSetupPayload): Observable<unknown> {
    return this.http.post(USER_ADD_URL, this.serializePayload(payload));
  }

  updateUser(id: string | number, payload: UserSetupPayload): Observable<unknown> {
    const identifier = encodeURIComponent(String(id));
    return this.http.post(`${USER_UPDATE_URL}/${identifier}`, this.serializePayload(payload));
  }

  deleteUser(id: string | number): Observable<unknown> {
    const identifier = encodeURIComponent(String(id));
    return this.http.delete(`${USER_DELETE_URL}/${identifier}`);
  }

  private extractSingleRecord(response: unknown): UserListItem {
    if (!response || typeof response !== 'object') {
      return {};
    }

    const obj = response as Record<string, unknown>;
    const nestedData = obj['data'];
    if (nestedData && typeof nestedData === 'object' && !Array.isArray(nestedData)) {
      return nestedData as UserListItem;
    }

    if (this.looksLikeUserRecord(obj)) {
      return obj;
    }

    const items = this.extractApiItems(response);
    return items[0] ?? {};
  }

  private extractApiItems(response: unknown): UserListItem[] {
    if (!response) {
      return [];
    }

    if (Array.isArray(response)) {
      return response.filter((item): item is UserListItem => !!item && typeof item === 'object');
    }

    if (typeof response !== 'object') {
      return [];
    }

    const obj = response as Record<string, unknown>;
    const arrayKeys = ['data', 'items', 'results', 'records', 'list', 'users', 'userList', 'user_list'];

    for (const key of arrayKeys) {
      const value = obj[key];
      if (Array.isArray(value)) {
        return value.filter((item): item is UserListItem => !!item && typeof item === 'object');
      }
    }

    const nestedData = obj['data'];
    if (nestedData && typeof nestedData === 'object') {
      const nestedItems = this.extractApiItems(nestedData);
      if (nestedItems.length > 0) {
        return nestedItems;
      }
    }

    if (this.looksLikeUserRecord(obj)) {
      return [obj];
    }

    return [];
  }

  private looksLikeUserRecord(item: Record<string, unknown>): boolean {
    return ['id', 'Id', 'ID', 'name', 'Name', 'email', 'Email', 'username', 'Username'].some(
      (key) => key in item,
    );
  }

  private normalizeBranchValue(value: number | string): number | null {
    const code = resolveBranchCode(String(value));
    const branch = GL_ACCOUNT_BRANCH_OPTIONS.find((option) => option.code === code);
    return branch ? Number(branch.code) : null;
  }

  private serializePayload(payload: UserSetupPayload): Record<string, unknown> {
    const authorizationModules = authorizationToApiPayload(payload.authorization);
    const branchValues = Array.isArray(payload.branch) ? payload.branch : [];
    const normalizedBranch = branchValues
      .map((value) => this.normalizeBranchValue(value))
      .filter((value): value is number => value !== null);

    const body: Record<string, unknown> = {
      name: payload.name.trim(),
      email: payload.email.trim(),
      branch: normalizedBranch,
      department: payload.department ?? 25,
      authorization: authorizationModules,
    };

    const password = payload.password?.trim();
    if (password) {
      body['password'] = password;
    }

    const employeeCode = payload.employee_code?.trim();
    if (employeeCode) {
      body['employee_code'] = employeeCode;
    }

    return body;
  }
}
