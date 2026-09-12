/**
 * quest 逻辑服门面（L3，依赖 zone, combat, item）
 *
 * 同时承载任务与章节（chapter 并入 quest 服）。
 */
import { Injectable } from '@nestjs/common';
import { ChapterService } from '../../game/quest/chapter.service.js';
import { QuestService } from '../../game/quest/quest.service.js';

@Injectable()
export class QuestLogicService {
  constructor(
    private readonly questService: QuestService,
    private readonly chapterService: ChapterService,
  ) {}

  list(userId: number) {
    return this.questService.list(userId);
  }

  detail(userId: number, code: string) {
    return this.questService.detail(userId, code);
  }

  sync(userId: number) {
    return this.questService.sync(userId);
  }

  chapterList(userId: number) {
    return this.chapterService.list(userId);
  }

  chapterDetail(userId: number, key: string) {
    return this.chapterService.detail(userId, key);
  }

  chapterSync(userId: number) {
    return this.chapterService.sync(userId);
  }
}
