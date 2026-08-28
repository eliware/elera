export async function resetLab({ exec, compose = 'compose.yaml', profile = 'lab' } = {}) {
  if (typeof exec !== 'function') throw new TypeError('lab executor is required');
  await exec('docker', ['compose', '-f', compose, '--profile', profile, 'down', '--volumes', '--remove-orphans']);
  return { reset: true, volumesRemoved: true, profile };
}

export async function startFreshLab({ exec, compose = 'compose.yaml', profile = 'lab' } = {}) {
  const reset = await resetLab({ exec, compose, profile });
  await exec('docker', ['compose', '-f', compose, '--profile', profile, 'up', '--detach', '--build']);
  return { ...reset, started: true };
}
