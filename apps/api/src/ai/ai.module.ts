import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import aiConfig from './config/ai.config.js';
import { AiService } from './services/ai.service.js';
import { AI_Port } from './shared/ai.port.js';

@Module({
  imports: [ConfigModule.forFeature(aiConfig)],
  providers: [AiService, { provide: AI_Port, useClass: AiService }],
  exports: [AI_Port],
})
export class AiModule {}
