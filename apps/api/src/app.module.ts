import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
