import { describe, expect, test } from '@jest/globals';
import fixture from '../../contracts/supervisor-intent.fixture.json' with { type: 'json' };
import { defaultIntent, intentHash, loadIntent, planIntent, validateIntent } from '../../src/intent/model.mjs';

describe('supervisor intent model', () => {
  test('validates and hashes a versioned intent', () => { expect(validateIntent(fixture).kind).toBe('SupervisorIntent'); expect(intentHash(fixture)).toHaveLength(64); });
  test('plans no-op and reload changes', () => { expect(planIntent(fixture, fixture).change).toBe('no-op'); const changed = structuredClone(fixture); changed.routing.healthIntervalMs = 2000; expect(planIntent(changed, fixture).change).toBe('reload'); });
  test('rejects malformed intent', () => { expect(() => validateIntent({})).toThrow('invalid supervisor intent'); });
  test('loads defaults and rejects malformed JSON or intent', () => { expect(defaultIntent({}).cluster.name).toBe('local-elera'); expect(loadIntent({}).mariadb.port).toBe(3306); expect(() => loadIntent({ SUPERVISOR_INTENT_JSON: '{' })).toThrow('invalid SUPERVISOR_INTENT_JSON'); expect(() => loadIntent({ SUPERVISOR_INTENT_JSON: '{}' })).toThrow('invalid supervisor intent'); });
  test('plans restart-required changes', () => { const changed = structuredClone(fixture); changed.mariadb.port = 3307; expect(planIntent(changed, fixture).change).toBe('restart'); });
  test('plans membership changes as unsafe', () => { const changed = structuredClone(fixture); changed.cluster.members.push({ name: 'two', address: 'two' }); expect(planIntent(changed, fixture).change).toBe('unsafe'); });
  test('requires every core intent field to be valid', () => {
    const cases = [
      ['apiVersion', (value) => { value.apiVersion = 'wrong'; }],
      ['kind', (value) => { value.kind = 'Wrong'; }],
      ['cluster', (value) => { value.cluster = { name: '', members: [] }; }],
      ['port', (value) => { value.mariadb.port = 0; }],
      ['health interval', (value) => { value.routing.healthIntervalMs = 99; }],
      ['query timeout', (value) => { value.drain.queryTimeoutMs = 0; }],
    ];
    for (const [, mutate] of cases) { const value = structuredClone(fixture); mutate(value); expect(() => validateIntent(value)).toThrow('invalid supervisor intent'); }
  });

  test('plans initial activation and rejects a changed cluster identity', () => {
    expect(planIntent(fixture, null)).toMatchObject({ change: 'restart', changed: true, activeHash: null });
    const changed = structuredClone(fixture); changed.cluster.name = 'other';
    expect(planIntent(changed, fixture)).toMatchObject({ change: 'unsafe', reason: expect.stringContaining('cluster identity') });
  });

  test('loads a valid serialized intent and applies configured timeout values', () => {
    const value = structuredClone(fixture);
    expect(loadIntent({ SUPERVISOR_INTENT_JSON: JSON.stringify(value) })).toEqual(value);
    const loaded = defaultIntent({ MARIADB_DATA_DIR: '/data', ELERA_QUERY_TIMEOUT_MS: '12', ELERA_DRAIN_TIMEOUT_MS: '34', ELERA_SHUTDOWN_TIMEOUT_MS: '56' });
    expect(loaded.mariadb.dataDir).toBe('/data');
    expect(loaded.drain).toMatchObject({ queryTimeoutMs: 12, drainTimeoutMs: 34, shutdownTimeoutMs: 56 });
    expect(defaultIntent()).toHaveProperty('cluster');
    expect(loadIntent()).toHaveProperty('mariadb');
  });
});
