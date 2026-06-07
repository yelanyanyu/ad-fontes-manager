import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildReleaseAnnouncement,
  createAnnouncementRouter,
  resolveAnnouncements,
  type AnnouncementSource,
} from '../src/server/routes/announcement';

const tempDirs: string[] = [];

async function createTempCache(content: unknown): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ad-fontes-announcements-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'announcements.json');
  await fs.writeFile(filePath, JSON.stringify(content), 'utf8');
  return filePath;
}

async function requestJson(app: express.Express, route: string): Promise<Response> {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }
    return await fetch(`http://127.0.0.1:${address.port}${route}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe('announcement route', () => {
  it('returns announcements from the configured cache file', async () => {
    const cacheFilePath = await createTempCache([
      {
        version: 2,
        date: '2026-05-04',
        title: 'v1.9.0 更新公告',
        body_md: '## 新功能\n- LLM 批量生成词源 YAML',
        dismissible: true,
      },
    ]);
    const app = express();
    app.use('/api', createAnnouncementRouter({ cacheFilePath, sources: [] }));

    const response = await requestJson(app, '/api/announcements');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      announcements: [
        {
          version: 2,
          date: '2026-05-04',
          title: 'v1.9.0 更新公告',
          body_md: '## 新功能\n- LLM 批量生成词源 YAML',
          dismissible: true,
        },
      ],
    });
  });

  it('returns an empty list when the cache file is missing', async () => {
    const cacheFilePath = path.join(os.tmpdir(), 'missing-announcements.json');
    const app = express();
    app.use('/api', createAnnouncementRouter({ cacheFilePath, sources: [] }));

    const response = await requestJson(app, '/api/announcements');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ announcements: [] });
  });

  it('builds an announcement from the latest release note', () => {
    expect(
      buildReleaseAnnouncement({
        tag_name: 'v2.3.4',
        name: 'Version 2.3.4',
        body: '## Fixed\n- Import conflict preview',
        published_at: '2026-06-07T08:00:00Z',
      })
    ).toEqual({
      version: 2_003_004,
      date: '2026-06-07',
      title: 'Version 2.3.4',
      body_md: '## Fixed\n- Import conflict preview',
      dismissible: true,
    });
  });

  it('prefers the configured source and keeps local cached announcements', async () => {
    const cacheFilePath = await createTempCache([
      {
        version: 1,
        date: '2026-05-01',
        title: '本地公告',
        body_md: '本地备用公告',
        dismissible: true,
      },
    ]);
    const source: AnnouncementSource = {
      id: 'github',
      async fetchLatest() {
        return {
          announcements: [
            {
              version: 2,
              date: '2026-06-07',
              title: '远端公告',
              body_md: 'GitHub Release Note',
              dismissible: true,
            },
          ],
        };
      },
    };

    await expect(resolveAnnouncements({ cacheFilePath, sources: [source] })).resolves.toEqual({
      announcements: [
        {
          version: 2,
          date: '2026-06-07',
          title: '远端公告',
          body_md: 'GitHub Release Note',
          dismissible: true,
        },
        {
          version: 1,
          date: '2026-05-01',
          title: '本地公告',
          body_md: '本地备用公告',
          dismissible: true,
        },
      ],
      sourceNotice: undefined,
    });
  });

  it('returns cached announcements with a source notice when GitHub is unreachable', async () => {
    const cacheFilePath = await createTempCache([
      {
        version: 1,
        date: '2026-05-01',
        title: '本地公告',
        body_md: '本地备用公告',
        dismissible: true,
      },
    ]);
    const source: AnnouncementSource = {
      id: 'github',
      async fetchLatest() {
        throw new Error('network unavailable');
      },
    };

    await expect(resolveAnnouncements({ cacheFilePath, sources: [source] })).resolves.toEqual({
      announcements: [
        {
          version: 1,
          date: '2026-05-01',
          title: '本地公告',
          body_md: '本地备用公告',
          dismissible: true,
        },
      ],
      sourceNotice: {
        source: 'github',
        level: 'warning',
        message: '无法连接 GitHub Release，当前显示本地缓存公告。',
        detail: 'network unavailable',
      },
    });
  });
});
