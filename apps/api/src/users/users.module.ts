import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { SettingsService } from './settings.service';
import {
  UsersAdminController,
  AdminsAdminController,
  AuditLogAdminController,
} from './users.admin.controller';
import {
  SecurityAdminController,
  SettingsController,
} from './settings.controller';

@Module({
  controllers: [
    UsersAdminController,
    AdminsAdminController,
    AuditLogAdminController,
    SettingsController,
    SecurityAdminController,
  ],
  providers: [UsersService, SettingsService],
  exports: [UsersService],
})
export class UsersModule {}
