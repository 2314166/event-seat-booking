import { Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Roles } from '../common/auth';
import { BookingsService } from './bookings.service';

@Controller('bookings')
export class BookingsController {
  constructor(private bookings: BookingsService) {}

  @Get('mine') @Roles('attendee')
  mine(@CurrentUser() u: AuthUser) { return this.bookings.history(u.id); }

  @Post(':id/confirm') @Roles('attendee')
  confirm(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.bookings.confirm(u.id, id); }

  @Delete(':id')
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.bookings.cancel(u.id, id, u.role === 'organizer');
  }
}
