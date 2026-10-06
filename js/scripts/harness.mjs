import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const liveChildren = new Set();
export async function launchAgent({
  signal,
  readinessMs = 5000,
  script = new URL('../dist/server/main.js', import.meta.url),
} = {}) {
  signal?.throwIfAborted();
  const child = fork(fileURLToPath(script), [], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, REFERENCE_HOST: '127.0.0.1', REFERENCE_PORT: '0' },
  });
  liveChildren.add(child);
  child.once('exit', () => liveChildren.delete(child));
  const exited = new Promise((resolve) => {
    child.once('exit', resolve);
  });
  let closed = false;
  async function close() {
    if (closed) return exited;
    closed = true;
    if (child.exitCode !== null || child.signalCode !== null) return exited;
    child.kill('SIGTERM');
    const kill = setTimeout(() => child.kill('SIGKILL'), 1000);
    try {
      await exited;
    } finally {
      clearTimeout(kill);
    }
  }
  let timer;
  let abort;
  let onMessage;
  let onExit;
  let onError;
  try {
    const ready = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Agent readiness deadline exceeded')), readinessMs);
      abort = () => reject(signal.reason);
      onMessage = (value) => {
        if (value?.type === 'ready' && typeof value.url === 'string') resolve(value);
      };
      onExit = () => reject(new Error('Agent exited before readiness'));
      onError = () => reject(new Error('Agent process failed'));
      child.on('message', onMessage);
      child.once('exit', onExit);
      child.once('error', onError);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
    const health = await fetch(ready.url + '/health', {
      signal: AbortSignal.any([AbortSignal.timeout(readinessMs), ...(signal ? [signal] : [])]),
    });
    if (!health.ok || (await health.json()).ready !== true)
      throw new Error('Agent health check failed');
    return { url: ready.url, close, pid: child.pid };
  } catch (error) {
    await close();
    throw error;
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
    if (onMessage) child.off('message', onMessage);
    if (onExit) child.off('exit', onExit);
    if (onError) child.off('error', onError);
  }
}
export async function withAgent(run, options) {
  const agent = await launchAgent(options);
  try {
    return await run(agent);
  } finally {
    await agent.close();
  }
}
