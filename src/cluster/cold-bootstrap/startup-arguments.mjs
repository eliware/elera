export function startupArguments(args, decision) {
  if (!Array.isArray(args) || !decision) throw new TypeError('startup arguments require args and recovery decision');
  const joinOnly = args.filter((argument) => argument !== '--wsrep-new-cluster');
  return decision.mode === 'bootstrap' && decision.localWinner === true
    ? [...joinOnly, '--wsrep-new-cluster']
    : joinOnly;
}
