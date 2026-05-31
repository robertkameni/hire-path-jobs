import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
/** biome-ignore lint/style/useImportType: NestJS DI needs ConfigService at runtime (emitDecoratorMetadata). */
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { verifyJobAccessToken } from '../auth/job-access-token.js';

@Injectable()
export class JobAccessGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const jobId = request.params.id;
    if (typeof jobId !== 'string' || jobId.length === 0) {
      throw new ForbiddenException();
    }

    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) {
      throw new ForbiddenException();
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (token.length === 0) {
      throw new ForbiddenException();
    }

    const secret = this.configService.getOrThrow<string>('JOB_ACCESS_SECRET');
    if (!verifyJobAccessToken(jobId, token, secret)) {
      throw new ForbiddenException();
    }

    return true;
  }
}
