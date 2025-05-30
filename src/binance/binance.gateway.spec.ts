import { Test, TestingModule } from '@nestjs/testing';
import { BinanceGateway } from './binance.gateway';
import { BinanceService } from './binance.service';

describe('BinanceGateway', () => {
  let gateway: BinanceGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BinanceGateway, BinanceService],
    }).compile();

    gateway = module.get<BinanceGateway>(BinanceGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
