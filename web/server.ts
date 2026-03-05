import type { NextFunction, Request, Response } from 'express';

const express = require('express') as typeof import('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');

const config = require('./utils/config') as {
  get: <T = unknown>(path: string) => T;
};

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler') as {
  errorHandler: (err: unknown, req: Request, res: Response, next: NextFunction) => void;
  notFoundHandler: (req: Request, res: Response) => void;
};

const { httpLogger, loggers } = require('./utils/logger') as {
  httpLogger: ReturnType<typeof express.json>;
  loggers: {
    system: {
      info: (payload: Record<string, unknown>) => void;
    };
  };
};

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json());
app.use(cors());
app.use(httpLogger);

app.use('/api', require('./routes/core'));
app.use('/api', require('./routes/sync'));
app.use('/api/words', require('./routes/words'));

if (config.get<string>('core.env') === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));

  app.get('/{*splat}', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  const clientPort = config.get<number>('client.dev_port');
  app.get('/{*splat}', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.redirect(`http://localhost:${clientPort}${req.originalUrl}`);
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

const apiPort = config.get<number>('server.port');
const serverHost = config.get<string>('server.host');

app.listen(apiPort, serverHost, () => {
  loggers.system.info({
    msg: `Server running on http://${serverHost}:${apiPort}`,
    port: apiPort,
    host: serverHost,
    env: config.get<string>('core.env'),
    logLevel: config.get<string>('logging.level'),
  });
});
