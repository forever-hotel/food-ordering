import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, type TypeOrmModuleOptions } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        ...(configService.get<string>('DB_HOST')
          ? {
              host: configService.getOrThrow<string>('DB_HOST'),
              port: Number(configService.get<string>('DB_PORT') || 5432),
              username: configService.getOrThrow<string>('DB_USERNAME'),
              password: configService.getOrThrow<string>('DB_PASSWORD'),
              database: configService.getOrThrow<string>('DB_NAME'),
              ssl:
                configService.get<string>('DB_SSL') === 'true'
                  ? { rejectUnauthorized: true }
                  : false,
            }
          : { url: configService.getOrThrow<string>('DATABASE_URL') }),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
