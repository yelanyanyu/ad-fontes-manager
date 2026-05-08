import type { NextFunction, Request, Response } from 'express';

const express = require('express') as typeof import('express');
const router = express.Router();
const { requireWriteAccess } = require('../middleware/writeAuth') as {
  requireWriteAccess: (req: Request, res: Response, next: NextFunction) => void;
};
const { asyncHandler } = require('../utils/errors') as {
  asyncHandler: <T extends (req: Request, res: Response) => Promise<unknown>>(fn: T) => T;
};
const { handleGenerateSingle, handleStream, handleCancelJob, handleResumeJob } =
  require('../controllers/generateController') as {
    handleGenerateSingle: (req: Request, res: Response) => Promise<void>;
    handleStream: (req: Request, res: Response) => Promise<void>;
    handleCancelJob: (req: Request, res: Response) => Promise<void>;
    handleResumeJob: (req: Request, res: Response) => Promise<void>;
  };

router.post('/generate/single', requireWriteAccess, asyncHandler(handleGenerateSingle));
router.get('/generate/:jobId/stream', asyncHandler(handleStream));
router.post('/generate/:jobId/cancel', requireWriteAccess, asyncHandler(handleCancelJob));
router.post('/generate/:jobId/resume', requireWriteAccess, asyncHandler(handleResumeJob));

module.exports = router;
