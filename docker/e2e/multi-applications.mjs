export async function provisionSimulatedApplications({ runCli, environment, applications = ['app-a', 'app-b', 'app-c'] } = {}) {
  if (typeof runCli !== 'function') throw new TypeError('CLI runner is required');
  const results = [];
  for (const application of applications) {
    const database = `${application.replace(/[^a-z0-9_]/gi, '_')}_db`;
    const identity = `${application}-runtime`;
    await runCli(['database-create', application, database], environment);
    await runCli(['identity-create', application, database, identity, 'runtime', 'SELECT,INSERT'], environment);
    const tokenResult = await runCli(['token-create', `${application}-token`, application, identity, 'routing:read'], environment);
    const token = tokenResult.data?.token ?? tokenResult.token;
    if (!token) throw new Error(`token-create returned no token for ${application}`);
    results.push({ application, database, identity, environment: { ...environment, ELERA_API_TOKEN: token, ELERA_APPLICATION: application, ELERA_IDENTITY: identity } });
  }
  return results;
}

export function assertIndependentWriters(bundles, applications) {
  const writers = new Map(bundles.map((bundle) => [bundle.application ?? bundle.database, bundle.writer?.host]));
  for (const application of applications) if (!writers.get(application)) throw new Error(`missing writer assignment for ${application}`);
  const distinct = new Set(applications.map((application) => writers.get(application)));
  if (distinct.size !== applications.length) throw new Error('writer assignments are not independently distributed');
  return Object.fromEntries(writers);
}

export function assertWriterReassignment(before, after, drainedNode) {
  for (const application of Object.keys(before)) {
    const next = after[application];
    if (!next || next === drainedNode) throw new Error(`writer for ${application} was not reassigned`);
  }
  return true;
}

export async function exerciseApplications({ applications, start, durationMs = 5000 } = {}) {
  if (!Array.isArray(applications) || applications.length === 0) throw new TypeError('applications are required');
  if (typeof start !== 'function') throw new TypeError('application starter is required');
  const clients = await Promise.all(applications.map((application) => start(application)));
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  await Promise.all(clients.map((client) => client?.stop?.()));
  return { applications: applications.map((application) => application.application ?? application), stopped: clients.length };
}
