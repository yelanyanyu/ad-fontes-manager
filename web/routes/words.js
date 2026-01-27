const express = require('express');
const router = express.Router();
const wordController = require('../controllers/wordController');

router.get('/', (req, res) => wordController.list(req, res));
router.get('/:id', (req, res) => wordController.get(req, res));
router.post('/', (req, res) => wordController.save(req, res));
router.delete('/:id', (req, res) => wordController.delete(req, res));

module.exports = router;
