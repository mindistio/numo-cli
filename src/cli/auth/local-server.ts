import * as crypto from 'crypto';
import * as http from 'http';
import * as net from 'net';
import * as url from 'url';

export type CallbackParams = Record<string, string>;

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo;
      server.close(() => resolve(address.port));
    });
    server.on('error', reject);
  });
}

// Serves an HTML page on / and waits for GET /callback
export function serveHtmlAndWaitForCallback(port: number, html: string, expectedState: string): Promise<CallbackParams> {
  const nonce = crypto.randomBytes(16).toString('base64');
  const finalHtml = html.replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`);

  return new Promise((resolve, reject) => {
    const connections = new Set<net.Socket>();
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url ?? '', true);

      if (parsed.pathname === '/callback') {
        // CSRF: validate state parameter
        if (parsed.query.state !== expectedState) {
          res.writeHead(403, { 'Content-Type': 'text/html', 'Connection': 'close' });
          res.end('<html><body><h2>Invalid state parameter. Authentication rejected.</h2></body></html>');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html', 'Connection': 'close', 'Cache-Control': 'no-store' });
        res.end('<html><body><h2>Authentication complete. You can close this tab.</h2></body></html>');
        clearTimeout(timer);
        server.close();
        for (const conn of connections) conn.destroy();
        resolve(parsed.query as CallbackParams);
        return;
      }

      if (parsed.pathname !== '/') {
        res.writeHead(404, { 'Content-Type': 'text/plain', 'Connection': 'close' });
        res.end('Not Found');
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': `default-src 'self' https://www.gstatic.com; script-src 'nonce-${nonce}' https://www.gstatic.com; style-src 'unsafe-inline'`,
      });
      res.end(finalHtml);
    });

    server.on('connection', (conn) => {
      connections.add(conn);
      conn.on('close', () => connections.delete(conn));
    });

    server.listen(port, '127.0.0.1');
    server.on('error', reject);

    const timer = setTimeout(() => {
      server.close();
      for (const conn of connections) conn.destroy();
      reject(new Error('Timeout waiting for authentication (5 min)'));
    }, 5 * 60 * 1000);
    timer.unref();
  });
}
