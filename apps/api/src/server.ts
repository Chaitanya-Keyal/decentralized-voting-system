import { buildApp } from "./app";
import { emailProofProblem, env } from "./env";
import { startPublisher } from "./publisher";

const problem = emailProofProblem(env);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const app = await buildApp();
await app.listen({ host: env.HOST, port: env.PORT });
startPublisher(app.log);
