const { getPool } = require('./db');

async function testDB() {
  try {
    const pool = await getPool();
    const result = await pool.query('SELECT 1 as test');
    console.log('✅ Database connection successful');
    console.log('Test query result:', result.rows[0]);
    process.exit(0);
  } catch (e) {
    console.error('❌ Database connection failed:', e.message);
    process.exit(1);
  }
}

testDB();
