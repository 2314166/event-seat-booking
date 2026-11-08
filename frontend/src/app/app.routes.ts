import { Routes } from '@angular/router';
import { requireRole } from './auth';
import { LoginPage } from './pages/login';
import { EventsPage } from './pages/events';
import { EventDetailPage } from './pages/event-detail';
import { HistoryPage } from './pages/history';
import { EventFormPage } from './pages/event-form';
import { SettingsPage } from './pages/settings';

export const routes: Routes = [
  { path: 'login', component: LoginPage },
  { path: 'events', component: EventsPage, canActivate: [requireRole()] },
  { path: 'events/:id', component: EventDetailPage, canActivate: [requireRole()] },
  { path: 'history', component: HistoryPage, canActivate: [requireRole('attendee')] },
  { path: 'organizer/events/new', component: EventFormPage, canActivate: [requireRole('organizer')] },
  { path: 'organizer/settings', component: SettingsPage, canActivate: [requireRole('organizer')] },
  { path: '', pathMatch: 'full', redirectTo: 'events' },
  { path: '**', redirectTo: 'events' },
];
