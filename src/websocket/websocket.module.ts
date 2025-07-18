import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
//import { BinanceModule } from 'src/binance/binance.module';

/**
 * All Websocket related modules should be registered here.
 */
@Module({
    imports: [
        EventEmitterModule.forRoot({
            // the maximum amount of listeners that can be assigned to an event
            maxListeners: 10,
            // show event name in memory leak message when more than maximum amount of listeners is assigned
            verboseMemoryLeak: false,
            // disable throwing uncaughtException if an error event is emitted and it has no listeners
            ignoreErrors: false,
        }),
        //BinanceModule
    ],
    providers: [],
    controllers: []
})
export class WebsocketModule {}
