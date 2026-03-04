/**
 * Word Service Module - 统一入口
 * 兼容旧引用：require('./services/wordService') 仍然有效
 */

const WordService = require('./WordService');
const WordValidator = require('./WordValidator');
const WordRepository = require('./WordRepository');
const WordAssembler = require('./WordAssembler');

module.exports = WordService;
module.exports.WordService = WordService;
module.exports.WordValidator = WordValidator;
module.exports.WordRepository = WordRepository;
module.exports.WordAssembler = WordAssembler;
