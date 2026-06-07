import type { Request, Response as ExpressResponse, Router } from 'express';
import type { Announcement } from '../schemas/announcement';
import { normalizeAnnouncementList } from '../schemas/announcement';

const express = require('express') as typeof import('express');
const fs = require('node:fs/promises') as typeof import('node:fs/promises');
const path = require('node:path') as typeof import('node:path');

interface CreateAnnouncementRouterOptions {
  cacheFilePath?: string;
  sources?: AnnouncementSource[];
  fetchImpl?: FetchLike;
  github?: {
    owner: string;
    repo: string;
  };
}

type AnnouncementFetchInit = {
  headers?: Record<string, string>;
  signal?: unknown;
};

type FetchLike = (url: string, init?: AnnouncementFetchInit) => Promise<Response>;

interface GitHubReleasePayload {
  tag_name?: string;
  name?: string;
  body?: string;
  published_at?: string;
  created_at?: string;
}

export interface AnnouncementSourceNotice {
  source: string;
  level: 'warning';
  message: string;
  detail?: string;
}

export interface AnnouncementSourceResult {
  announcements: Announcement[];
}

export interface AnnouncementSource {
  id: string;
  fetchLatest: () => Promise<AnnouncementSourceResult>;
}

const defaultCacheFilePath = path.resolve(process.cwd(), 'data', 'announcements.json');
const defaultGitHubRepo = {
  owner: process.env.ANNOUNCEMENT_GITHUB_OWNER || 'yelanyanyu',
  repo: process.env.ANNOUNCEMENT_GITHUB_REPO || 'ad-fontes-manager',
};

function versionNumberFromTag(
  tagName: string | undefined,
  publishedAt: string | undefined
): number {
  const versionMatch = tagName?.match(/(\d+)\.(\d+)\.(\d+)/);
  if (versionMatch) {
    const [, major, minor, patch] = versionMatch;
    return Number(major) * 1_000_000 + Number(minor) * 1_000 + Number(patch);
  }

  const timestamp = publishedAt ? Date.parse(publishedAt) : NaN;
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0;
}

export function buildReleaseAnnouncement(release: GitHubReleasePayload): Announcement {
  const tagName = release.tag_name?.trim() || release.name?.trim() || 'latest';
  const publishedAt = release.published_at || release.created_at;

  return {
    version: versionNumberFromTag(tagName, publishedAt),
    date: publishedAt ? publishedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    title: release.name?.trim() || `${tagName} 更新公告`,
    body_md: release.body?.trim() || '暂无更新说明。',
    dismissible: true,
  };
}

function describeSourceError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Unknown network error';
}

function dedupeAnnouncements(announcements: Announcement[]): Announcement[] {
  const seen = new Set<string>();
  return announcements.filter(announcement => {
    const key = `${announcement.version}:${announcement.title}:${announcement.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createGitHubReleaseAnnouncementSource(options: {
  owner: string;
  repo: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): AnnouncementSource {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;

  return {
    id: 'github',
    async fetchLatest() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(
          `https://api.github.com/repos/${options.owner}/${options.repo}/releases/latest`,
          {
            headers: {
              Accept: 'application/vnd.github+json',
              'User-Agent': 'ad-fontes-manager',
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`GitHub release request failed: ${response.status}`);
        }

        const release = (await response.json()) as GitHubReleasePayload;
        return { announcements: [buildReleaseAnnouncement(release)] };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

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

export async function resolveAnnouncements(options: {
  cacheFilePath: string;
  sources: AnnouncementSource[];
}): Promise<{ announcements: Announcement[]; sourceNotice?: AnnouncementSourceNotice }> {
  const localAnnouncements = await readAnnouncements(options.cacheFilePath);
  const remoteAnnouncements: Announcement[] = [];
  let sourceNotice: AnnouncementSourceNotice | undefined;

  for (const source of options.sources) {
    try {
      const result = await source.fetchLatest();
      remoteAnnouncements.push(...result.announcements);
      break;
    } catch (error) {
      sourceNotice = {
        source: source.id,
        level: 'warning',
        message: '无法连接 GitHub Release，当前显示本地缓存公告。',
        detail: describeSourceError(error),
      };
    }
  }

  return {
    announcements: dedupeAnnouncements([...remoteAnnouncements, ...localAnnouncements]),
    sourceNotice,
  };
}

export function createAnnouncementRouter(options: CreateAnnouncementRouterOptions = {}): Router {
  const router = express.Router();
  const cacheFilePath = options.cacheFilePath ?? defaultCacheFilePath;
  const githubRepo = options.github ?? defaultGitHubRepo;
  const sources = options.sources ?? [
    createGitHubReleaseAnnouncementSource({
      owner: githubRepo.owner,
      repo: githubRepo.repo,
      fetchImpl: options.fetchImpl,
    }),
  ];

  router.get(
    '/announcements',
    async (_req: Request, res: ExpressResponse, next: (error: unknown) => void) => {
      try {
        const payload = await resolveAnnouncements({ cacheFilePath, sources });
        res.json(payload);
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
module.exports.resolveAnnouncements = resolveAnnouncements;
module.exports.buildReleaseAnnouncement = buildReleaseAnnouncement;
module.exports.createGitHubReleaseAnnouncementSource = createGitHubReleaseAnnouncementSource;
