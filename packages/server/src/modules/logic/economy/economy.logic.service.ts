/**
 * economy 逻辑服门面（L1，依赖 item, prop）
 *
 * 职责：通货/精华持有与注入、炼器十四操作。
 */
import { Injectable } from '@nestjs/common';
import { CraftService } from './internal/craft.service.js';
import { CurrencyService } from './internal/currency.service.js';

@Injectable()
export class EconomyLogicService {
  constructor(
    private readonly currencyService: CurrencyService,
    private readonly craftService: CraftService,
  ) {}

  currencies(userId: number) {
    return this.currencyService.catalog(userId);
  }

  grantCurrency(userId: number, code: string, count: number) {
    return this.currencyService.grant(userId, code, count);
  }

  essences(userId: number) {
    return this.currencyService.catalogEssences(userId);
  }

  grantEssence(userId: number, code: string, count: number) {
    return this.currencyService.grantEssence(userId, code, count);
  }

  craft(userId: number, itemId: number, op: string, extraCode?: string) {
    return this.craftService.craft(userId, itemId, op, extraCode);
  }
}
