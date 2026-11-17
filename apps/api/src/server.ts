import { buildApp } from "./app";
import { env } from "./env";
import { startPublisher } from "./publisher";

// Anyone can create an election naming this registrar, and it pays to publish each one's list, so
// on a public chain it serves only the elections of the authorities it is told about.
if (env.CHAIN_ID !== 31337 && env.AUTHORITIES.length === 0) {
  console.error("Set AUTHORITIES: on a public chain the registrar serves only their elections.");
  process.exit(1);
}

const app = await buildApp();
await app.listen({ host: env.HOST, port: env.PORT });
// Without Google sign-in the registrar still serves everything else; registration answers that it
// is not set up.
if (!env.GOOGLE_CLIENT_ID) app.log.warn("Registration is off: set GOOGLE_CLIENT_ID");
startPublisher(app.log);
