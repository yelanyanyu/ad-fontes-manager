const http = require('http') as typeof import('http');

type EndpointResult = {
  status?: number;
  data: unknown;
};

function testEndpoint(
  pathname: string,
  method = 'GET',
  data: unknown = null
): Promise<EndpointResult> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 8080,
      path: pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res: import('http').IncomingMessage) => {
      let body = '';
      res.on('data', chunk => {
        body += String(chunk);
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(body) as unknown;
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests(): Promise<void> {
  console.log('Testing API endpoints...\n');

  try {
    const status = await testEndpoint('/api/status');
    console.log('OK /api/status:', status.status, status.data);

    const local = await testEndpoint('/api/local');
    console.log(
      'OK /api/local:',
      local.status,
      Array.isArray(local.data) ? `Array(${local.data.length})` : local.data
    );

    const words = await testEndpoint('/api/words');
    console.log(
      'OK /api/words:',
      words.status,
      Array.isArray(words.data) ? `Array(${words.data.length})` : words.data
    );

    console.log('\nAll API tests passed.');
    process.exit(0);
  } catch (error) {
    const err = error as { message?: string };
    console.error('\nAPI test failed:', err.message);
    process.exit(1);
  }
}

void runTests();
