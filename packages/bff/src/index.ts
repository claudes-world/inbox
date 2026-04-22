import './lib/otel.js'; // must be first — registers tracer/meter providers
import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { registerDbSizeGauge } from "./lib/otel.js";

const PORT = Number(process.env.PORT) || 38550;
const DB_PATH = process.env["INBOX_DB"] || "./inbox.db";

registerDbSizeGauge(DB_PATH);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`@inbox/bff listening on http://localhost:${info.port}`);
});
