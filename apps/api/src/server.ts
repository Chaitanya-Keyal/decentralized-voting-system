import { buildApp } from "./app";
import { emailProofProblem, env } from "./env";
import { startPublisher } from "./publisher";

const app = await buildApp();
await app.listen({ host: env.HOST, port: env.PORT });
// Without a way to prove an address, the registrar still serves everything else; registration
// answers that it is not set up.
const problem = emailProofProblem(env);
if (problem) app.log.warn(`Registration is off: ${problem}`);
startPublisher(app.log);
