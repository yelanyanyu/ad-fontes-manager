export {
  CURRENT_WORD_SCHEMA_VERSION,
  DEFAULT_WORD_SCHEMA_VERSION,
  readWordSchemaVersion,
  ensureCurrentWordSchemaMetadata,
  isLatestWordSchemaVersion,
} from '../../shared/wordSchemaVersion';

const {
  CURRENT_WORD_SCHEMA_VERSION,
  DEFAULT_WORD_SCHEMA_VERSION,
  readWordSchemaVersion,
  ensureCurrentWordSchemaMetadata,
  isLatestWordSchemaVersion,
} = require('../../shared/wordSchemaVersion') as typeof import('../../shared/wordSchemaVersion');

module.exports = {
  CURRENT_WORD_SCHEMA_VERSION,
  DEFAULT_WORD_SCHEMA_VERSION,
  readWordSchemaVersion,
  ensureCurrentWordSchemaMetadata,
  isLatestWordSchemaVersion,
};
