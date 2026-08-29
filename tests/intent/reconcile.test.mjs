import { describe, expect, test, jest } from '@jest/globals';
import fixture from '../contracts/supervisor-intent.fixture.json' with { type: 'json' };
import { reconcileIntent } from '../src/intent/reconcile.mjs';

describe('intent reconciliation', () => {
  test('applies and reloads a safe change', async () => { const reload = jest.fn(); const desired = structuredClone(fixture); desired.routing.healthIntervalMs = 2000; const result = await reconcileIntent({ desired, active: fixture, apply: async value => value, reload }); expect(result.status).toBe('applied'); expect(reload).toHaveBeenCalled(); });
  test('rejects membership changes as unsafe', async () => { const desired = structuredClone(fixture); desired.cluster.members.push({ name: 'two', address: 'two' }); await expect(reconcileIntent({ desired, active: fixture, apply: async () => {} })).rejects.toMatchObject({ code: 'UNSAFE_INTENT_CHANGE', statusCode: 409 }); });
  test('reports no-op without applying', async () => { const apply = jest.fn(); expect((await reconcileIntent({ desired: fixture, active: fixture, apply })).status).toBe('unchanged'); expect(apply).not.toHaveBeenCalled(); });
  test('restarts when a restart-class change is requested', async () => { const restart = jest.fn(); const desired = structuredClone(fixture); desired.mariadb.port = 3307; const result = await reconcileIntent({ desired, active: fixture, apply: async value => value, restart }); expect(result.status).toBe('applied'); expect(restart).toHaveBeenCalled(); });
  test('requires an apply callback for changes', async () => { const desired = structuredClone(fixture); desired.routing.healthIntervalMs = 2000; await expect(reconcileIntent({ desired, active: fixture })).rejects.toThrow('apply callback'); });
});
