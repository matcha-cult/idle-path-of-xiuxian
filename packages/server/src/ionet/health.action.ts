/**
 * 系统/健康 Action（cmd 段 1，见 cmd.ts）
 *
 * system.ping 是免鉴权白名单里的 Action，用于 WS 通道冒烟与心跳探活。
 * 作为 provider 由各 LogicModule 提供；框架在 onModuleInit 经 resolveAction 从容器解析实例并注册（具备 DI）。
 */
import { Injectable } from '@nestjs/common';
import { ActionController, ActionMethod } from '@nbb-ionet/core-framework';
import { SYSTEM_CMD } from './cmd.js';

@Injectable()
@ActionController(SYSTEM_CMD.cmd)
export class HealthAction {
  @ActionMethod(SYSTEM_CMD.ping)
  ping(): { status: string; service: string; timestamp: number } {
    return {
      status: 'ok',
      service: 'idle-path-of-xiuxian',
      timestamp: Date.now(),
    };
  }
}
