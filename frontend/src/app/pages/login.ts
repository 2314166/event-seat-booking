import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth';
import { errMsg } from '../api';

@Component({
  imports: [FormsModule],
  template: `
    <div class="card narrow">
      <h2>{{ mode() === 'login' ? 'Sign in' : 'Create attendee account' }}</h2>
      <form (ngSubmit)="submit()">
        @if (mode() === 'register') {
          <label>Name <input name="name" [ngModel]="name()" (ngModelChange)="name.set($event)" required /></label>
        }
        <label>Email <input name="email" type="email" [ngModel]="email()" (ngModelChange)="email.set($event)" required /></label>
        <label>Password <input name="password" type="password" [ngModel]="password()" (ngModelChange)="password.set($event)" required minlength="6" /></label>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button class="primary" type="submit" [disabled]="busy()">{{ mode() === 'login' ? 'Sign in' : 'Register' }}</button>
      </form>
      <p class="muted">
        @if (mode() === 'login') { New here? <a href="#" (click)="toggle($event)">Create an account</a> }
        @else { Already registered? <a href="#" (click)="toggle($event)">Sign in</a> }
      </p>
      <div class="demo">
        <strong>Demo logins</strong>
        <button type="button" (click)="fill('organizer@demo.com','organizer123')">Organizer</button>
        <button type="button" (click)="fill('alice@demo.com','attendee123')">Alice</button>
        <button type="button" (click)="fill('bob@demo.com','attendee123')">Bob</button>
      </div>
    </div>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  mode = signal<'login' | 'register'>('login');
  name = signal(''); email = signal(''); password = signal('');
  error = signal(''); busy = signal(false);

  toggle(e: Event) { e.preventDefault(); this.mode.update((m) => (m === 'login' ? 'register' : 'login')); this.error.set(''); }
  fill(email: string, pw: string) { this.mode.set('login'); this.email.set(email); this.password.set(pw); }

  submit() {
    this.busy.set(true); this.error.set('');
    const obs = this.mode() === 'login'
      ? this.auth.login(this.email(), this.password())
      : this.auth.register(this.email(), this.name(), this.password());
    obs.subscribe({
      next: () => { this.busy.set(false); this.router.navigateByUrl('/events'); },
      error: (e) => { this.busy.set(false); this.error.set(errMsg(e)); },
    });
  }
}
