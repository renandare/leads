import 'express-async-errors';
import 'dotenv/config';

import cors from 'cors';
import express, { Request } from 'express';
import helmet from 'helmet';

import { errorMiddleware } from './middlewares/error.middleware';
import router from './routes';

const app = express();

app.use(helmet());
app.use(cors());

// Capture raw body buffer before JSON parsing — required for webhook HMAC verification.
app.use(express.json({
  verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
    req.rawBody = buf;
  },
}));

app.use(router);

app.use(errorMiddleware);

export default app;
