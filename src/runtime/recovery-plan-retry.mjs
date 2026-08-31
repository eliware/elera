export async function resolveRecoveryPlan({ recoveryProtocol, startupTimeoutMs = 15000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let plan;
  const attempts = Math.max(1, Math.min(15, Math.ceil(startupTimeoutMs / 1000)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    plan = await recoveryProtocol.plan();
    if (plan.mode !== 'blocked' || attempt + 1 >= attempts) break;
    await sleep(1000);
    await recoveryProtocol.retry();
  }
  return plan;
}
