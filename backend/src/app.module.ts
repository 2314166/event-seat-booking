import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { DbModule } from './db/db.module';
import { AuthGuard } from './common/auth';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { BookingsController } from './bookings/bookings.controller';
import { BookingsService } from './bookings/bookings.service';
import { AiService } from './ai/ai.service';

@Module({
  imports: [
    DbModule,
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET || 'dev-secret', signOptions: { expiresIn: '8h' } }),
  ],
  controllers: [AuthController, SettingsController, EventsController, BookingsController],
  providers: [
    AuthService, SettingsService, EventsService, BookingsService, AiService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
