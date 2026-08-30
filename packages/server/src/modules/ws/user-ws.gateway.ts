/**
 * NestJS 侧预留 WS 连接入口
 *
 * - 路径：/ws-user
 * - 仅负责连接接入/握手，不承载业务逻辑。
 * - ionet-ts 侧 WS 接口禁止调整，因此这里不使用 ionet-ts WS。
 */
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { WebSocket } from 'ws';

@WebSocketGateway({ path: '/ws-user' })
export class UserWsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  handleConnection(client: WebSocket): void {
    client.send(
      JSON.stringify({
        event: 'connected',
        message: 'NestJS WS entry reserved for 放置·修仙之路',
      }),
    );
  }

  handleDisconnect(_client: WebSocket): void {
    // 预留入口暂不处理业务
  }
}
