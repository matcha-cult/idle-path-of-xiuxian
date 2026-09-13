/**
 * 在线会话登记模块（P3.0 T2）。
 *
 * 做成 `@Global`：`system`（心跳 touch）与 `zone`（可见性上报 + tick 扫描）都要用，
 * 而它**不依赖任何业务域**，所以不构成跨逻辑服依赖。
 */
import { Global, Module } from '@nestjs/common';
import { ONLINE_SESSION_OPTIONS, OnlineSessionService } from './online-session.service.js';

@Global()
@Module({
  providers: [
    OnlineSessionService,
    // 生产走默认值；存在这个 provider 是为了让 Nest 能解析构造选项（见 token 的注释）
    { provide: ONLINE_SESSION_OPTIONS, useValue: {} },
  ],
  exports: [OnlineSessionService],
})
export class OnlineModule {}
