export async function verifyRoutingFallback({ stream, rest, expectedVersion } = {}) {
  const events = [];
  await stream.connect({ onUpdate: (event) => events.push(event) });
  await stream.disconnect?.();
  const bundle = await rest.bundle();
  if (expectedVersion && bundle.bundleVersion !== expectedVersion) throw new Error('REST fallback returned a stale routing bundle');
  return { websocketUpdates: events.length, fallback: true, bundleVersion: bundle.bundleVersion };
}

export async function verifyNodeLoss({ client, lab, node, probes = [] } = {}) {
  await lab.stop(node);
  await lab.assertExcluded(node);
  const result = await client.snapshot();
  if (result.probes?.some((probe) => probe.selectedNode === node)) throw new Error(`client continued selecting failed node ${node}`);
  return { node, probes: result.probes ?? probes, excluded: true };
}

export async function verifyTwoNodeLoss({ client, lab, nodes = ['elera-0', 'elera-1'], probes = [] } = {}) {
  for (const node of nodes) {
    await lab.stop(node);
    await lab.assertExcluded(node);
  }
  const result = await client.snapshot();
  if (result.probes?.some((probe) => nodes.includes(probe.selectedNode))) throw new Error('client continued selecting a failed node');
  return { nodes, probes: result.probes ?? probes, excluded: true };
}

export async function verifyServiceRestart({ client, lab, service } = {}) {
  await lab.restart(service);
  await lab.assertReady(service);
  const bundle = await client.bundle();
  if (!bundle?.bundleVersion) throw new Error(`${service} restart did not restore routing state`);
  return { service, recovered: true, bundleVersion: bundle.bundleVersion };
}
