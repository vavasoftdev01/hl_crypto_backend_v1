import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';
import { BinanceService } from './binance.service';

@WebSocketGateway()
export class BinanceGateway {
  constructor(private readonly binanceService: BinanceService) {}
  //
}
