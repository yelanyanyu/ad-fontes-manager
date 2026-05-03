const WordServiceV2 = require('./WordServiceV2');
const WordValidator = require('./WordValidator');
const WordRepositoryV2 = require('./WordRepositoryV2');
const WordAssemblerV2 = require('./WordAssemblerV2');

module.exports = WordServiceV2;
(module.exports as Record<string, unknown>).WordServiceV2 = WordServiceV2;
(module.exports as Record<string, unknown>).WordValidator = WordValidator;
(module.exports as Record<string, unknown>).WordRepositoryV2 = WordRepositoryV2;
(module.exports as Record<string, unknown>).WordAssemblerV2 = WordAssemblerV2;
