/**
 * NestJS WS 预留模块
 */
import { Module } from '@nestjs/common';
import { UserWsGateway } from './user-ws.gateway.js';

@Module({
  providers: [UserWsGateway],
})
export class UserWsModule {}
