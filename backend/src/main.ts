import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  });

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
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Forever Hotel FOSS API Documentation',
  });

  await app.listen(process.env.PORT ?? 3001, process.env.HOST || '::');
}
bootstrap();
