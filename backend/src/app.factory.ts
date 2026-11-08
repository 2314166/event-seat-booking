import { INestApplication, ValidationPipe } from '@nestjs/common';

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();
  return app;
}
