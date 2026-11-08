import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthUser, CurrentUser, Roles } from '../common/auth';
import { EventsService } from './events.service';
import { BookingsService } from '../bookings/bookings.service';
import { AiService } from '../ai/ai.service';

class CreateEventDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsDateString() date: string;
  @IsString() @MinLength(1) @MaxLength(120) venue: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsInt() @Min(1) @Max(50) rows: number;
  @IsInt() @Min(1) @Max(50) seatsPerRow: number;
}
class UpdateEventDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) venue?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
class SeatingDto {
  @IsInt() @Min(1) @Max(50) rows: number;
  @IsInt() @Min(1) @Max(50) seatsPerRow: number;
}
class HoldDto {
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(50) @IsInt({ each: true }) seatIds: number[];
}
class AiDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(1) venue: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() @MaxLength(200) keywords?: string;
}

@Controller('events')
export class EventsController {
  constructor(private events: EventsService, private bookings: BookingsService, private ai: AiService) {}

  @Get() list() { return this.events.list(); }

  @Post('ai-description') @Roles('organizer')
  draft(@Body() d: AiDto) { return this.ai.draftDescription(d); }

  @Post() @Roles('organizer')
  create(@CurrentUser() u: AuthUser, @Body() d: CreateEventDto) { return this.events.create(d, u.id); }

  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.events.get(id); }

  @Patch(':id') @Roles('organizer')
  update(@Param('id', ParseIntPipe) id: number, @Body() d: UpdateEventDto) { return this.events.update(id, d); }

  @Put(':id/seating') @Roles('organizer')
  seating(@Param('id', ParseIntPipe) id: number, @Body() d: SeatingDto) { return this.events.changeSeating(id, d.rows, d.seatsPerRow); }

  @Get(':id/seats')
  seats(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.events.seatMap(id, u.id); }

  @Post(':id/holds') @Roles('attendee')
  hold(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() d: HoldDto) {
    return this.bookings.createHold(u.id, id, d.seatIds);
  }
}
