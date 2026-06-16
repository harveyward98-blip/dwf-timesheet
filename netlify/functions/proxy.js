const https = require('https');

const ODOO_HOST = 'donkeywell-forge.odoo.com';
const ODOO_DB = 'donkeywell-forge';
const ODOO_USER = 'harveyward99@outlook.com';
const ODOO_PASS = 'APItest1664';
const PRODUCTIVE_LOSS_ID = 7;

function odooRequest(path, body, cookie) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    };
    if (cookie) headers['Cookie'] = cookie;
    const req = https.request({
      hostname: ODOO_HOST, port: 443, path, method: 'POST', headers
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

    // Deep clone params to avoid mutation issues
    const bodyStr = JSON.stringify(requestBody);
    const bodyClone = JSON.parse(bodyStr);
    const params = bodyClone.params || {};

    // Inject loss_id for ANY productivity create call
    if (params.model === 'mrp.workcenter.productivity' && params.method === 'create') {
      if (Array.isArray(params.args)) {
        // args[0] could be a single object or array of objects
        if (Array.isArray(params.args[0])) {
          params.args[0] = params.args[0].map(r => ({ ...r, loss_id: PRODUCTIVE_LOSS_ID }));
        } else if (typeof params.args[0] === 'object') {
          params.args[0] = { ...params.args[0], loss_id: PRODUCTIVE_LOSS_ID };
        }
        bodyClone.params = params;
      }
    }

    const result = await odooRequest(odooPath, bodyClone, cookie);
    return { statusCode: 200, headers: corsHeaders, body: result.data };

  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: e.message })
    };
  }
};

