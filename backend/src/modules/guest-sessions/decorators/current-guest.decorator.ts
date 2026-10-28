import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { GuestContext } from '../interfaces/guest-context.interface.js';

export const CurrentGuest = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): GuestContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.guest;
  },
);
