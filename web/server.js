const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const localStore = require('./localStore');

const app = express();
app.use(express.json());
app.use(cors());

// Mount Routes
app.use('/api', require('./routes/core'));
app.use('/api', require('./routes/sync')); // Mounts /local and /sync
app.use('/api/words', require('./routes/words'));

// Static Serving (Production vs Dev)
if (process.env.NODE_ENV === 'production') {
    // Serve built Vue files
    app.use(express.static(path.join(__dirname, 'dist')));
    
    // SPA Catch-all (excluding API)
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api')) return res.status(404).send('Not Found');
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
} else {
    const config = localStore.getConfig();
    const clientPort = config.CLIENT_DEV_PORT || process.env.CLIENT_DEV_PORT;
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api')) return res.status(404).send('Not Found');
        res.redirect(`http://localhost:${clientPort}${req.originalUrl}`);
    });
}

// Start Server
const config = localStore.getConfig();
const apiPort = config.API_PORT || process.env.PORT;
app.listen(apiPort, () => {
    console.log(`Server running on http://localhost:${apiPort}`);
});
