import type { Request, Response } from 'express';

const express = require('express') as typeof import('express');
const router = express.Router();

const wordController = require('../controllers/wordController') as {
  list: (req: Request, res: Response) => Promise<void>;
  getDetails: (req: Request, res: Response) => Promise<void>;
  get: (req: Request, res: Response) => Promise<void>;
  save: (req: Request, res: Response) => Promise<void>;
  addWord: (req: Request, res: Response) => Promise<void>;
  delete: (req: Request, res: Response) => Promise<void>;
};

router.get('/', (req: Request, res: Response) => wordController.list(req, res));
router.get('/details', (req: Request, res: Response) => wordController.getDetails(req, res));
router.get('/:id', (req: Request, res: Response) => wordController.get(req, res));
router.post('/', (req: Request, res: Response) => wordController.save(req, res));
router.post('/add', (req: Request, res: Response) => wordController.addWord(req, res));
router.delete('/:id', (req: Request, res: Response) => wordController.delete(req, res));

module.exports = router;
