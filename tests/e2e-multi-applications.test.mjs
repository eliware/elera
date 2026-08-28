import { assertIndependentWriters, assertWriterReassignment, exerciseApplications, provisionSimulatedApplications } from '../docker/e2e/multi-applications.mjs';

test('provisions three simulated applications with separate credentials and databases', async () => {
  const calls = [];
  const apps = await provisionSimulatedApplications({ environment: { ELERA_API_TOKEN: 'root' }, runCli: async (args) => { calls.push(args); return args[0] === 'token-create' ? { data: { token: `${args[1]}-secret` } } : { ok: true }; } });
  expect(apps.map(({ application, database, identity }) => ({ application, database, identity }))).toEqual([
    { application: 'app-a', database: 'app_a_db', identity: 'app-a-runtime' },
    { application: 'app-b', database: 'app_b_db', identity: 'app-b-runtime' },
    { application: 'app-c', database: 'app_c_db', identity: 'app-c-runtime' },
  ]);
  expect(calls).toHaveLength(9);
  expect(new Set(apps.map((app) => app.environment.ELERA_API_TOKEN)).size).toBe(3);
});

test('requires a token for each simulated application', async () => {
  await expect(provisionSimulatedApplications({ runCli: async () => ({ ok: true }) })).rejects.toThrow('no token');
});

test('asserts independently distributed writer assignments', () => {
  expect(assertIndependentWriters([{ application: 'app-a', writer: { host: 'elera-0' } }, { application: 'app-b', writer: { host: 'elera-1' } }, { application: 'app-c', writer: { host: 'elera-2' } }], ['app-a', 'app-b', 'app-c'])).toEqual({ 'app-a': 'elera-0', 'app-b': 'elera-1', 'app-c': 'elera-2' });
  expect(() => assertIndependentWriters([{ application: 'app-a', writer: { host: 'elera-0' } }, { application: 'app-b', writer: { host: 'elera-0' } }], ['app-a', 'app-b'])).toThrow('not independently');
});

test('exercises all simulated applications concurrently and stops them', async () => {
  const stopped = [];
  await expect(exerciseApplications({ applications: [{ application: 'app-a' }, { application: 'app-b' }, { application: 'app-c' }], durationMs: 0, start: async (application) => ({ stop: async () => stopped.push(application.application) }) })).resolves.toMatchObject({ stopped: 3 });
  expect(stopped).toHaveLength(3);
});
test('requires every application writer to leave a drained node', () => {
  expect(assertWriterReassignment({ a: 'elera-0', b: 'elera-1' }, { a: 'elera-2', b: 'elera-0' }, 'elera-1')).toBe(true);
  expect(() => assertWriterReassignment({ a: 'elera-0' }, { a: 'elera-0' }, 'elera-0')).toThrow('not reassigned');
  expect(() => assertWriterReassignment({ a: 'elera-0' }, {}, 'elera-0')).toThrow('not reassigned');
});
