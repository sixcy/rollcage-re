// Persistent client for the public REA MCP stdio interface. No target execution.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const analysis = path.join(root, 'analysis', process.argv[3] ?? '');
const queue = path.join(analysis, 'requests');
const results = path.join(analysis, 'results');
const cli = process.argv[2];
if (!cli || !path.isAbsolute(cli)) throw new Error('Pass an absolute public REA launcher path.');
await mkdir(queue, { recursive: true });
await mkdir(results, { recursive: true });
const server = spawn(process.execPath, [cli, 'mcp'], {
  env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
});
let nextId = 1;
const pending = new Map();
let diagnostics = '';
server.stderr.on('data', data => { diagnostics += data.toString(); });
server.on('error', error => { for (const item of pending.values()) item.reject(error); });
server.on('exit', code => {
  for (const item of pending.values()) item.reject(new Error(`REA server exited: ${code}`));
  pending.clear();
});
createInterface({ input: server.stdout }).on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { diagnostics += line + '\n'; return; }
  if (message.id !== undefined && pending.has(message.id)) {
    const item = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(JSON.stringify(message.error)));
    else item.resolve(message.result);
  } else if (message.method && message.id !== undefined) {
    // This client offers no sampling, roots, or elicitation capabilities.
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported client method' } }) + '\n');
  }
});
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
try {
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'rollcage-research', version: '1' } });
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const catalog = await rpc('tools/list', {});
  await writeFile(path.join(analysis, 'rea-tools.json'), JSON.stringify(catalog, null, 2));
  const toolNames = new Set(catalog.tools.map(tool => tool.name));
  console.log(`REA session ready: ${toolNames.size} tools. Queue: ${queue}`);
  const completed = new Set();
  let stop = false;
  while (!stop) {
    const names = (await readdir(queue)).filter(name => name.endsWith('.json') && !completed.has(name)).sort();
    for (const name of names) {
      const request = JSON.parse(await readFile(path.join(queue, name), 'utf8'));
      if (request.stop === true) { stop = true; break; }
      if (!toolNames.has(request.tool)) throw new Error(`Unadvertised tool: ${request.tool}`);
      console.log(`Running ${name}: ${request.tool}`);
      const result = await rpc('tools/call', { name: request.tool, arguments: request.arguments ?? {} });
      await writeFile(path.join(results, name), JSON.stringify(result, null, 2));
      completed.add(name);
      console.log(`Saved ${name}${result.isError ? ' (tool error)' : ''}`);
    }
    if (!stop) await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (toolNames.has('close_binary')) {
    const result = await rpc('tools/call', { name: 'close_binary', arguments: {} });
    await writeFile(path.join(analysis, 'rea-close.json'), JSON.stringify(result, null, 2));
  }
} finally {
  await writeFile(path.join(analysis, 'rea-session.stderr.log'), diagnostics);
  server.stdin.end();
  setTimeout(() => { if (server.exitCode === null) server.kill(); }, 3000).unref();
}
