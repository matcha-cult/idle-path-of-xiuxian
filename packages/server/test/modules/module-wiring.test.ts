import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { APP_GUARD } from '@nestjs/core';
import { IonetModule } from '@nbb-ionet/extension-nestjs';
import { AppModule } from '../../src/app.module.js';
import { DatabaseModule } from '../../src/modules/database/database.module.js';
import { DatabaseService } from '../../src/modules/database/database.service.js';
import { AuthModule } from '../../src/modules/auth/auth.module.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { CharacterModule } from '../../src/modules/character/character.module.js';
import { CharacterService } from '../../src/modules/character/character.service.js';
import { HealthModule } from '../../src/modules/health/health.module.js';
import { HealthService } from '../../src/modules/health/health.service.js';
import { EdgeModule } from '../../src/modules/edge/edge.module.js';
import { EdgeService } from '../../src/modules/edge/edge.service.js';
import { NOTIFICATION_PORT } from '../../src/common/ports/notification.port.js';
import { GameActionBridgeModule } from '../../src/ionet/game-action-bridge.module.js';
import { GameModule } from '../../src/modules/game/game.module.js';
import { GameDatabaseService } from '../../src/modules/game/game-database.service.js';
import { RateLimiterService } from '../../src/common/services/rate-limiter.service.js';
import { CurrencyModule } from '../../src/modules/game/currency/currency.module.js';
import { CraftService } from '../../src/modules/game/currency/craft.service.js';
import { CurrencyService } from '../../src/modules/game/currency/currency.service.js';

function meta(key: string, target: object): unknown[] {
  return (Reflect.getMetadata(key, target) as unknown[] | undefined) ?? [];
}

function hasModule(imports: unknown[], target: unknown): boolean {
  return imports.some((entry) => entry === target || (entry as { module?: unknown })?.module === target);
}

describe('根模块接线边界', () => {
  test('AppModule 导入基础能力与游戏/对外服/桥接', () => {
    const imports = meta('imports', AppModule);
    for (const mod of [IonetModule, DatabaseModule, AuthModule, CharacterModule, GameModule, HealthModule, EdgeModule, GameActionBridgeModule]) {
      assert.ok(hasModule(imports, mod), `AppModule 缺少导入: ${(mod as {name?:string}).name}`);
    }
  });

  test('IonetModule.forRoot 使用 attach 模式 /ws 且不启用 ionet HTTP/Redis', () => {
    const imports = meta('imports', AppModule);
    const ionet = imports.find((entry) => (entry as { module?: unknown })?.module === IonetModule) as
      | { providers?: Array<{ provide?: unknown; useValue?: unknown }> }
      | undefined;
    assert.ok(ionet, '未找到 IonetModule 动态模块');
    const options = ionet.providers?.find((p) => typeof p.provide === 'symbol' && String(p.provide).includes('IONET_MODULE_OPTIONS'))
      ?.useValue as { actions?: unknown[]; httpServer?: unknown; wsServer?: { attachNestServer?: boolean; path?: string }; redis?: unknown } | undefined;
    assert.ok(options, '未找到 IonetModule 选项');
    assert.deepEqual(options?.actions, []);
    assert.equal(options?.httpServer, false);
    assert.equal(options?.redis, false);
    assert.equal(options?.wsServer?.attachNestServer, true);
    assert.equal(options?.wsServer?.path, '/ws');
  });

  test('AppModule 注册全局 JWT Guard', () => {
    const providers = meta('providers', AppModule) as Array<{ provide?: unknown }>;
    assert.ok(providers.some((p) => p.provide === APP_GUARD), '缺少 APP_GUARD');
  });
});

describe('各模块 providers/exports 边界', () => {
  const cases: Array<[string, object, unknown[], unknown[]]> = [
    ['DatabaseModule', DatabaseModule, [DatabaseService], [DatabaseService]],
    ['AuthModule', AuthModule, [AuthService], [AuthService]],
    ['CharacterModule', CharacterModule, [CharacterService], [CharacterService]],
    ['HealthModule', HealthModule, [HealthService], [HealthService]],
    ['EdgeModule', EdgeModule, [EdgeService, NOTIFICATION_PORT], [EdgeService, NOTIFICATION_PORT]],
    ['GameModule', GameModule, [GameDatabaseService, RateLimiterService], [GameDatabaseService, RateLimiterService]],
    ['CurrencyModule', CurrencyModule, [CurrencyService, CraftService], [CurrencyService, CraftService]],
  ];
  for (const [name, mod, providers, exportsList] of cases) {
    test(`${name} 声明并导出关键 provider`, () => {
      const declared = meta('providers', mod);
      const exported = meta('exports', mod);
      for (const token of providers) {
        assert.ok(
          declared.includes(token) || declared.some((d) => (d as { provide?: unknown })?.provide === token),
          `${name} providers 缺少 ${String(token)}`,
        );
      }
      for (const token of exportsList) {
        assert.ok(exported.includes(token), `${name} exports 缺少 ${String(token)}`);
      }
    });
  }
});
