/**
 * 对外服模块（Edge）
 *
 * - 提供 NotificationPort 实现（供逻辑服经端口投递广播/通知）；
 * - 只注入 ionet 的 WS 外部服务，不依赖任何业务模块。
 */
import { Global, Module } from '@nestjs/common';
import { NOTIFICATION_PORT } from '../../common/ports/notification.port.js';
import { EdgeService } from './edge.service.js';

@Global()
@Module({
  providers: [EdgeService, { provide: NOTIFICATION_PORT, useExisting: EdgeService }],
  exports: [NOTIFICATION_PORT, EdgeService],
})
export class EdgeModule {}
