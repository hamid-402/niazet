import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketsSupportController } from './tickets.support.controller';
import { SlaCalendarAdminController } from '../contracts/calendar.controller';

@Module({
  controllers: [
    TicketsController,
    TicketsSupportController,
    SlaCalendarAdminController,
  ],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
