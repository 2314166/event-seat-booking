import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable,
  SetMetadata, UnauthorizedException, createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

export type Role = 'attendee' | 'organizer';
export interface AuthUser { id: number; email: string; name: string; role: Role }

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const CurrentUser = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

/** Global guard: every route needs a valid JWT unless marked @Public(); @Roles enforces role on the server. */
export const Public = () => SetMetadata('public', true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>('public', [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Missing token');
    try {
      const p = await this.jwt.verifyAsync(token);
      req.user = { id: p.sub, email: p.email, name: p.name, role: p.role } as AuthUser;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [ctx.getHandler(), ctx.getClass()]);
    if (roles && roles.length && !roles.includes(req.user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
