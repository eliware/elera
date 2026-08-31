export async function loadStartupIntent({ intentState, loadEnvironmentIntent, node, environment = process.env } = {}) {
  return (await intentState.read()) ?? loadEnvironmentIntent({ ...environment, RUNTIME_NODE_NAME: node.name, RUNTIME_NODE_ADDRESS: node.address });
}
