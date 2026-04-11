import { serve } from "@hono/node-server";
import { app } from "./app.js";

const PORT = Number(process.env.PORT) || 38550;

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`@inbox/bff listening on http://localhost:${info.port}`);
});
