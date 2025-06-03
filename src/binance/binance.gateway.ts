import { WebSocketGateway, WebSocketServer, OnGatewayInit } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { BinanceService } from './binance.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'hl_price',
})
export class BinanceGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(BinanceGateway.name);
  private chartData: { [time: number]: { value: number; count: number } } = {};
  private recentPrices: { time: number; value: number }[] = []; // For baseline calculation
  private readonly chartInterval = 1000; // 1 second
  private readonly baselineWindow = 10; // 10 seconds for moving average

  constructor(private readonly binanceService: BinanceService) {}

  afterInit() {
    this.logger.log('WebSocket Gateway initialized for hl_price namespace');
    this.subscribeToPriceUpdates();
  }

  private subscribeToPriceUpdates() {
    this.binanceService.onPriceUpdate((data) => {
      // Emit raw price tick
      const tickData = {
        symbol: data.symbol,
        price: data.price,
        quantity: data.quantity,
        timestamp: data.timestamp.toISOString(),
      };
      this.server.emit('getCurrentPrice', tickData);
      // this.logger.debug(`Emitted price update: ${data.symbol} @ ${data.price}`);

      // Generate and emit chart data
      this.generateChartData(data);
    });
  }

  private generateChartData(trade: { symbol: string; price: string; quantity: string; timestamp: Date }) {
    const price = parseFloat(trade.price);
    const timestamp = trade.timestamp.getTime();
    const chartTime = Math.floor(timestamp / this.chartInterval) * this.chartInterval;

    // Update chart data
    if (!this.chartData[chartTime]) {
      this.chartData[chartTime] = {
        value: price,
        count: 1,
      };
    } else {
      const point = this.chartData[chartTime];
      point.value = (point.value * point.count + price) / (point.count + 1);
      point.count += 1;
    }

    // Update recent prices for baseline
    this.recentPrices.push({ time: chartTime, value: price });
    const baselineCutoff = timestamp - this.baselineWindow * this.chartInterval;
    this.recentPrices = this.recentPrices.filter((p) => p.time >= baselineCutoff);

    // Calculate baseline (moving average)
    const baseline =
      this.recentPrices.length > 0
        ? this.recentPrices.reduce((sum, p) => sum + p.value, 0) / this.recentPrices.length
        : price;

    // Emit chart update
    const chartPoint = {
      time: chartTime / 1000, // Seconds for Lightweight Charts
      value: parseFloat(this.chartData[chartTime].value.toFixed(2)),
      baseline: parseFloat(baseline.toFixed(2)), // Optional for BaselineSeries
    };

    this.server.emit('chartUpdate', chartPoint);
    // this.logger.debug(
    //   `Emitted chart point: time=${chartPoint.time}, value=${chartPoint.value}, baseline=${chartPoint.baseline}`,
    // );

    // Clean up old data (1 hour = 3600 points)
    const oneHourAgo = timestamp - 3600 * this.chartInterval;
    for (const time in this.chartData) {
      if (parseInt(time) < oneHourAgo) {
        delete this.chartData[time];
      }
    }
  }
}