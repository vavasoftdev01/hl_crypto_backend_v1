import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { BinanceService } from './binance.service';
import { OnModuleInit } from '@nestjs/common';

@WebSocketGateway({ namespace: 'hl_price', cors: { origin: '*' } })
export class SocketIoGateway implements OnModuleInit {
  @WebSocketServer()
  server: Server;

  constructor(private readonly binanceService: BinanceService) {}

  onModuleInit() {
    this.binanceService.onPriceUpdate((data) => {
      this.server.emit('chartUpdate', {
        time: Math.floor(data.timestamp.getTime() / 1000),
        value: parseFloat(data.price),
      });
    });

    this.binanceService.onTradeUpdate((data) => {
      this.server.emit('tradeUpdate', data);
    });
  }
}