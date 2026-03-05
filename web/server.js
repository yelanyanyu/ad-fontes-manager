const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./utils/config');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { httpLogger, loggers } = require('./utils/logger');

const app = express();

// Security headers middleware
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

// HTTP 请求日志中间件（在基础中间件之后，路由之前）
app.use(httpLogger);

// Mount Routes
app.use('/api', require('./routes/core'));
app.use('/api', require('./routes/sync')); // Mounts /local and /sync
app.use('/api/words', require('./routes/words'));

// Static Serving (Production vs Dev) - MUST be before 404 handler
if (config.get('core.env') === 'production') {
  // Serve built Vue files
  app.use(express.static(path.join(__dirname, 'dist')));

  // SPA Catch-all (excluding API) - Express 5 syntax
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  const clientPort = config.get('client.dev_port');
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.redirect(`http://localhost:${clientPort}${req.originalUrl}`);
  });
}

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

// Start Server
const apiPort = config.get('server.port');
const serverHost = config.get('server.host');
app.listen(apiPort, serverHost, () => {
  loggers.system.info({
    msg: `Server running on http://${serverHost}:${apiPort}`,
    port: apiPort,
    host: serverHost,
    env: config.get('core.env'),
    logLevel: config.get('logging.level'),
  });
});
