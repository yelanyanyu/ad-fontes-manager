const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const crypto = require('crypto') as typeof import('crypto');
const config = require('./utils/config.ts') as {
  get: <T = unknown>(lookupPath: string, defaultValue?: T) => T;
  reload: () => Record<string, unknown>;
};

type LocalWordItem = {
  id: string;
  raw_yaml: string;
  lemma_preview: string | null;
  updated_at: number;
};

type LocalConfig = {
  DATABASE_URL?: string;
  API_PORT?: number;
  CLIENT_DEV_PORT?: number;
  MAX_LOCAL_ITEMS?: number;
  [key: string]: unknown;
};

class LocalStore {
  private dataFile: string;
  private limit: number;

  constructor() {
    this.dataFile = path.join(__dirname, 'data', 'local_words.json');
    this.limit = Number(config.get<number>('storage.max_items', 100)) || 100;

    const dataDir = path.dirname(this.dataFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  getConfig(): LocalConfig {
    return {
      DATABASE_URL: config.get<string | null>('database.url', null) || undefined,
      API_PORT: Number(config.get<number>('server.port', 8080)),
      CLIENT_DEV_PORT: Number(config.get<number>('client.dev_port', 5173)),
      MAX_LOCAL_ITEMS: Number(config.get<number>('storage.max_items', 100)),
    };
  }

  saveConfig(nextConfig: Record<string, unknown>): void {
    if (typeof nextConfig.DATABASE_URL === 'string' && nextConfig.DATABASE_URL.trim()) {
      process.env.DATABASE_URL = nextConfig.DATABASE_URL.trim();
    }

    if (nextConfig.MAX_LOCAL_ITEMS !== undefined && nextConfig.MAX_LOCAL_ITEMS !== null) {
      process.env.MAX_LOCAL_ITEMS = String(nextConfig.MAX_LOCAL_ITEMS);
      const parsed = Number.parseInt(String(nextConfig.MAX_LOCAL_ITEMS), 10);
      this.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
    }

    config.reload();
  }

  private readData(): LocalWordItem[] {
    if (!fs.existsSync(this.dataFile)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.dataFile, 'utf8')) as LocalWordItem[];
    } catch (error) {
      console.error('Local data read error:', error);
      return [];
    }
  }

  private writeData(data: LocalWordItem[]): void {
    fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
  }

  getAll(): LocalWordItem[] {
    return this.readData().sort((a, b) => b.updated_at - a.updated_at);
  }

  findByLemma(lemma: string): LocalWordItem | null {
    if (!lemma) return null;

    const items = this.readData();
    const target = lemma.toLowerCase();

    return (
      items.find(item => {
        if (item.lemma_preview) return item.lemma_preview.toLowerCase() === target;
        try {
          const match = item.raw_yaml.match(/lemma:\s*"?([^"\n]+)"?/);
          if (match && match[1].trim().toLowerCase() === target) return true;
        } catch {
          return false;
        }
        return false;
      }) || null
    );
  }

  save(rawYaml: string, id: string | null = null): string {
    const items = this.readData();

    let lemma: string | null = null;
    try {
      const match = rawYaml.match(/lemma:\s*"?([^"\n]+)"?/);
      if (match) lemma = match[1].trim();
    } catch {
      lemma = null;
    }

    if (id) {
      const index = items.findIndex(item => item.id === id);
      if (index !== -1) {
        const updated: LocalWordItem = {
          ...items[index],
          raw_yaml: rawYaml,
          lemma_preview: lemma,
          updated_at: Date.now(),
        };
        items.splice(index, 1);
        items.unshift(updated);
        this.writeData(items);
        return id;
      }
    }

    if (items.length >= this.limit) {
      throw new Error(`Local storage limit reached (${this.limit}). Please sync or delete items.`);
    }

    const newId = crypto.randomUUID();
    const newItem: LocalWordItem = {
      id: newId,
      raw_yaml: rawYaml,
      lemma_preview: lemma,
      updated_at: Date.now(),
    };

    items.unshift(newItem);
    this.writeData(items);
    return newId;
  }

  delete(id: string): void {
    const items = this.readData().filter(item => item.id !== id);
    this.writeData(items);
  }

  clear(): void {
    this.writeData([]);
  }
}

module.exports = new LocalStore();
