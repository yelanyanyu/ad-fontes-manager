export default {
  schema: './web/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './web/data/ad_fontes.db',
  },
};
