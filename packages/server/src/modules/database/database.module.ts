/**
 * 用户系统独立数据库模块
 *
 * 使用独立环境变量 USER_SERVICE_DATABASE_URL 连接新建数据库，
 * 不继承任何参考项目/废案的数据库。
 */
import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service.js';

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
