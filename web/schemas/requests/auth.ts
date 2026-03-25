import { z } from 'zod';

const { NonEmptyString } = require('../common.ts') as {
  NonEmptyString: z.ZodType<string>;
};

const AdminTokenHeaderSchema = z.object({
  'x-admin-token': NonEmptyString,
});

module.exports = {
  AdminTokenHeaderSchema,
};
