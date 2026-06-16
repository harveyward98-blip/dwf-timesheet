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

let cachedSession = null;
let cachedLossId = null;

async function getSession() {
  const authResult = await odooRequest('/web/session/authenticate', {
    jsonrpc: '2.0', method: 'call', id: 1,
    params: { db: ODOO_DB, login: ODOO_USER, password: ODOO_PASS }
  });
  const authData = JSON.parse(authResult.data);
  if (!authData.result?.uid) throw new Error('Auth failed');
  const setCookie = authResult.headers['set-cookie'];
  const sessionCookie = setCookie ? setCookie.map(c => c.split(';')[0]).join('; ') : '';
  return sessionCookie;
}

async function callKw(cookie, model, method, args, kwargs={}) {
  const result = await odooRequest('/web/dataset/call_kw', {
    jsonrpc: '2.0', method: 'call', id: 1,
    params: { model, method, args, kwargs }
  }, cookie);
  const data = JSON.parse(result.data);
  if (data.error) throw new Error(data.error.data?.message || JSON.stringify(data.error));
  return data.result;
}

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

    // Authenticate
    const cookie = await getSession();

    // If this is a productivity create call, inject the loss_id
    const params = requestBody.params || {};
    if (
      odooPath === '/web/dataset/call_kw' &&
      params.model === 'mrp.workcenter.productivity' &&
      params.method === 'create'
    ) {
      // Find the productive loss reason
      const lossReasons = await callKw(cookie, 'mrp.workcenter.losstypes', 'search_read',
        [[['loss_type', '=', 'productive']]], { fields: ['id', 'name'], limit: 1 });

      if (lossReasons && lossReasons.length > 0) {
        const lossId = lossReasons[0].id;
        // Inject loss_id into the record
        if (Array.isArray(params.args) && Array.isArray(params.args[0])) {
          params.args[0] = params.args[0].map(record => ({ ...record, loss_id: lossId }));
        }
        requestBody.params = params;
      }
    }

    // Make the actual request
    const result = await odooRequest(odooPath, requestBody, cookie);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: result.data
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: e.message })
    };
  }
};

