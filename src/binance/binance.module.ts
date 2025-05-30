import { Module } from '@nestjs/common';
import { BinanceService } from './binance.service';
import { BinanceGateway } from './binance.gateway';
import { BinanceController } from './binance.controller';

@Module({
  providers: [BinanceGateway, BinanceService],
  controllers: [BinanceController],
})
export class BinanceModule {}
