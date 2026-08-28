import { exec, cli } from './context.mjs';
export async function runCli(args, environment) {
  if (environment.ELERA_E2E_DEBUG === '1') console.error(`[e2e] cli ${args.join(' ')}`);
  const result = await exec(process.execPath, [cli, ...args, '--json'], { env: environment, timeout: 60000 });
  if (environment.ELERA_E2E_DEBUG === '1') console.error(`[e2e] cli complete ${args[0]}`); return JSON.parse(result.stdout);
}
