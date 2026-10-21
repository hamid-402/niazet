import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketsSupportController } from './tickets.support.controller';

@Module({
  controllers: [TicketsController, TicketsSupportController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
