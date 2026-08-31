export async function loadStartupIntent({ intentState, loadEnvironmentIntent, node } = {}) {
  return (await intentState.read()) ?? loadEnvironmentIntent({ RUNTIME_NODE_NAME: node.name, RUNTIME_NODE_ADDRESS: node.address });
}
