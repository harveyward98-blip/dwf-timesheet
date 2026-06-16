const https = require('https');

const ODOO_HOST = 'donkeywell-forge.odoo.com';
const ODOO_DB = 'donkeywell-forge';
const ODOO_USER = 'harveyward99@outlook.com';
const ODOO_PASS = 'APItest1664';

function odooRequest(path, body, cookie) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    };
    if (cookie) headers['Cookie'] = cookie;

    const req = https.request({
      hostname: ODOO_HOST,
      port: 443,
      path,
      method: 'POST',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ data, headers: res.headers }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function getSession() {
  const authResult = await odooRequest('/web/session/authenticate', {
    jsonrpc: '2.0', method: 'call', id: 1,
    params: { db: ODOO_DB, login: ODOO_USER, password: ODOO_PASS }
  });
  const authData = JSON.parse(authResult.data);
  if (!authData.result?.uid) throw new Error('Auth failed');
  const setCookie = authResult.headers['set-cookie'];
  return setCookie ? setCookie.map(c => c.split(';')[0]).join('; ') : '';
}


const PRODUCTIVE_LOSS_ID = 7; // Fully Productive Time in Donkeywell Forge Odoo

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    const requestBody = JSON.parse(event.body || '{}');
    const odooPath = event.path.replace('/api', '');
    const cookie = await getSession();
    const params = requestBody.params || {};

    // Inject loss_id for productivity records
    if (
      odooPath === '/web/dataset/call_kw' &&
      params.model === 'mrp.workcenter.productivity' &&
      params.method === 'create'
    ) {
      if (Array.isArray(params.args) && Array.isArray(params.args[0])) {
        params.args[0] = params.args[0].map(record => ({ ...record, loss_id: PRODUCTIVE_LOSS_ID }));
        requestBody.params = params;
      }
    }

    const result = await odooRequest(odooPath, requestBody, cookie);
    return { statusCode: 200, headers: corsHeaders, body: result.data };

  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: e.message })
    };
  }
};

