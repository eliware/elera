import { startupArguments } from '../cluster/cold-bootstrap/startup-arguments.mjs';

export async function startAuthorizedRecoveryProcess({ bootstrap, identity, args, mariaProcess, recoveryState, onRecoveryBootstrap = async () => {}, startupArgs = startupArguments } = {}) {
  if (bootstrap?.winner?.node && bootstrap.winner.node !== identity.name) { await onRecoveryBootstrap(bootstrap); return false; }
  if (!Array.isArray(args)) throw new Error('recovery bootstrap arguments are unavailable');
  if (mariaProcess?.child && mariaProcess.child.exitCode === null) throw Object.assign(new Error('recovery bootstrap refused while mariadbd is already running'), { code: 'RECOVERY_PROCESS_ALREADY_RUNNING', statusCode: 409 });
  const recoveryArgs = startupArgs(args, { mode: 'bootstrap', localWinner: true });
  recoveryState.set('bootstrapping', { reason: 'authorized recovery bootstrap', epoch: bootstrap?.epoch });
  await mariaProcess.start(recoveryArgs);
  return true;
}
