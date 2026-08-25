import { createApp } from './app';
import { assertRequiredEnv } from './config';

assertRequiredEnv();

const port = Number(process.env.PORT) || 8080;
const app = createApp();

app.listen(port, () => {
  console.log(`instagetter listening on port ${port}`);
});
