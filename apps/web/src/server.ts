import { join } from 'node:path';
import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from '@angular/ssr/node';
import express from 'express';
import helmet from 'helmet';

const SUBPATH = '/hire-path-job';
const browserDistFolder = join(import.meta.dirname, '../browser');

const angularApp = new AngularNodeAppEngine();

function helmetConfig() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'connect-src': ["'self'", 'http://localhost:3000', 'https://hire-path-jobs-api.vercel.app'],
        'font-src': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'img-src': ["'self'", 'data:'],
        'object-src': ["'none'"],
      },
    },
    xContentTypeOptions: true,
  });
}

const subApp = express();
subApp.use(helmetConfig());

subApp.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

subApp.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

const app = express();
app.use(SUBPATH, subApp);
app.use(subApp);

if (isMainModule(import.meta.url) || process.env.pm_id) {
  const port = process.env.PORT || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}${SUBPATH}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
