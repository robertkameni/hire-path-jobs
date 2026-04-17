import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class AppController {
  @Get()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({
    status: 200,
    description: 'Server is running',
    schema: {
      example: { status: 'ok', timestamp: '2026-01-01T00:00:00.000Z' },
    },
  })
  healthCheck() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
