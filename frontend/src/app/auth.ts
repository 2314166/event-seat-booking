import { HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { AuthResult, Role, User } from './models';

const KEY = 'seatbooking.auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  readonly user = signal<User | null>(null);
  readonly token = signal<string | null>(null);
  readonly isOrganizer = computed(() => this.user()?.role === 'organizer');
  readonly isAttendee = computed(() => this.user()?.role === 'attendee');

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw); this.user.set(s.user); this.token.set(s.token); }
    } catch { /* ignore corrupt storage */ }
  }

  login(email: string, password: string) {
    return this.http.post<AuthResult>('/api/auth/login', { email, password }).pipe(tap((r) => this.store(r)));
  }
  register(email: string, name: string, password: string) {
    return this.http.post<AuthResult>('/api/auth/register', { email, name, password }).pipe(tap((r) => this.store(r)));
  }
  private store(r: AuthResult) {
    this.user.set(r.user); this.token.set(r.token);
    try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* ignore */ }
  }
  logout() {
    this.user.set(null); this.token.set(null);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    this.router.navigateByUrl('/login');
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const t = auth.token();
  const out = t && req.url.startsWith('/api') ? req.clone({ setHeaders: { Authorization: `Bearer ${t}` } }) : req;
  return next(out);
};

/** Route guard factory. Client-side only for UX; the server enforces roles for real. */
export const requireRole = (role?: Role): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const u = auth.user();
  if (!u) return router.parseUrl('/login');
  if (role && u.role !== role) return router.parseUrl('/events');
  return true;
};
