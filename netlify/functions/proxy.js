const https = require('https');

const ODOO_HOST = 'donkeywell-forge.odoo.com';

exports.handler = async (event) => {
  const path = event.path.replace('/api', '');
  const body = event.body;

  return new Promise((resolve) => {
    const options = {
      hostname: ODOO_HOST,
      port: 443,
      path: path,
      method: event.httpMethod,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body || ''),
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          },
          body: data
        });
      });
    });

    req.on('error', (e) => {
      resolve({
        statusCode: 500,
        body: JSON.stringify({ error: e.message })
      });
    });

    if (body) req.write(body);
    req.end();
  });
};
