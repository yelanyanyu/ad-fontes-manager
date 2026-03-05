const WordService = require('./WordService');
const WordValidator = require('./WordValidator');
const WordRepository = require('./WordRepository');
const WordAssembler = require('./WordAssembler');

module.exports = WordService;
(module.exports as Record<string, unknown>).WordService = WordService;
(module.exports as Record<string, unknown>).WordValidator = WordValidator;
(module.exports as Record<string, unknown>).WordRepository = WordRepository;
(module.exports as Record<string, unknown>).WordAssembler = WordAssembler;
