import app from './app';
import { retryWorker } from '@shared/container';

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`[server] running on port ${PORT} (${process.env.NODE_ENV})`);

  // Start the retry worker loop
  const RETRY_INTERVAL_MS = 60_000;
  setInterval(() => { retryWorker.tick().catch(() => {}); }, RETRY_INTERVAL_MS);
});
