import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  healthCheck(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
