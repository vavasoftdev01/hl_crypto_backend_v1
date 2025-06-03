import { Controller, Get, Query } from '@nestjs/common';
import { BinanceService } from './binance.service';

@Controller('binance')
export class BinanceController {
  constructor(private readonly binanceService: BinanceService) {}

  @Get('historical')
  async getHistoricalCandlesticks(
    @Query('symbol') symbol: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @Query('limit') limit: string,
  ) {
    // Parse query parameters to numbers
    const startTimeNum = parseInt(startTime, 10);
    const endTimeNum = parseInt(endTime, 10);
    const limitNum = parseInt(limit, 10);

    // Validate the parsed numbers
    if (isNaN(startTimeNum) || isNaN(endTimeNum) || isNaN(limitNum)) {
      throw new Error(`Invalid query parameters: startTime=${startTime}, endTime=${endTime}, limit=${limit}`);
    }

    return this.binanceService.getHistoricalCandlesticks(symbol, startTimeNum, endTimeNum, limitNum);
  }
}