import { createApp } from './src/app.js';
import { logger } from './src/logger.js';
import { loadConfig } from './src/config.js';

const config = loadConfig(process.env);
const app = createApp({ config });

const port = Number(process.env.PORT || 8080);
const server = app.listen(port, () => {
  logger.info({ msg: 'preview-api listening', port, vertexLocation: config.vertexLocation });
});

// Cloud Run sends SIGTERM before scaling an instance down; finish in-flight work.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    logger.info({ msg: 'shutting down', signal: sig });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
