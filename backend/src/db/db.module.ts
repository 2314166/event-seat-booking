import { Global, Module } from '@nestjs/common';
import { DbService } from './db.service';
import { Clock, SystemClock } from '../common/clock';

@Global()
@Module({
  providers: [DbService, { provide: Clock, useClass: SystemClock }],
  exports: [DbService, Clock],
})
export class DbModule {}
