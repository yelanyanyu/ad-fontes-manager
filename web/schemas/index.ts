const common = require('./common.ts');
const wordRequestSchemas = require('./requests/words.ts');
const syncRequestSchemas = require('./requests/sync.ts');
const authRequestSchemas = require('./requests/auth.ts');

module.exports = {
  ...common,
  ...wordRequestSchemas,
  ...syncRequestSchemas,
  ...authRequestSchemas,
};
