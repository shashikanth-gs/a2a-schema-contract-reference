import { spawn, execFileSync } from 'node:child_process';
export async function command(args, { cwd = process.cwd(), timeoutMs = 180000, signal } = {}) {
  signal?.throwIfAborted();
  const child = spawn(process.execPath, args, {
    cwd,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  });
  let timeout = false;
  let interrupted = false;
  function kill() {
    if (!child.pid) return;
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          timeout: 5000,
        });
      } catch {
        child.kill('SIGKILL');
      }
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') child.kill('SIGKILL');
      }
    }
  }
  const onInterrupt = () => {
    interrupted = true;
    kill();
  };
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onInterrupt);
  signal?.addEventListener('abort', onInterrupt, { once: true });
  if (signal?.aborted) onInterrupt();
  const timer = setTimeout(() => {
    timeout = true;
    kill();
  }, timeoutMs);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0 && !timeout && !interrupted
          ? resolve()
          : reject(
              new Error(
                timeout
                  ? 'Command deadline exceeded'
                  : interrupted
                    ? 'Command interrupted'
                    : `Command exited ${code}`,
              ),
            ),
      );
    });
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onInterrupt);
    signal?.removeEventListener('abort', onInterrupt);
  }
}
export function npm(args, options) {
  if (!process.env.npm_execpath) throw new Error('Run this command through npm run');
  return command([process.env.npm_execpath, ...args], options);
}
