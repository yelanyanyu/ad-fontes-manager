const common = require('./common');
const wordRequestSchemas = require('./requests/words');
const syncRequestSchemas = require('./requests/sync');
const authRequestSchemas = require('./requests/auth');
const ankiRequestSchemas = require('./requests/anki');
const configSchemas = require('./config');
const wordSchemas = require('./word');

module.exports = {
  ...common,
  ...wordRequestSchemas,
  ...syncRequestSchemas,
  ...authRequestSchemas,
  ...ankiRequestSchemas,
  ...configSchemas,
  ...wordSchemas,
};
