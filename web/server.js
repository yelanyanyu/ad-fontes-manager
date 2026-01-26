const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Mount Routes
app.use('/api', require('./routes/core'));
app.use('/api', require('./routes/sync')); // Mounts /local and /sync
app.use('/api/words', require('./routes/words'));

// Frontend Routes (SPA-like or separate pages)
app.get(['/', '/words', '/phrase'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
