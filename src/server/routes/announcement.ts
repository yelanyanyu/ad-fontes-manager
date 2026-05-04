import type { Request, Response, Router } from 'express';
import { normalizeAnnouncementList } from '../schemas/announcement';

const express = require('express') as typeof import('express');
const fs = require('node:fs/promises') as typeof import('node:fs/promises');
const path = require('node:path') as typeof import('node:path');

interface CreateAnnouncementRouterOptions {
  cacheFilePath?: string;
}

const defaultCacheFilePath = path.resolve(process.cwd(), 'data', 'announcements.json');

export async function readAnnouncements(cacheFilePath: string) {
  try {
    const raw = await fs.readFile(cacheFilePath, 'utf8');
    return normalizeAnnouncementList(JSON.parse(raw));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'ENOENT') return [];
    throw error;
  }
}

export function createAnnouncementRouter(options: CreateAnnouncementRouterOptions = {}): Router {
  const router = express.Router();
  const cacheFilePath = options.cacheFilePath ?? defaultCacheFilePath;

  router.get(
    '/announcements',
    async (_req: Request, res: Response, next: (error: unknown) => void) => {
      try {
        const announcements = await readAnnouncements(cacheFilePath);
        res.json({ announcements });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

module.exports = createAnnouncementRouter();
module.exports.createAnnouncementRouter = createAnnouncementRouter;
module.exports.readAnnouncements = readAnnouncements;
