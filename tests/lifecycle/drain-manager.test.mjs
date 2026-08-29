import { expect, test, jest } from '@jest/globals';
import { createDrainManager } from '../../src/lifecycle/drain-manager.mjs';

test('rejects new work while allowing tracked work to finish', async () => {
  const changed = jest.fn(); const drain = createDrainManager({ onChange: changed }); const leave = drain.enter();
  drain.begin(); expect(drain.isDraining()).toBe(true); expect(() => drain.enter()).toThrow('draining'); leave(); expect(await drain.wait(10)).toBe(true); expect(drain.active()).toBe(0); drain.end(); expect(changed).toHaveBeenCalledTimes(2);
});
test('drain transitions are idempotent and wait times out while work remains', async () => {
  const drain = createDrainManager(); const leave = drain.enter();
  drain.begin(); drain.begin(); expect(await drain.wait(1)).toBe(false); expect(drain.active()).toBe(1); drain.end(); drain.end(); leave();
});
test('supports missing callbacks and idempotent release', () => { const drain = createDrainManager(); const leave = drain.enter(); leave(); leave(); expect(drain.active()).toBe(0); });
