import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CatalogModule } from './catalog/catalog.module';
import { OrdersModule } from './orders/orders.module';
import { ExecutorModule } from './executor/executor.module';
import { QcModule } from './qc/qc.module';
import { TicketsModule } from './tickets/tickets.module';
import { FinanceModule } from './finance/finance.module';
import { FeedbackModule } from './feedback/feedback.module';
import { FilesModule } from './files/files.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { validateEnvironment } from './config/validate-env';
import { JobsModule } from './jobs/jobs.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AccountModule } from './account/account.module';
import { ReportingModule } from './reporting/reporting.module';
import { ObservabilityModule } from './observability/observability.module';
import { RequestTelemetryMiddleware } from './observability/request-telemetry.middleware';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    OrdersModule,
    ExecutorModule,
    QcModule,
    TicketsModule,
    FinanceModule,
    FeedbackModule,
    FilesModule,
    JobsModule,
    AccountModule,
    ReportingModule,
    ObservabilityModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, RequestTelemetryMiddleware)
      .forRoutes('*');
  }
}
