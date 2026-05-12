import type { NextFunction, Request, Response } from 'express';

const express = require('express') as typeof import('express');
const router = express.Router();
const { requireWriteAccess } = require('../middleware/writeAuth') as {
  requireWriteAccess: (req: Request, res: Response, next: NextFunction) => void;
};
const { asyncHandler } = require('../utils/errors') as {
  asyncHandler: <T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) => T;
};
const {
  handleGenerateSingle,
  handleGenerateBatch,
  handleStream,
  handleCancelJob,
  handlePauseJob,
  handleResumeActiveJob,
  handleResumeJob,
  handleFixJob,
  handleQueueOverview,
  handleQueueHistory,
  handleQueueHistoryJob,
  handleTodayWorkset,
  handleSaveWorkset,
  handleDeleteHistoryJob,
  handleClearQueueHistory,
  handleQueueCancelAll,
  handleQueuePauseAll,
  handleQueueResumeAll,
} = require('../controllers/generateController') as {
  handleGenerateSingle: (req: Request, res: Response) => Promise<void>;
  handleGenerateBatch: (req: Request, res: Response) => Promise<void>;
  handleStream: (req: Request, res: Response) => Promise<void>;
  handleCancelJob: (req: Request, res: Response) => Promise<void>;
  handlePauseJob: (req: Request, res: Response) => Promise<void>;
  handleResumeActiveJob: (req: Request, res: Response) => Promise<void>;
  handleResumeJob: (req: Request, res: Response) => Promise<void>;
  handleFixJob: (req: Request, res: Response) => Promise<void>;
  handleQueueOverview: (req: Request, res: Response) => Promise<void>;
  handleQueueHistory: (req: Request, res: Response) => Promise<void>;
  handleQueueHistoryJob: (req: Request, res: Response) => Promise<void>;
  handleTodayWorkset: (req: Request, res: Response) => Promise<void>;
  handleSaveWorkset: (req: Request, res: Response) => Promise<void>;
  handleDeleteHistoryJob: (req: Request, res: Response) => Promise<void>;
  handleClearQueueHistory: (req: Request, res: Response) => Promise<void>;
  handleQueueCancelAll: (req: Request, res: Response) => Promise<void>;
  handleQueuePauseAll: (req: Request, res: Response) => Promise<void>;
  handleQueueResumeAll: (req: Request, res: Response) => Promise<void>;
};

router.post('/generate/single', requireWriteAccess, asyncHandler(handleGenerateSingle));
router.post('/generate/batch', requireWriteAccess, asyncHandler(handleGenerateBatch));
router.get('/generate/:jobId/stream', asyncHandler(handleStream));
router.post('/generate/:jobId/cancel', requireWriteAccess, asyncHandler(handleCancelJob));
router.post('/generate/:jobId/pause', requireWriteAccess, asyncHandler(handlePauseJob));
router.post(
  '/generate/:jobId/resume-active',
  requireWriteAccess,
  asyncHandler(handleResumeActiveJob)
);
router.post('/generate/:jobId/resume', requireWriteAccess, asyncHandler(handleResumeJob));
router.post('/generate/:jobId/fix', requireWriteAccess, asyncHandler(handleFixJob));

// Queue management
router.get('/generate/queue/overview', asyncHandler(handleQueueOverview));
router.get('/generate/queue/history', asyncHandler(handleQueueHistory));
router.get('/generate/workset/today', asyncHandler(handleTodayWorkset));
router.post('/generate/workset/save', requireWriteAccess, asyncHandler(handleSaveWorkset));
router.post(
  '/generate/queue/history/clear',
  requireWriteAccess,
  asyncHandler(handleClearQueueHistory)
);
router.post('/generate/queue/cancel-all', requireWriteAccess, asyncHandler(handleQueueCancelAll));
router.post('/generate/queue/pause-all', requireWriteAccess, asyncHandler(handleQueuePauseAll));
router.post('/generate/queue/resume-all', requireWriteAccess, asyncHandler(handleQueueResumeAll));
router.get('/generate/queue/history/:jobId', asyncHandler(handleQueueHistoryJob));
router.delete(
  '/generate/queue/history/:jobId',
  requireWriteAccess,
  asyncHandler(handleDeleteHistoryJob)
);

module.exports = router;
