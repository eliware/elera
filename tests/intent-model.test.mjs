import { describe, expect, test } from '@jest/globals';
import fixture from '../contracts/supervisor-intent.fixture.json' with { type: 'json' };
import { defaultIntent, intentHash, loadIntent, planIntent, validateIntent } from '../src/intent/model.mjs';

describe('supervisor intent model', () => {
  test('validates and hashes a versioned intent', () => { expect(validateIntent(fixture).kind).toBe('SupervisorIntent'); expect(intentHash(fixture)).toHaveLength(64); });
  test('plans no-op and reload changes', () => { expect(planIntent(fixture, fixture).change).toBe('no-op'); const changed = structuredClone(fixture); changed.routing.healthIntervalMs = 2000; expect(planIntent(changed, fixture).change).toBe('reload'); });
  test('rejects malformed intent', () => { expect(() => validateIntent({})).toThrow('invalid supervisor intent'); });
  test('loads defaults and rejects malformed JSON or intent', () => { expect(defaultIntent({}).cluster.name).toBe('local-elera'); expect(loadIntent({}).mariadb.port).toBe(3306); expect(() => loadIntent({ SUPERVISOR_INTENT_JSON: '{' })).toThrow('invalid SUPERVISOR_INTENT_JSON'); expect(() => loadIntent({ SUPERVISOR_INTENT_JSON: '{}' })).toThrow('invalid supervisor intent'); });
  test('builds clustered fallback members from bootstrap settings', () => { const intent = defaultIntent({ RUNTIME_NODE_NAME: 'elera-0', RUNTIME_NODE_ADDRESS: '10.0.0.60', ELERA_CLUSTER_MODE: '1', ELERA_CLUSTER_ADDRESS: 'gcomm://10.0.0.60,10.0.0.61', ELERA_CLUSTER_NAME: 'lab' }); expect(intent.cluster.name).toBe('lab'); expect(intent.cluster.members).toHaveLength(2); expect(intent.cluster.members[1].name).toBe('elera-1'); });
  test('plans restart-required changes', () => { const changed = structuredClone(fixture); changed.mariadb.port = 3307; expect(planIntent(changed, fixture).change).toBe('restart'); });
  test('plans membership changes as unsafe', () => { const changed = structuredClone(fixture); changed.cluster.members.push({ name: 'two', address: 'two' }); expect(planIntent(changed, fixture).change).toBe('unsafe'); });
});
