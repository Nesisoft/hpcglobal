/**
 * A stand-in for Resend on a local port. It keeps every email the app sent,
 * so a test can read the reset code out of it the way a worker would, and it
 * can be told to fail (`down`) to test what happens when email is out.
 */
const http = require('http');

async function startFakeResend() {
  const resend = {
    sent: [],
    down: false,
    url:  null,
    close: null,
    reset() { this.sent = []; this.down = false; },
    /** The last 6-digit code emailed to `to`. */
    codeFor(to) {
      const mail = [...this.sent].reverse().find((m) => m.to.includes(to));
      return mail && /\b(\d{6})\b/.exec(mail.text)?.[1];
    },
  };

  const server = await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        if (resend.down) {
          res.writeHead(500, { 'content-type': 'application/json' });
          return res.end(JSON.stringify({ name: 'internal_server_error', message: 'Resend is having a moment' }));
        }
        resend.sent.push({ ...JSON.parse(raw), authorization: req.headers.authorization });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: `email_${resend.sent.length}` }));
      });
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });

  resend.url = `http://127.0.0.1:${server.address().port}`;
  resend.close = () => { server.closeAllConnections(); return new Promise((r) => server.close(r)); };
  return resend;
}

module.exports = { startFakeResend };
