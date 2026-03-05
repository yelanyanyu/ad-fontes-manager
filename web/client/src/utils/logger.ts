import { createConsola, type ConsolaInstance } from 'consola';

const isDev = import.meta.env.DEV;

const baseConfig = {
  level: isDev ? 6 : 2,
  fancy: isDev,
  formatOptions: {
    date: isDev,
    colors: isDev,
  },
};

export const logger: ConsolaInstance = createConsola(baseConfig);

export const wordLogger = logger.withTag('Word');
export const syncLogger = logger.withTag('Sync');
export const apiLogger = logger.withTag('API');
export const dbLogger = logger.withTag('DB');
export const uiLogger = logger.withTag('UI');

export default logger;
