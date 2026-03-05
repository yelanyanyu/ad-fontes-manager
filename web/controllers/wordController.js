const wordService = require('../services/wordService');
const { asyncHandler, BadRequest, Conflict, UnprocessableEntity } = require('../utils/errors');
const { logger } = require('../utils/logger');

class WordController {
  list = asyncHandler(async (req, res) => {
    const words = await wordService.listWords(req);
    res.json(words);
  });

  getDetails = asyncHandler(async (req, res) => {
    const word = (req.query.word || '').trim();
    if (!word) {
      throw BadRequest('Word parameter required');
    }
    const includeRaw = (req.query.include || '').trim();
    const include = includeRaw
      ? includeRaw
          .split(',')
          .map(s => s.trim().toLowerCase())
          .filter(Boolean)
      : [];
    const data = await wordService.getWordDetails(req, word, include);
    res.status(200).json({ code: 200, message: 'success', data });
  });

  get = asyncHandler(async (req, res) => {
    const word = await wordService.getWordById(req, req.params.id);
    res.json(word);
  });

  check = asyncHandler(async (req, res) => {
    const userWord = req.query.word;
    if (!userWord) {
      throw BadRequest('Word parameter required');
    }
    const result = await wordService.checkWord(req, userWord);
    res.json(result);
  });

  save = asyncHandler(async (req, res) => {
    const { yaml: yamlStr, forceUpdate } = req.body;
    logger.debug(
      {
        forceUpdate: forceUpdate,
        yamlStr: yamlStr.toString().substring(0, 50),
      },
      'asyncHandler'
    );
    const result = await wordService.saveWord(req, yamlStr, forceUpdate);
    res.json(result);
  });

  addWord = asyncHandler(async (req, res) => {
    const word = (req.body.word || '').trim();
    const yamlStr = req.body.yaml || '';
    if (!word || !yamlStr) {
      throw BadRequest('Missing parameters');
    }
    const result = await wordService.addWord(req, word, yamlStr);
    if (result.status === 'duplicate') {
      throw Conflict('Duplicate word', { lemma: result.lemma });
    }
    if (result.status === 'invalid') {
      throw UnprocessableEntity('Invalid YAML', { errors: result.errors || [] });
    }
    res
      .status(201)
      .json({ code: 201, message: 'created', data: { id: result.id, lemma: result.lemma } });
  });

  delete = asyncHandler(async (req, res) => {
    await wordService.deleteWord(req, req.params.id);
    res.json({ success: true });
  });
}

module.exports = new WordController();
