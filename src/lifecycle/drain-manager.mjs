export function createDrainManager({ onChange } = {}) {
  let draining = false; let active = 0;
  const notify = () => onChange?.(draining);
  return {
    isDraining: () => draining,
    begin: () => { if (!draining) { draining = true; notify(); } return draining; },
    end: () => { if (draining) { draining = false; notify(); } return draining; },
    enter: () => { if (draining) throw Object.assign(new Error('supervisor is draining'), { code: 'DRAINING', statusCode: 503 }); active += 1; let done = false; return () => { if (!done) { done = true; active -= 1; } }; },
    active: () => active,
    wait: async (timeoutMs = 30000) => { const started = Date.now(); while (active && Date.now() - started < timeoutMs) await new Promise((resolve) => setTimeout(resolve, 25)); return active === 0; }
  };
}
