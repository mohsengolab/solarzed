// Run locally: node backend/import-dande-faraz.cjs F:/Software/dande [confirmed-https-soap-endpoint]
// Reads only the SMS integration record. Never prints credentials or sends SMS.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
let stage = 'source configuration';

(async () => {
  const source = path.resolve(process.argv[2] || 'F:/Software/dande');
  const dotenv = require(path.join(source, 'node_modules/dotenv'));
  const sql = require(path.join(source, 'node_modules/mssql'));
  const env = dotenv.parse(await fs.readFile(path.join(source, 'apps/api/.env')));
  if (!env.DATABASE_PASSWORD) throw new Error('DATABASE_PASSWORD is not configured in the source project.');
  stage = 'source database connection';
  const pool = await new sql.ConnectionPool({ server: env.DATABASE_HOST || 'localhost',
    port: Number(env.DATABASE_PORT || 1433), user: env.DATABASE_USER || 'sa', password: env.DATABASE_PASSWORD,
    database: env.DATABASE_NAME || 'dandeh', options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 10000, requestTimeout: 10000 }).connect();
  let settings;
  try {
    stage = 'saved SMS integration';
    const rows = await pool.request().input('section', sql.NVarChar, 'sms')
      .query('SELECT payload, secret FROM platform_integrations WHERE section = @section');
    if (!rows.recordset.length) throw new Error('The source has no saved SMS integration.');
    const row = rows.recordset[0]; settings = JSON.parse(row.payload);
    if (settings.provider !== 'FARAZ_PATTERN' || settings.enabled === false) throw new Error('The source Faraz integration is not enabled.');
    stage = 'source encryption configuration';
    if (!/^[a-f0-9]{64}$/i.test(env.SETTINGS_ENCRYPTION_KEY || '')) throw new Error('The source encryption key is unavailable.');
    const [iv, tag, cipher] = String(row.secret || '').split('.');
    const decrypt = crypto.createDecipheriv('aes-256-gcm', Buffer.from(env.SETTINGS_ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
    decrypt.setAuthTag(Buffer.from(tag, 'hex'));
    settings.token = Buffer.concat([decrypt.update(Buffer.from(cipher, 'hex')), decrypt.final()]).toString('utf8');
  } finally { await pool.close(); }
  if (process.argv.includes('--probe-rest')) {
    stage = 'read-only Faraz HTTPS authentication check';
    const response = await fetch('https://api.iranpayamak.com/ws/v1/account/balance', {
      headers: { 'Api-Key': settings.token, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12000)
    });
    const body = await response.json().catch(() => ({}));
    const authorized = response.ok && body.status === 'success';
    console.log('Official Faraz HTTPS authentication:', JSON.stringify({ httpStatus: response.status, authorized }));
    if (authorized) {
      const pattern = await fetch('https://api.iranpayamak.com/ws/v1/patterns/' + encodeURIComponent(settings.otpTemplate), {
        headers: { 'Api-Key': settings.token, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12000)
      });
      console.log('Existing OTP pattern recognized:', pattern.ok);
    }
    console.log('Read-only check finished. No message was sent and no account balance or credentials were displayed.');
    return;
  }
  stage = 'Faraz endpoint, sender and OTP pattern validation';
  const endpoint = new URL(process.argv[3] || settings.endpoint || 'https://invalid.local');
  console.log('Source SMS endpoint host:', endpoint.hostname, 'protocol:', endpoint.protocol);
  if (endpoint.protocol === 'http:' && /(^|\.)(ippanel\.com|farazsms\.com)$/i.test(endpoint.hostname)) endpoint.protocol = 'https:';
  if (endpoint.protocol === 'http:') {
    // Probe the same host over TLS without credentials; never disable certificate validation.
    const secure = new URL(endpoint); secure.protocol = 'https:';
    try {
      const probe = new URL(secure); probe.searchParams.set('wsdl', '');
      const response = await fetch(probe, { signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (response.ok && (await response.text()).includes('SendSMSByPattern')) endpoint.protocol = 'https:';
    } catch { /* Keep import disabled when the source has no verified TLS SOAP endpoint. */ }
  }
  settings.endpoint = endpoint.toString();
  console.log('Faraz field availability:', JSON.stringify({ token: !!settings.token, sender: !!settings.sender, otpPattern: !!settings.otpTemplate, https: endpoint.protocol === 'https:' }));
  if (!settings.token || !settings.sender || !settings.otpTemplate || !/^https:\/\//i.test(settings.endpoint || ''))
    throw new Error('The source Faraz endpoint, sender, OTP pattern or token is incomplete.');
  const destination = path.join(__dirname, 'Solarzed.Api/.local-sms.json');
  const existing = await fs.readFile(destination, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return {}; throw error; });
  existing.Faraz = { Endpoint: settings.endpoint, Sender: settings.sender, OtpPattern: settings.otpTemplate, Token: settings.token };
  await fs.writeFile(destination, JSON.stringify(existing, null, 2), { mode: 0o600 });
  console.log('Faraz configuration imported to the ignored local server settings. Credentials were not displayed. No SMS was sent.');
})().catch(error => { console.error(`Faraz import stopped at: ${stage}. No credentials were displayed.`); if (['ETIMEOUT', 'ELOGIN', 'ECONNREFUSED', 'ENOENT'].includes(error.code)) console.error(`Diagnostic: ${error.code}`); process.exitCode = 1; });
