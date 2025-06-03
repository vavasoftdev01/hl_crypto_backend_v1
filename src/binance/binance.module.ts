import { Module } from '@nestjs/common';
import { BinanceService } from './binance.service';
import { BinanceGateway } from './binance.gateway';
import { BinanceController } from './binance.controller';
import { SocketIoGateway } from './SocketIO.gateway';


@Module({
  providers: [BinanceGateway, BinanceService, SocketIoGateway],
  controllers: [BinanceController],
})
export class BinanceModule {}
