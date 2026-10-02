import app from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { scheduleLowStockAlerts } from './jobs/lowStockAlert.job.js';

async function start() {
  await connectDB();

  const server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
  });

  let stopJobs = () => {};
  if (env.ENABLE_CRON) {
    stopJobs = scheduleLowStockAlerts();
    console.log('Cron enabled: daily stock alerts at 08:00 IST');
  }

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    stopJobs();
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref(); // force-exit if connections hang
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});