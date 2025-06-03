import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import axios from 'axios';

@Injectable()
export class BinanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinanceService.name);
  private ws: WebSocket | null = null;
  private tradeWs: WebSocket | null = null;
  private readonly wsUrl = process.env.WS_URL;
  private readonly tradeWsUrl = process.env.WS_TRADE_URL;
  private readonly fallbackWsUrl = process.env.WS_FALLBACK_URL;
  private readonly binanceApiUrl = process.env.BINANCE_API_URL;
  private latestPrice: string | null = null;
  private reconnectAttempts = 0;
  private tradeReconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectInterval = 5000;
  private currentUrl: string;
  private readonly priceEmitter = new EventEmitter();
  private tradeData: string | {} = null;
  private historicalCache: Map<string, { data: any[]; timestamp: number }> = new Map();
  private readonly cacheTTL = 60 * 1000; // Cache for 1 minute

  constructor() {
    this.currentUrl = this.wsUrl;
  }

  async onModuleInit() {
    this.connectWebSocket();
    this.connectTradeWebSocket();
    this.fetchInitialPrice();
  }

  async onModuleDestroy() {
    if (this.ws) {
      this.ws.close();
      this.logger.log('WebSocket (aggTrade) connection closed');
    }
    if (this.tradeWs) {
      this.tradeWs.close();
      this.logger.log('WebSocket (trade) connection closed');
    }
  }

  private async fetchInitialPrice() {
    try {
      this.logger.log('Fetching initial price via REST API...');
      const response = await axios.get(`${this.binanceApiUrl}/ticker/price`, {
        params: { symbol: 'BTCUSDT' },
      });
      const price = response.data.price;
      const timestamp = Date.now();
      const data = {
        p: price,
        q: '0.1',
        T: timestamp,
      };
      this.logger.log(`Fetched initial price --: ${JSON.stringify(data)}`);
      this.handleTradeData(data);
    } catch (error) {
      this.logger.error('Error fetching initial price via REST API:', error.message);
    }
  }

  private connectWebSocket() {
    this.logger.log(`Attempting to connect to ${this.currentUrl}`);

    this.ws = new WebSocket(this.currentUrl, {
      timeout: 30000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    this.ws.on('open', () => {
      this.logger.log(`Connected to Binance WebSocket (aggTrade) at ${this.currentUrl}`);
      this.reconnectAttempts = 0;
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const trade = JSON.parse(data.toString());
        //this.logger.log(`Received aggTrade data: ${JSON.stringify(trade)}`); TODO: env based logger
        const mappedTrade = {
          p: trade.p,
          q: trade.q,
          T: trade.T,
        };
        this.handleTradeData(mappedTrade);
      } catch (error) {
        this.logger.error('Error parsing WebSocket (aggTrade) message:', error);
      }
    });

    this.ws.on('error', (error) => {
      this.logger.error(`WebSocket (aggTrade) error at ${this.currentUrl}: ${error.message}`, error.stack);
      this.reconnect();
    });

    this.ws.on('close', (code, reason) => {
      this.logger.warn(`WebSocket (aggTrade) connection closed at ${this.currentUrl} with code ${code}, reason: ${reason.toString()}`);
      this.reconnect();
    });
  }

  private connectTradeWebSocket() {
    this.logger.log(`Attempting to connect to trade stream at ${this.tradeWsUrl}`);
    this.tradeWs = new WebSocket(this.tradeWsUrl);

    this.tradeWs.on('open', () => {
      this.logger.log(`Connected to Binance WebSocket (trade) at ${this.tradeWsUrl}`);
      this.tradeReconnectAttempts = 0;
    });

    this.tradeWs.on('message', (data: Buffer) => {
      try {
        const trade = JSON.parse(data.toString());
        //this.logger.log(`Received trade data: ${JSON.stringify(trade)}`); TODO: env based logger

        if (!trade.T || !trade.p) {
          this.logger.error('Invalid trade data, missing T or p:', trade);
          return;
        }

        const tradeTime = parseInt(trade.T, 10);
        const tradePrice = parseFloat(trade.p);

        if (isNaN(tradeTime) || isNaN(tradePrice)) {
          this.logger.error('Invalid trade time or price:', { tradeTime, tradePrice });
          return;
        }

        const chartUpdate = {
          time: Math.floor(tradeTime / 1000),
          value: tradePrice,
        };
        this.priceEmitter.emit('tradeUpdate', chartUpdate);
      } catch (error) {
        this.logger.error('Error parsing WebSocket (trade) message:', error);
      }
    });

    this.tradeWs.on('error', (error) => {
      this.logger.error(`WebSocket (trade) error at ${this.tradeWsUrl}: ${error.message}`);
      this.reconnectTrade();
    });

    this.tradeWs.on('close', (code, reason) => {
      this.logger.warn(`WebSocket (trade) connection closed at ${this.tradeWsUrl} with code ${code}, reason: ${reason.toString()}`);
      this.reconnectTrade();
    });
  }

  private handleTradeData(trade: any) {
    const price = trade.p;
    const quantity = trade.q;
    const timestampValue = trade.T;

    if (!price || !quantity || !timestampValue) {
      this.logger.error('Invalid trade data:', trade);
      return;
    }

    const timestamp = new Date(timestampValue);
    if (isNaN(timestamp.getTime())) {
      this.logger.error(`Invalid timestamp in trade data: ${timestampValue}`);
      return;
    }

    const symbol = 'BTCUSDT';

    this.latestPrice = price;

    this.tradeData = {
      price: price,
      quantity: quantity,
      timestamp: timestamp,
      symbol: symbol,
    };

    //this.logger.log(`Emitting price update from handleTradeData: ${JSON.stringify(this.tradeData)}`);
    this.priceEmitter.emit('priceUpdate', { symbol, price, quantity, timestamp });
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.currentUrl !== this.fallbackWsUrl) {
        this.currentUrl = this.fallbackWsUrl;
        this.reconnectAttempts = 0;
        this.logger.log(`Switching to fallback URL: ${this.currentUrl}`);
      } else {
        this.logger.error('Max reconnect attempts reached on all URLs. Stopping reconnection.');
        return;
      }
    }

    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }

    this.reconnectAttempts++;
    this.logger.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) to ${this.currentUrl}...`);

    setTimeout(() => {
      this.connectWebSocket();
    }, this.reconnectInterval);
  }

  private reconnectTrade() {
    if (this.tradeReconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnect attempts reached for trade stream. Stopping reconnection.');
      return;
    }

    if (this.tradeWs) {
      this.tradeWs.terminate();
      this.tradeWs = null;
    }

    this.tradeReconnectAttempts++;
    this.logger.log(`Attempting to reconnect trade stream (${this.tradeReconnectAttempts}/${this.maxReconnectAttempts}) to ${this.tradeWsUrl}...`);

    setTimeout(() => {
      this.connectTradeWebSocket();
    }, this.reconnectInterval);
  }

  async getLatestPrice(): Promise<string | null> {
    return this.latestPrice;
  }

  async getTradeData(): Promise<any | null> {
    return this.tradeData;
  }

  onPriceUpdate(callback: (data: { symbol: string; price: string; quantity: string; timestamp: Date }) => void) {
    this.priceEmitter.on('priceUpdate', callback);
  }

  onTradeUpdate(callback: (data: { time: number; value: number }) => void) {
    this.priceEmitter.on('tradeUpdate', callback);
  }

  async getHistoricalCandlesticks(
    symbol: string,
    startTime: number,
    endTime: number,
    limit: number
  ): Promise<any[]> {
    // Safely log the incoming parameters
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    const isStartDateValid = !isNaN(startDate.getTime());
    const isEndDateValid = !isNaN(endDate.getTime());

    this.logger.log(`getHistoricalCandlesticks called with:`, {
      symbol,
      startTime,
      endTime,
      limit,
      startTimeDate: isStartDateValid ? startDate.toISOString() : 'Invalid Date',
      endTimeDate: isEndDateValid ? endDate.toISOString() : 'Invalid Date',
    });

    if (!symbol || startTime >= endTime || limit <= 0) {
      this.logger.error(`Invalid parameters: symbol=${symbol}, startTime=${startTime}, endTime=${endTime}, limit=${limit}`);
      return [];
    }

    // Validate that startTime and endTime are valid numbers
    if (isNaN(startTime) || isNaN(endTime)) {
      this.logger.error(`Invalid timestamps: startTime=${startTime}, endTime=${endTime} are not valid numbers`);
      return [];
    }

    // Additional validation for timestamps
    let currentTime = Date.now();
    const currentDate = new Date(currentTime);
    const isCurrentDateValid = !isNaN(currentDate.getTime());
    this.logger.log(
      `Current time for validation: ${currentTime} (${
        isCurrentDateValid ? currentDate.toISOString() : 'Invalid Date'
      })`
    );

    if (startTime > currentTime || endTime > currentTime) {
      this.logger.warn(`Timestamps are in the future: startTime=${startTime}, endTime=${endTime}, currentTime=${currentTime}. Clamping endTime to current time.`);
      endTime = currentTime;
      startTime = Math.min(startTime, endTime); // Ensure startTime is not greater than the new endTime
    }

    this.logger.log(`After clamping: startTime=${startTime}, endTime=${endTime}`);

    const cacheKey = `${symbol}-${startTime}-${endTime}-${limit}`;
    const cached = this.historicalCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      this.logger.log(`Returning cached historical candlesticks for ${cacheKey}`);
      return cached.data;
    }

    const maxPerRequest = 1000;
    const requestsNeeded = Math.ceil(limit / maxPerRequest);
    const allCandles: any[] = [];
    const interval = '1m';
    const maxRetries = 3;

    let currentStartTime = startTime;
    const timeRange = (endTime - startTime) / requestsNeeded;

    for (let i = 0; i < requestsNeeded; i++) {
      const currentEndTime = Math.min(currentStartTime + timeRange, endTime);
      const currentLimit = Math.min(limit - allCandles.length, maxPerRequest);
      let retryCount = 0;

      while (retryCount <= maxRetries) {
        try {
          const startDate = new Date(currentStartTime);
          const endDate = new Date(currentEndTime);
          const isStartDateValid = !isNaN(startDate.getTime());
          const isEndDateValid = !isNaN(endDate.getTime());

          this.logger.log(
            `Fetching historical candlesticks chunk ${i + 1}/${requestsNeeded} for ${symbol} from ${
              isStartDateValid ? startDate.toISOString() : 'Invalid Date'
            } to ${
              isEndDateValid ? endDate.toISOString() : 'Invalid Date'
            } with limit ${currentLimit} (Attempt ${retryCount + 1}/${maxRetries + 1})`
          );

          if (!isStartDateValid || !isEndDateValid) {
            this.logger.error(`Invalid date values: currentStartTime=${currentStartTime}, currentEndTime=${currentEndTime}`);
            return [];
          }

          const url = `${this.binanceApiUrl}/klines?symbol=${symbol}&interval=${interval}&startTime=${Math.floor(currentStartTime)}&endTime=${Math.floor(currentEndTime)}&limit=${currentLimit}`;
          this.logger.log(`Request URL: ${url}`);

          const response = await axios.get(`${this.binanceApiUrl}/klines`, {
            params: {
              symbol,
              interval,
              startTime: Math.floor(currentStartTime),
              endTime: Math.floor(currentEndTime),
              limit: currentLimit,
            },
            timeout: 10000,
          });

          this.logger.log(`Raw API response for chunk ${i + 1}:`, response.data);

          const candles = response.data.map((candle: any) => ({
            time: Math.floor(candle[0] / 1000),
            open: parseFloat(candle[1]),
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
          }));

          allCandles.push(...candles);

          if (candles.length > 0) {
            const timestamps = candles.map(candle => candle.time);
            const minTime = Math.min(...timestamps);
            const maxTime = Math.max(...timestamps);
            this.logger.log(`Timestamp range of fetched candlesticks (chunk ${i + 1}):`, {
              min: new Date(minTime * 1000).toISOString(),
              max: new Date(maxTime * 1000).toISOString(),
              count: candles.length,
            });
          } else {
            this.logger.warn(`No candlesticks returned for chunk ${i + 1}`);
          }

          this.logger.log(`Fetched ${candles.length} historical candlesticks for ${symbol} in chunk ${i + 1}`);

          if (candles.length > 0) {
            currentStartTime = candles[candles.length - 1].time * 1000 + 1000;
          } else {
            currentStartTime = currentEndTime + 1000;
          }

          break;
        } catch (error) {
          if (error.response && error.response.status === 429 && retryCount < maxRetries) {
            const retryAfter = error.response.headers['retry-after']
              ? parseInt(error.response.headers['retry-after'], 10) * 1000
              : 10000;
            this.logger.warn(`Rate limit exceeded. Retrying after ${retryAfter}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter));
            retryCount++;
          } else {
            this.logger.error('Error fetching historical candlesticks:', {
              message: error.message,
              response: error.response ? {
                status: error.response.status,
                data: error.response.data,
              } : null,
              stack: error.stack,
            });
            return [];
          }
        }
      }
    }

    this.logger.log(`Total fetched candlesticks: ${allCandles.length}`);

    this.historicalCache.set(cacheKey, { data: allCandles, timestamp: Date.now() });

    for (const [key, value] of this.historicalCache.entries()) {
      if (Date.now() - value.timestamp >= this.cacheTTL) {
        this.historicalCache.delete(key);
      }
    }

    return allCandles;
  }
}
