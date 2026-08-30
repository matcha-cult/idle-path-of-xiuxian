import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../guards/jwt-auth.guard.js';

/** 标记接口为公开接口，不经过 JWT 认证 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
