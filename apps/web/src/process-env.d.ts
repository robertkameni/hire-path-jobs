declare global {
  namespace NodeJS {
    interface ProcessEnv {
      readonly PORT?: string;
      /** Set when the Node process is managed by PM2. */
      readonly pm_id?: string;
    }
  }
}

export {};
