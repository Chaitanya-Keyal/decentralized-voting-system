import { buildApp } from "./app";
import { env } from "./env";
import { startPublisher } from "./publisher";

const app = await buildApp();
await app.listen({ host: env.HOST, port: env.PORT });
startPublisher(app.log);
