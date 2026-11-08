import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './auth';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="nav">
      <a class="brand" routerLink="/events">🎟️ SeatBook</a>
      <nav>
        @if (auth.user()) {
          <a routerLink="/events" routerLinkActive="active">Events</a>
          @if (auth.isAttendee()) { <a routerLink="/history" routerLinkActive="active">My bookings</a> }
          @if (auth.isOrganizer()) {
            <a routerLink="/organizer/events/new" routerLinkActive="active">New event</a>
            <a routerLink="/organizer/settings" routerLinkActive="active">Settings</a>
          }
        }
      </nav>
      <div class="spacer"></div>
      @if (auth.user(); as u) {
        <span class="who">{{ u.name }} <span class="badge">{{ u.role }}</span></span>
        <button (click)="auth.logout()">Log out</button>
      }
    </header>
    <main><router-outlet /></main>
  `,
})
export class App {
  auth = inject(AuthService);
}
