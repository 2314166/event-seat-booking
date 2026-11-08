import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Roles } from '../common/auth';
import { SettingsService } from './settings.service';

class UpdateSettingsDto {
  @IsOptional() @IsInt() @Min(10) @Max(3600) holdDurationSeconds?: number;
  @IsOptional() @IsInt() @Min(1) @Max(20) maxSeatsPerBooking?: number;
}

@Controller('settings')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get() get() { return this.settings.get(); }

  @Put() @Roles('organizer')
  update(@Body() dto: UpdateSettingsDto) {
    if (dto.holdDurationSeconds === undefined && dto.maxSeatsPerBooking === undefined) {
      throw new BadRequestException('Nothing to update');
    }
    return this.settings.update(dto);
  }
}
