import { spawn } from "node:child_process";

export const runCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code ?? signal}: ${stderr.trim()}`)));
});
export const startPrivateMariaDb = ({ dataDir, socket }) => spawn("mariadbd", [`--datadir=${dataDir}`, "--user=mysql", "--skip-networking", `--socket=${socket}`], { stdio: ["ignore", "ignore", "pipe"] });
export const executeSql = ({ socket, sql }) => new Promise((resolve, reject) => {
  const client = spawn("mariadb", [`--socket=${socket}`, "-uroot"], { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  client.stderr.on("data", (chunk) => { stderr += chunk; });
  client.on("error", reject);
  client.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`mariadb initialization failed: ${stderr.trim()}`)));
  client.stdin.end(sql);
});
