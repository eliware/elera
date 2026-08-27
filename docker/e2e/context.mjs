import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export const exec = promisify(execFile);
export const environment = { ...process.env };
export const rootToken = environment.ROOT_TOKEN ?? environment.ELERA_API_TOKEN;
export const cli = '/workspace/elera-cli/src/elera-cli.mjs';
