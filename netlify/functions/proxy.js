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

async function callKw(cookie, model, method, args, kwargs={}) {
  const result = await odooRequest('/web/dataset/call_kw', {
    jsonrpc: '2.0', method: 'call', id: 1,
    params: { model, method, args, kwargs }
  }, cookie);
  const data = JSON.parse(result.data);
  if (data.error) throw new Error(data.error.data?.message || JSON.stringify(data.error));
  return data.result;
}

async function getProductiveLossId(cookie) {
  // Try different model names used across Odoo versions
  const models = ['mrp.workcenter.losstypes', 'mrp.workcenter.losstype'];
  for (const model of models) {
    try {
      const results = await callKw(cookie, model, 'search_read',
        [[['loss_type', '=', 'productive']]], { fields: ['id', 'name'], limit: 1 });
      if (results && results.length > 0) return results[0].id;
    } catch(e) {}
  }
  // Last resort: get any loss reason
  for (const model of models) {
    try {
      const results = await callKw(cookie, model, 'search_read',
        [[]], { fields: ['id', 'name', 'loss_type'], limit: 10 });
      if (results && results.length > 0) {
        const productive = results.find(r => r.loss_type === 'productive');
        return productive ? productive.id : results[0].id;
      }
    } catch(e) {}
  }
  return null;
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
    const cookie = await getSession();
    const params = requestBody.params || {};

    // Inject loss_id for productivity records
    if (
      odooPath === '/web/dataset/call_kw' &&
      params.model === 'mrp.workcenter.productivity' &&
      params.method === 'create'
    ) {
      const lossId = await getProductiveLossId(cookie);
      if (lossId && Array.isArray(params.args) && Array.isArray(params.args[0])) {
        params.args[0] = params.args[0].map(record => ({ ...record, loss_id: lossId }));
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

