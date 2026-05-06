import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createConfiguredApplication } from './create-app.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await createConfiguredApplication();
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  logger.log(`Application running on http://localhost:${port}/api`);
}

void bootstrap();
