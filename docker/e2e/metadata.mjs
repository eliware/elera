import { runCli } from './cli.mjs';

const tokenFrom = result => result.data?.token ?? result.data?.data?.token ?? result.token;
async function createToken(environment, name, identity) {
  const result = await runCli(['token-create', name, 'sample-app', identity, 'routing:read'], environment);
  const token = tokenFrom(result);
  if (!token) throw new Error(`token-create returned no token for ${identity}`);
  return { ...environment, ELERA_API_TOKEN: token, ELERA_IDENTITY: identity, ELERA_APPLICATION: 'sample-app' };
}
export async function provisionMetadata(environment) {
  await runCli(['metadata-init', '--confirm'], environment);
  await runCli(['database-create', 'sample-app', 'sample_app'], environment);
  await runCli(['database-create', 'sample-app', 'restore_verify_sample_app'], environment);
  await runCli(['identity-create', 'sample-app', 'sample_app', 'backup-dev', 'runtime', 'SELECT,SHOW VIEW,TRIGGER,EVENT,LOCK TABLES'], environment);
  await runCli(['identity-create', 'sample-app', 'restore_verify_sample_app', 'restore-verifier', 'admin', 'SELECT,INSERT,UPDATE,DELETE,DROP,EXECUTE,CREATE,ALTER,INDEX,REFERENCES,SHOW VIEW,TRIGGER,EVENT,LOCK TABLES'], environment);
  await runCli(['identity-create', 'sample-app', 'sample_app', 'sample-runtime', 'runtime', 'SELECT'], environment);
  return { appEnvironment: await createToken(environment, 'sample-app-runtime', 'sample-runtime'), restoreEnvironment: { ...environment, ELERA_API_TOKEN: environment.ROOT_TOKEN ?? environment.ELERA_API_TOKEN, ELERA_IDENTITY: 'restore-verifier', ELERA_APPLICATION: 'sample-app' } };
}
