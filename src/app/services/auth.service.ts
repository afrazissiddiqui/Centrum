import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { apiUrl } from '../config/api.config';

const AUTH_SESSION_KEY = 'sapqc_session_auth';
const SESSION_USER_ID_KEY = 'sapqc_session_user_id';
const SESSION_TOKEN_KEY = 'sapqc_session_token';
const SESSION_USER_KEY = 'sapqc_session_user';
const SESSION_AUTHORIZATION_KEY = 'sapqc_session_authorization_v2';
const FRONTEND_ONLY_SESSION_KEY = 'sapqc_frontend_only_session';
const LOGIN_API_URL = apiUrl('login');

export interface LoginApiUser {
  id: number;
  name: string;
  email: string;
  email_verified_at: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  branch?: Array<number | string> | number | string | null;
  branches?: Array<number | string> | number | string | null;
  Branch?: Array<number | string> | number | string | null;
  Branches?: Array<number | string> | number | string | null;
}

export interface LoginApiResponse {
  status: boolean;
  message: string;
  token: string;
  user: LoginApiUser;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  /** Mirrors session flag so UI can react if needed later. */
  readonly isLoggedIn = signal(this.readSession());
  readonly sessionUserId = signal(this.readSessionUserId());
  readonly isFrontendOnlySession = signal(this.readFrontendOnlySession());

  private readSession(): boolean {
    // Prefer localStorage so session persists across browser restarts (backend tokens valid 24h)
    const ls = localStorage.getItem(AUTH_SESSION_KEY);
    if (ls !== null) {
      return ls === '1';
    }
    return sessionStorage.getItem(AUTH_SESSION_KEY) === '1';
  }

  private readSessionUserId(): string | null {
    try {
      return localStorage.getItem(SESSION_USER_ID_KEY) ?? sessionStorage.getItem(SESSION_USER_ID_KEY);
    } catch {
      return sessionStorage.getItem(SESSION_USER_ID_KEY);
    }
  }

  private readFrontendOnlySession(): boolean {
    return (
      localStorage.getItem(FRONTEND_ONLY_SESSION_KEY) === '1' ||
      sessionStorage.getItem(FRONTEND_ONLY_SESSION_KEY) === '1'
    );
  }

  /** Call after successful sign-in. */
  login(userId?: string): void {
    const trimmed = userId?.trim() ?? '';
    try {
      localStorage.setItem(AUTH_SESSION_KEY, '1');
      if (trimmed) {
        localStorage.removeItem(FRONTEND_ONLY_SESSION_KEY);
      } else {
        localStorage.setItem(FRONTEND_ONLY_SESSION_KEY, '1');
        localStorage.removeItem(SESSION_TOKEN_KEY);
        localStorage.removeItem(SESSION_USER_KEY);
        localStorage.removeItem(SESSION_AUTHORIZATION_KEY);
      }
      if (trimmed) {
        localStorage.setItem(SESSION_USER_ID_KEY, trimmed);
      } else {
        localStorage.removeItem(SESSION_USER_ID_KEY);
      }
    } catch {
      // ignore localStorage failures and continue with sessionStorage.
    }

    sessionStorage.setItem(AUTH_SESSION_KEY, '1');
    if (trimmed) {
      sessionStorage.removeItem(FRONTEND_ONLY_SESSION_KEY);
    } else {
      sessionStorage.setItem(FRONTEND_ONLY_SESSION_KEY, '1');
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
      sessionStorage.removeItem(SESSION_USER_KEY);
      sessionStorage.removeItem(SESSION_AUTHORIZATION_KEY);
    }
    if (trimmed) {
      sessionStorage.setItem(SESSION_USER_ID_KEY, trimmed);
      this.sessionUserId.set(trimmed);
    } else {
      sessionStorage.removeItem(SESSION_USER_ID_KEY);
      this.sessionUserId.set(null);
    }
    this.isFrontendOnlySession.set(!trimmed);
    this.isLoggedIn.set(true);
  }

  getSessionUserId(): string | null {
    return this.sessionUserId();
  }

  getSessionUser(): LoginApiUser | null {
    const raw = localStorage.getItem(SESSION_USER_KEY) ?? sessionStorage.getItem(SESSION_USER_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as LoginApiUser;
    } catch {
      return null;
    }
  }

  getAuthToken(): string | null {
    // Try localStorage first so token survives across tabs/restarts; fallback to sessionStorage
    return localStorage.getItem(SESSION_TOKEN_KEY) ?? sessionStorage.getItem(SESSION_TOKEN_KEY);
  }

  loginWithApi(email: string, password: string): Observable<LoginApiResponse> {
    return this.http
      .post<LoginApiResponse>(LOGIN_API_URL, {
        email: email.trim(),
        password,
      })
      .pipe(
        tap((response) => {
          if (!response?.status || !response?.token || !response?.user?.email) {
            throw new Error(response?.message || 'Login failed.');
          }
          this.login(response.user.email);
          // Persist token and user in localStorage so it remains valid for backend TTL (24h)
          try {
            localStorage.setItem(SESSION_TOKEN_KEY, response.token);
            localStorage.setItem(SESSION_USER_KEY, JSON.stringify(response.user));
          } catch {
            // Fallback to sessionStorage if localStorage not available
            sessionStorage.setItem(SESSION_TOKEN_KEY, response.token);
            sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(response.user));
          }
        }),
      );
  }

  /** Clears session and opens the login page. */
  logout(): void {
    // Clear both localStorage and sessionStorage keys to fully sign out
    localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(SESSION_USER_ID_KEY);
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(SESSION_AUTHORIZATION_KEY);
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    sessionStorage.removeItem(SESSION_USER_ID_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
    sessionStorage.removeItem(SESSION_AUTHORIZATION_KEY);
    localStorage.removeItem(FRONTEND_ONLY_SESSION_KEY);
    sessionStorage.removeItem(FRONTEND_ONLY_SESSION_KEY);
    this.isLoggedIn.set(false);
    this.sessionUserId.set(null);
    this.isFrontendOnlySession.set(false);
    void this.router.navigateByUrl('/login');
  }
}
