import { buildApp } from "./app";
import { db } from "./db";
import { emailProofProblem, env } from "./env";
import { startPublisher } from "./publisher";
import { loggable } from "./redact";

// Anyone can create an election naming this registrar, and it pays to publish each one's list, so
// on a public chain it serves only the elections of the authorities it is told about.
if (env.CHAIN_ID !== 31337 && env.AUTHORITIES.length === 0) {
  console.error("Set AUTHORITIES: on a public chain the registrar serves only their elections.");
  process.exit(1);
}

const app = await buildApp();
await app.listen({ host: env.HOST, port: env.PORT });
// Without a way to prove an address, the registrar still serves everything else; registration
// answers that it is not set up.
const problem = emailProofProblem(env);
if (problem) app.log.warn(`Registration is off: ${problem}`);
startPublisher(app.log);

// Codes older than a day count towards nothing any more, so they are removed rather than kept.
setInterval(() => {
  db.emailCode
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } } })
    .catch((error: unknown) => app.log.warn({ err: loggable(error) }, "Could not clear old codes"));
}, 60 * 60_000).unref();
