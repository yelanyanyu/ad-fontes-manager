const http = require('http');

function testEndpoint(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 8080,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
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

async function runTests() {
  console.log('Testing API endpoints...\n');

  try {
    // Test status
    const status = await testEndpoint('/api/status');
    console.log('✅ /api/status:', status.status, status.data);

    // Test local records
    const local = await testEndpoint('/api/local');
    console.log(
      '✅ /api/local:',
      local.status,
      Array.isArray(local.data) ? `Array(${local.data.length})` : local.data
    );

    // Test words list
    const words = await testEndpoint('/api/words');
    console.log(
      '✅ /api/words:',
      words.status,
      Array.isArray(words.data) ? `Array(${words.data.length})` : words.data
    );

    console.log('\n✅ All API tests passed!');
    process.exit(0);
  } catch (e) {
    console.error('\n❌ API test failed:', e.message);
    process.exit(1);
  }
}

runTests();
