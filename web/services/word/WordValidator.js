/**
 * WordValidator - YAML 结构与业务规则验证
 * 将原 _validateStrictYaml 改为声明式 Schema 配置
 */

class WordValidator {
  constructor() {
    this._validators = {
      isNonEmptyString: value => typeof value === 'string' && value.trim().length > 0,
      isObject: value => value && typeof value === 'object' && !Array.isArray(value),
      isNonEmptyArray: value => Array.isArray(value) && value.length > 0,
    };

    this._wordSchema = this._buildWordSchema();
  }

  _buildWordSchema() {
    const { isNonEmptyString, isObject, isNonEmptyArray } = this._validators;

    return {
      root: {
        validate: data => (isObject(data) ? null : 'root must be an object'),
      },
      yield: {
        required: true,
        validate: data => (isObject(data) ? null : 'yield is required'),
        fields: {
          user_word: {
            required: true,
            validate: isNonEmptyString,
            message: 'yield.user_word is required',
          },
          lemma: {
            required: true,
            validate: (value, context) => {
              if (!isNonEmptyString(value)) return 'yield.lemma is required';
              if (value.trim().toLowerCase() !== context.wordLower) {
                return 'yield.lemma must match word';
              }
              return null;
            },
          },
          syllabification: {
            required: true,
            validate: isNonEmptyString,
            message: 'yield.syllabification is required',
          },
          user_context_sentence: {
            required: true,
            validate: isNonEmptyString,
            message: 'yield.user_context_sentence is required',
          },
          part_of_speech: {
            required: true,
            validate: isNonEmptyString,
            message: 'yield.part_of_speech is required',
          },
          contextual_meaning: {
            required: true,
            validate: data => (isObject(data) ? null : 'yield.contextual_meaning is required'),
            fields: {
              en: {
                required: true,
                validate: isNonEmptyString,
                message: 'yield.contextual_meaning.en is required',
              },
              zh: {
                required: true,
                validate: isNonEmptyString,
                message: 'yield.contextual_meaning.zh is required',
              },
            },
          },
          other_common_meanings: {
            required: true,
            validate: data =>
              isNonEmptyArray(data)
                ? null
                : 'yield.other_common_meanings must be a non-empty array',
          },
        },
      },
      etymology: {
        required: true,
        validate: data => (isObject(data) ? null : 'etymology is required'),
        fields: {
          root_and_affixes: {
            required: true,
            validate: data => (isObject(data) ? null : 'etymology.root_and_affixes is required'),
            fields: {
              prefix: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.root_and_affixes.prefix is required',
              },
              root: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.root_and_affixes.root is required',
              },
              suffix: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.root_and_affixes.suffix is required',
              },
              structure_analysis: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.root_and_affixes.structure_analysis is required',
              },
            },
          },
          historical_origins: {
            required: true,
            validate: data => (isObject(data) ? null : 'etymology.historical_origins is required'),
            fields: {
              history_myth: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.historical_origins.history_myth is required',
              },
              source_word: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.historical_origins.source_word is required',
              },
              pie_root: {
                required: true,
                validate: isNonEmptyString,
                message: 'etymology.historical_origins.pie_root is required',
              },
            },
          },
          visual_imagery_zh: {
            required: true,
            validate: isNonEmptyString,
            message: 'etymology.visual_imagery_zh is required',
          },
          meaning_evolution_zh: {
            required: true,
            validate: isNonEmptyString,
            message: 'etymology.meaning_evolution_zh is required',
          },
        },
      },
      cognate_family: {
        required: true,
        validate: data => (isObject(data) ? null : 'cognate_family is required'),
        fields: {
          cognates: {
            required: true,
            validate: data => {
              if (!isNonEmptyArray(data))
                return 'cognate_family.cognates must be a non-empty array';
              const invalid = data.some(
                c => !isObject(c) || !isNonEmptyString(c.word) || !isNonEmptyString(c.logic)
              );
              if (invalid) return 'cognate_family.cognates items must have word and logic';
              return null;
            },
          },
        },
      },
      application: {
        required: true,
        validate: data => (isObject(data) ? null : 'application is required'),
        fields: {
          selected_examples: {
            required: true,
            validate: data => {
              if (!isNonEmptyArray(data))
                return 'application.selected_examples must be a non-empty array';
              const invalid = data.some(
                e =>
                  !isObject(e) ||
                  !isNonEmptyString(e.type) ||
                  !isNonEmptyString(e.sentence) ||
                  !isNonEmptyString(e.translation_zh)
              );
              if (invalid)
                return 'application.selected_examples items must have type, sentence, translation_zh';
              return null;
            },
          },
        },
      },
      nuance: {
        required: true,
        validate: data => (isObject(data) ? null : 'nuance is required'),
        fields: {
          image_differentiation_zh: {
            required: true,
            validate: isNonEmptyString,
            message: 'nuance.image_differentiation_zh is required',
          },
          synonyms: {
            required: true,
            validate: data => {
              if (!isNonEmptyArray(data)) return 'nuance.synonyms must be a non-empty array';
              const invalid = data.some(
                s => !isObject(s) || !isNonEmptyString(s.word) || !isNonEmptyString(s.meaning_zh)
              );
              if (invalid) return 'nuance.synonyms items must have word and meaning_zh';
              return null;
            },
          },
        },
      },
    };
  }

  validate(data, wordLower) {
    const errors = [];
    const context = { wordLower };

    const rootError = this._wordSchema.root.validate(data);
    if (rootError) {
      return { valid: false, errors: [rootError] };
    }

    this._validateSection(data, this._wordSchema, '', errors, context);

    return { valid: errors.length === 0, errors };
  }

  _validateSection(data, schema, path, errors, context) {
    for (const [key, config] of Object.entries(schema)) {
      if (key === 'root') continue;

      const currentPath = path ? `${path}.${key}` : key;
      const value = data?.[key];

      if (config.required && value === undefined) {
        errors.push(`${currentPath} is required`);
        continue;
      }

      if (value === undefined) continue;

      if (config.validate) {
        const error = config.validate(value, context);
        if (error) errors.push(error);
      }

      if (config.fields && this._validators.isObject(value)) {
        this._validateSection(value, config.fields, currentPath, errors, context);
      }
    }
  }
}

module.exports = new WordValidator();
