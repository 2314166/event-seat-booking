import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.factory';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api`);
}
bootstrap();
