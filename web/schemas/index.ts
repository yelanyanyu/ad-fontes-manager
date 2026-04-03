const common = require('./common.ts');
const wordRequestSchemas = require('./requests/words.ts');
const syncRequestSchemas = require('./requests/sync.ts');
const authRequestSchemas = require('./requests/auth.ts');
const ankiRequestSchemas = require('./requests/anki.ts');
const configSchemas = require('./config.ts');
const wordSchemas = require('./word.ts');

module.exports = {
  ...common,
  ...wordRequestSchemas,
  ...syncRequestSchemas,
  ...authRequestSchemas,
  ...ankiRequestSchemas,
  ...configSchemas,
  ...wordSchemas,
};
