import app from './app';

const PORT = process.env.PORT ?? 3000;

app.listen(PORT, () => {
  console.log(`[server] running on port ${PORT} (${process.env.NODE_ENV})`);
});
