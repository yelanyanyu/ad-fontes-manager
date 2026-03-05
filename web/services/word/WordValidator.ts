type ValidationError = string;

interface ValidationContext {
  wordLower: string;
}

type ValidationFn = (value: unknown, context: ValidationContext) => boolean | string | null;

interface SchemaNode {
  required?: boolean;
  validate?: ValidationFn;
  message?: string;
  fields?: Record<string, SchemaNode>;
}

type SchemaMap = Record<string, SchemaNode>;

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

class WordValidator {
  private readonly _validators: {
    isNonEmptyString: (value: unknown) => boolean;
    isObject: (value: unknown) => boolean;
    isNonEmptyArray: (value: unknown) => boolean;
  };

  private readonly _wordSchema: SchemaMap;

  constructor() {
    this._validators = {
      isNonEmptyString: (value: unknown) => typeof value === 'string' && value.trim().length > 0,
      isObject: (value: unknown) =>
        Boolean(value) && typeof value === 'object' && !Array.isArray(value),
      isNonEmptyArray: (value: unknown) => Array.isArray(value) && value.length > 0,
    };

    this._wordSchema = this._buildWordSchema();
  }

  private _buildWordSchema(): SchemaMap {
    const { isNonEmptyString, isObject, isNonEmptyArray } = this._validators;

    return {
      root: {
        validate: (data: unknown) => (isObject(data) ? null : 'root must be an object'),
      },
      yield: {
        required: true,
        validate: (data: unknown) => (isObject(data) ? null : 'yield is required'),
        fields: {
          user_word: {
            required: true,
            validate: (value: unknown) => isNonEmptyString(value),
            message: 'yield.user_word is required',
          },
          lemma: {
            required: true,
            validate: (value: unknown, context: ValidationContext) => {
              if (!isNonEmptyString(value)) return 'yield.lemma is required';
              if ((value as string).trim().toLowerCase() !== context.wordLower) {
                return 'yield.lemma must match word';
              }
              return null;
            },
          },
          syllabification: {
            required: true,
            validate: (value: unknown) => isNonEmptyString(value),
            message: 'yield.syllabification is required',
          },
          user_context_sentence: {
            required: true,
            validate: (value: unknown) => isNonEmptyString(value),
            message: 'yield.user_context_sentence is required',
          },
          part_of_speech: {
            required: true,
            validate: (value: unknown) => isNonEmptyString(value),
            message: 'yield.part_of_speech is required',
          },
          contextual_meaning: {
            required: true,
            validate: (data: unknown) =>
              isObject(data) ? null : 'yield.contextual_meaning is required',
            fields: {
              en: {
                required: true,
                validate: (value: unknown) => isNonEmptyString(value),
                message: 'yield.contextual_meaning.en is required',
              },
              zh: {
                required: true,
                validate: (value: unknown) => isNonEmptyString(value),
                message: 'yield.contextual_meaning.zh is required',
              },
            },
          },
          other_common_meanings: {
            required: true,
            validate: (data: unknown) =>
              isNonEmptyArray(data)
                ? null
                : 'yield.other_common_meanings must be a non-empty array',
          },
        },
      },
      etymology: {
        required: true,
        validate: (data: unknown) => (isObject(data) ? null : 'etymology is required'),
        fields: {
          root_and_affixes: {
            required: true,
            validate: (data: unknown) =>
              isObject(data) ? null : 'etymology.root_and_affixes is required',
            fields: {
              prefix: {
                required: true,
                validate: (value: unknown) => isNonEmptyString(value),
                message: 'etymology.root_and_affixes.prefix is required',
              },
              root: {
                required: true,
                validate: (value: unknown) => isNonEmptyString(value),
                message: 'etymology.root_and_affixes.root is required',
              },
              suffix: {
                required: true,
                validate: (value: unknown) => isNonEmptyString(value),
                message: 'etymology.root_and_affixes.suffix is required',
              },
              structure_analysis: {
                required: true,
                validate: (value: unknown) => isNonEmptyString(value),
                message: 'etymology.root_and_affixes.structure_analysis is required',
              },
            },
          },
          historical_origins: {
            required: true,
            validate: (data: unknown) =>
              isObject(data) ? null : 'etymology.historical_origins is required',
            fields: {
              history_myth: {
                required: true,
                validate: (value: unknown) => isNonEmptyString(value),
                message: 'etymology.historical_origins.history_myth is required',
              },
              source_word: {
                required: true,
                validate: (value: unknown) => isNonEmptyString(value),
                message: 'etymology.historical_origins.source_word is required',
              },
              pie_root: {
                required: true,
                validate: (value: unknown) => isNonEmptyString(value),
                message: 'etymology.historical_origins.pie_root is required',
              },
            },
          },
          visual_imagery_zh: {
            required: true,
            validate: (value: unknown) => isNonEmptyString(value),
            message: 'etymology.visual_imagery_zh is required',
          },
          meaning_evolution_zh: {
            required: true,
            validate: (value: unknown) => isNonEmptyString(value),
            message: 'etymology.meaning_evolution_zh is required',
          },
        },
      },
      cognate_family: {
        required: true,
        validate: (data: unknown) => (isObject(data) ? null : 'cognate_family is required'),
        fields: {
          cognates: {
            required: true,
            validate: (data: unknown) => {
              if (!isNonEmptyArray(data))
                return 'cognate_family.cognates must be a non-empty array';
              const rows = data as Array<Record<string, unknown>>;
              const invalid = rows.some(
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
        validate: (data: unknown) => (isObject(data) ? null : 'application is required'),
        fields: {
          selected_examples: {
            required: true,
            validate: (data: unknown) => {
              if (!isNonEmptyArray(data))
                return 'application.selected_examples must be a non-empty array';
              const rows = data as Array<Record<string, unknown>>;
              const invalid = rows.some(
                e =>
                  !isObject(e) ||
                  !isNonEmptyString(e.type) ||
                  !isNonEmptyString(e.sentence) ||
                  !isNonEmptyString(e.translation_zh)
              );
              if (invalid) {
                return 'application.selected_examples items must have type, sentence, translation_zh';
              }
              return null;
            },
          },
        },
      },
      nuance: {
        required: true,
        validate: (data: unknown) => (isObject(data) ? null : 'nuance is required'),
        fields: {
          image_differentiation_zh: {
            required: true,
            validate: (value: unknown) => isNonEmptyString(value),
            message: 'nuance.image_differentiation_zh is required',
          },
          synonyms: {
            required: true,
            validate: (data: unknown) => {
              if (!isNonEmptyArray(data)) return 'nuance.synonyms must be a non-empty array';
              const rows = data as Array<Record<string, unknown>>;
              const invalid = rows.some(
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

  validate(data: unknown, wordLower: string): ValidationResult {
    const errors: ValidationError[] = [];
    const context: ValidationContext = { wordLower };

    const rootError = this._runValidation(this._wordSchema.root, data, context, 'root');
    if (rootError) {
      return { valid: false, errors: [rootError] };
    }

    this._validateSection(data as Record<string, unknown>, this._wordSchema, '', errors, context);

    return { valid: errors.length === 0, errors };
  }

  private _runValidation(
    config: SchemaNode,
    value: unknown,
    context: ValidationContext,
    currentPath: string
  ): string | null {
    if (!config.validate) return null;

    const validationResult = config.validate(value, context);

    if (typeof validationResult === 'string' && validationResult) {
      return validationResult;
    }

    if (validationResult === false) {
      return config.message || `${currentPath} is invalid`;
    }

    return null;
  }

  private _validateSection(
    data: Record<string, unknown>,
    schema: SchemaMap,
    path: string,
    errors: ValidationError[],
    context: ValidationContext
  ): void {
    for (const [key, config] of Object.entries(schema)) {
      if (key === 'root') continue;

      const currentPath = path ? `${path}.${key}` : key;
      const value = data?.[key];

      if (config.required && value === undefined) {
        errors.push(`${currentPath} is required`);
        continue;
      }

      if (value === undefined) continue;

      const validationError = this._runValidation(config, value, context, currentPath);
      if (validationError) {
        errors.push(validationError);
      }

      if (config.fields && this._validators.isObject(value)) {
        this._validateSection(
          value as Record<string, unknown>,
          config.fields,
          currentPath,
          errors,
          context
        );
      }
    }
  }
}

module.exports = new WordValidator();
