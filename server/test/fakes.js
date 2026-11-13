/**
 * Stand-ins for Paystack and Hubtel, listening on local ports.
 *
 * Each keeps what the app sent it, so a test can say exactly what was asked
 * for: which payments were started, which references were checked with
 * Paystack, and who was texted. Point TEST_ENV.PAYSTACK_BASE_URL and
 * TEST_ENV.HUBTEL_SMS_BASE_URL at them before loadApp(): both services fix
 * their URL the first time they are required.
 */
const http   = require('http');
const crypto = require('crypto');
const { TEST_ENV } = require('./helpers');

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => handler(req, res, raw));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const closer = (server) => () => {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(resolve));
};

/**
 * A fake Paystack. `transactions` maps a reference to the `data` Paystack's
 * verify would answer with; a reference not in it gets Paystack's 400
 * "Transaction reference not found". `down` makes verify answer 500;
 * `failWith` makes it answer that status instead (429 rate limiting, say).
 */
async function startFakePaystack() {
  const paystack = {
    /** The body of every POST /transaction/initialize. */
    initialized:  [],
    /** The reference of every GET /transaction/verify/:ref, decoded. */
    verified:     [],
    transactions: new Map(),
    down:         false,
    failWith:     null,
    url:          null,
    close:        null,
    reset() {
      this.initialized = [];
      this.verified = [];
      this.transactions = new Map();
      this.down = false;
      this.failWith = null;
    },
  };

  const server = await listen((req, res, raw) => {
    if (req.method === 'POST' && req.url === '/transaction/initialize') {
      const body = JSON.parse(raw);
      paystack.initialized.push(body);
      return reply(res, 200, {
        status:  true,
        message: 'Authorization URL created',
        data:    { authorization_url: `https://checkout.paystack.test/${body.reference}`, access_code: 'test', reference: body.reference },
      });
    }
    const verify = /^\/transaction\/verify\/(.*)$/.exec(req.url);
    if (req.method === 'GET' && verify) {
      const reference = decodeURIComponent(verify[1]);
      paystack.verified.push(reference);
      if (paystack.down) return reply(res, 500, { status: false, message: 'Something went wrong' });
      if (paystack.failWith) return reply(res, paystack.failWith, { status: false, message: 'Too many requests' });
      const data = paystack.transactions.get(reference);
      if (!data) return reply(res, 400, { status: false, message: 'Transaction reference not found' });
      return reply(res, 200, { status: true, message: 'Verification successful', data });
    }
    reply(res, 404, { status: false, message: 'Not found' });
  });

  paystack.url   = `http://127.0.0.1:${server.address().port}`;
  paystack.close = closer(server);
  return paystack;
}

/** A fake Hubtel that accepts every message, or fails them all with `down`. */
async function startFakeHubtel() {
  const hubtel = {
    /** Every message: { From, To, Content, RegisteredDelivery }. */
    requests: [],
    down:     false,
    url:      null,
    close:    null,
    reset() {
      this.requests = [];
      this.down = false;
    },
  };

  const server = await listen((req, res, raw) => {
    hubtel.requests.push(JSON.parse(raw));
    if (hubtel.down) return reply(res, 500, { message: 'Service unavailable' });
    reply(res, 201, { status: 0 });
  });

  hubtel.url   = `http://127.0.0.1:${server.address().port}/v1/messages`;
  hubtel.close = closer(server);
  return hubtel;
}

/** The x-paystack-signature Paystack would send with `body` (the exact string). */
const sign = (body) => crypto.createHmac('sha512', TEST_ENV.PAYSTACK_SECRET_KEY).update(body).digest('hex');

module.exports = { startFakePaystack, startFakeHubtel, sign };
