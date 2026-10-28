import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { correlationMiddleware } from './common/middleware/correlation.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  });

  // Global request correlation ID injection
  app.use(correlationMiddleware);

  // Global standardized error filter with correlation and sanitization
  app.useGlobalFilters(new HttpExceptionFilter());

  // Strict global DTO validation with non-whitelisted property rejection
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('Forever Hotel - Food Ordering & Services System (FOSS) API')
    .setDescription(
      'API specification and interactive documentation for Forever Hotel FOSS guest services, QR authentication, and booking integrations.',
    )
    .setVersion('1.0')
    .addTag(
      'guest-sessions',
      'Guest QR authentication, stay verification, and session lifecycle',
    )
    .addTag(
      'integrations',
      'Internal hotel service integrations (Booking/FDS verification)',
    )
    .addTag('health', 'System liveness and database readiness health probes')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Bearer',
        name: 'Authorization',
        description: 'Enter guest session token',
        in: 'header',
      },
      'bearer',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-internal-service-key',
        in: 'header',
        description:
          'Service authentication key for internal FDS/hotel webhooks',
      },
      'internal-service-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Forever Hotel FOSS API Documentation',
  });

  await app.listen(process.env.PORT ?? 3001, process.env.HOST || '::');
}
bootstrap();
