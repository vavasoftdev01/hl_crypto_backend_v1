import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { WebsocketModule } from './websocket/websocket.module';


async function bootstrap() {
  console.log(process.env.APP_PORT);
  const apiPort = +process.env.APP_PORT;

  // REST Instance
  const app = await NestFactory.create(AppModule);
  const server = app.getHttpServer();

  // Enable CORS with explicit settings
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Accept',
  });

  await app.listen(apiPort);

  // WebSocket Instance
  const wsApp = await NestFactory.create(WebsocketModule);
  wsApp.useWebSocketAdapter(new IoAdapter(wsApp));
  const wsPort = +process.env.WS_PORT;
  await wsApp.listen(wsPort);

  console.log(`REST server running on port ${apiPort}, WebSocket server running on port ${wsPort}`);
}

bootstrap();