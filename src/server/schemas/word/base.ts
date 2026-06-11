const {
  requiredString,
  requiredStringAllowEmpty,
  requiredObject,
  nonEmptyArray,
} = require('./helpers');

function createBaseWordSchema(config: { meaningLang: 'en' | 'de' }) {
  const yieldSchema = requiredObject(
    {
      user_word: requiredString('yield.user_word'),
      lemma: requiredString('yield.lemma'),
      syllabification: requiredString('yield.syllabification'),
      user_context_sentence: requiredStringAllowEmpty('yield.user_context_sentence'),
      part_of_speech: requiredString('yield.part_of_speech'),
      contextual_meaning: requiredObject(
        {
          [config.meaningLang]: requiredString(`yield.contextual_meaning.${config.meaningLang}`),
          zh: requiredString('yield.contextual_meaning.zh'),
        },
        'yield.contextual_meaning'
      ),
      other_common_meanings: nonEmptyArray('yield.other_common_meanings'),
    },
    'yield'
  );

  const applicationSchema = requiredObject(
    {
      selected_examples: nonEmptyArray('application.selected_examples'),
    },
    'application'
  );

  return { yieldSchema, applicationSchema };
}

module.exports = { createBaseWordSchema };
