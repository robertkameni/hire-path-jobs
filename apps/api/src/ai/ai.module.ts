import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import aiConfig from './ai.config';

@Module({
  imports: [ConfigModule.forFeature(aiConfig)],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
