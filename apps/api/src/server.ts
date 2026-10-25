import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", () => ({ ok: true }));

// Localhost by default; set HOST=0.0.0.0 to reach the API from a phone on the same network.
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4000);
await app.listen({ host, port });
