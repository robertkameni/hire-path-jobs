'use strict';

/**
 * Proxies `/api` from `ng serve` to Nest.
 * Override when your API port differs from 3000, e.g.:
 * PowerShell: $env:API_DEV_URL='http://127.0.0.1:3005'; npm run start
 */
const target = process.env.API_DEV_URL ?? 'http://127.0.0.1:3000';

module.exports = {
  '/api': {
    target,
    secure: false,
    changeOrigin: true,
  },
};
