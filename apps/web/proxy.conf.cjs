/** Proxies /api/* to the NestJS backend during `ng serve` (see environment.ts apiBaseUrl). */
module.exports = {
  '/api': {
    target: 'http://localhost:3000',
    secure: false,
    changeOrigin: true,
  },
};
