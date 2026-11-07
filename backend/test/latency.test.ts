import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEST_DB_URL } from './guard';

const RTT_MS = 100;

/** Proxy TCP tới Postgres cục bộ, thêm trễ một chiều RTT/2 mỗi hướng (mô phỏng DB ở xa). */
function startDelayProxy(): Promise<{ port: number; close: () => void }> {
  const target = new URL(TEST_DB_URL);
  const conns = new Set<net.Socket>();
  const server = net.createServer((client) => {
    const upstream = net.connect(Number(target.port), target.hostname);
    conns.add(client);
    conns.add(upstream);
    const pipe = (from: net.Socket, to: net.Socket) =>
      from.on('data', (b) =>
        setTimeout(() => {
          if (!to.destroyed) to.write(b);
        }, RTT_MS / 2),
      );
    pipe(client, upstream);
    pipe(upstream, client);
    const end = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('close', end).on('error', end);
    upstream.on('close', end).on('error', end);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        port: (server.address() as net.AddressInfo).port,
        close: () => {
          conns.forEach((c) => c.destroy());
          server.close();
        },
      }),
    ),
  );
}

describe('timing under DB latency', () => {
  it('AC-AUTH-07 / M1: POST /auth/codes không lộ email có tài khoản qua thời gian, ngay cả khi DB trễ 100 ms RTT', async () => {
    const proxy = await startDelayProxy();
    try {
      const root = path.resolve(__dirname, '..');
      // Bất đồng bộ: proxy chạy trong tiến trình này nên không được chặn event loop.
      const res = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
        const child = spawn(
          process.execPath,
          [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join(root, 'test', 'latency-child.ts')],
          {
            cwd: root,
            env: {
              PATH: process.env.PATH,
              SystemRoot: process.env.SystemRoot,
              LAT_PROXY_URL: `postgresql://postgres@127.0.0.1:${proxy.port}/n2f_test`,
              LAT_RUNS: '6',
            },
          },
        );
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d));
        child.stderr.on('data', (d) => (stderr += d));
        const timer = setTimeout(() => child.kill(), 170000);
        child.on('close', (status) => {
          clearTimeout(timer);
          resolve({ status, stdout, stderr });
        });
      });
      expect(res.status, res.stderr).toBe(0);
      const line = res.stdout.split('\n').find((l) => l.startsWith('RESULT '))!;
      const result = JSON.parse(line.slice(7)) as Record<string, { existing: number; missing: number }>;
      expect(Object.keys(result).sort()).toEqual(['login', 'register', 'reset-password']);
      for (const [purpose, m] of Object.entries(result)) {
        expect(m.existing, purpose).toBeGreaterThan(100); // chắc chắn trễ DB có tác dụng
        expect(Math.abs(m.existing - m.missing), `${purpose} ${JSON.stringify(m)}`).toBeLessThanOrEqual(300);
      }
    } finally {
      proxy.close();
    }
  }, 180000);
});
