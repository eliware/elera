const validJoinAddress = (value) => typeof value === 'string' && /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])+(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])+)*)((?::\d{1,5})?)$/.test(value);

export function startupArguments(args, decision, { joinAddress } = {}) {
  if (!Array.isArray(args) || !decision) throw new TypeError('startup arguments require args and recovery decision');
  const joinOnly = args.filter((argument) => argument !== '--wsrep-new-cluster');
  if (decision.mode === 'bootstrap' && decision.localWinner === true) return [...joinOnly, '--wsrep-new-cluster'];
  if (decision.mode === 'join' && validJoinAddress(joinAddress)) return joinOnly.map((argument) => argument.startsWith('--wsrep-cluster-address=') ? `--wsrep-cluster-address=gcomm://${joinAddress}` : argument);
  return joinOnly;
}
