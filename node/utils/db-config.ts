export interface DatabaseUrlParts {
  user: string;
  password: string;
  host: string;
  port: string;
  database: string;
}

export interface DbQueryResult<T extends Record<string, unknown> = Record<string, unknown>> {
  rows: T[];
}

export interface DbQueryClient {
  query: (sql: string, params?: unknown[]) => Promise<DbQueryResult>;
}

export interface DbPoolClient extends DbQueryClient {
  release: () => void;
}

const DB_URL_REGEX = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;

export function parseDatabaseUrl(dbUrl: string): DatabaseUrlParts | null {
  const match = dbUrl.match(DB_URL_REGEX);
  if (!match) {
    return null;
  }

  const [, user, password, host, port, database] = match;
  return { user, password, host, port, database };
}
