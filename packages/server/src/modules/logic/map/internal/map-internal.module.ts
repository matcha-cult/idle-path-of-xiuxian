/**
 * 地图模块（settings-revision-2 §5）
 *
 * 依赖 CharacterModule（角色解析 + 共用战力 `PlayerPowerService`）。
 * 本模块**不依赖 zone**：层数推进由 zone 域调用 map 门面的挂钩方法完成，
 * 以避免 zone ↔ map 的循环依赖（见 `scripts/lib/dep-rules.ts` 的 ALLOWED_DEPS）。
 */
import { Module } from '@nestjs/common';
import { CharacterModule } from '../../../character/character.module.js';
import { MapService } from './map.service.js';

@Module({
  imports: [CharacterModule],
  providers: [MapService],
  exports: [MapService],
})
export class MapModule {}
