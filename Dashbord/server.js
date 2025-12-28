const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.use('/downloads', express.static(path.join(__dirname, '..', 'downloads')));

let authenticatedSessions = new Set();

let statusDownloader = null;
try {
    statusDownloader = require('../statusDownloader');
    console.log('✅ Status downloader module loaded');
} catch (e) {
    console.log('⚠️ Status downloader not loaded:', e.message);
}


app.get('/api/downloads/stats', (req, res) => {
    if (statusDownloader) {
        res.json(statusDownloader.getStats());
    } else {
        res.json({ 
            total: 0, 
            images: 0, 
            videos: 0, 
            audio: 0, 
            text: 0, 
            stickers: 0,
            totalSize: '0 KB' 
        });
    }
});

app.get('/api/downloads', (req, res) => {
    if (statusDownloader) {
        const options = {
            type: req.query.type || 'all',
            sender: req.query.sender || '',
            search: req.query.search || '',
            date: req.query.date || '',
            startDate: req.query.startDate || '',
            endDate: req.query.endDate || '',
            sortBy: req.query.sortBy || 'newest',
            favoritesOnly: req.query.favorites === 'true',
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 20
        };
        
        const result = statusDownloader.getMediaList(options);
        res.json(result);
    } else {
        res.json({ 
            data: [], 
            total: 0, 
            page: 1, 
            totalPages: 1, 
            hasMore: false 
        });
    }
});

app.get('/api/downloads/:id', (req, res) => {
    if (statusDownloader) {
        const item = statusDownloader.getMedia ? 
            statusDownloader.getMedia(req.params.id) : 
            null;
        
        if (item) {
            res.json(item);
        } else {
            res.status(404).json({ error: 'Not found' });
        }
    } else {
        res.status(500).json({ error: 'Downloader not ready' });
    }
});

app.delete('/api/downloads/:id', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId || !authenticatedSessions.has(sessionId)) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (statusDownloader) {
        const result = statusDownloader.deleteMedia(req.params.id);
        io.emit('downloadStats', statusDownloader.getStats());
        res.json(result);
    } else {
        res.json({ error: 'Not ready' });
    }
});

app.post('/api/downloads/bulk-delete', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId || !authenticatedSessions.has(sessionId)) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (statusDownloader && req.body.ids) {
        const result = statusDownloader.bulkDelete ? 
            statusDownloader.bulkDelete(req.body.ids) : 
            { success: false };
        io.emit('downloadStats', statusDownloader.getStats());
        res.json(result);
    } else {
        res.json({ error: 'Invalid request' });
    }
});

app.delete('/api/downloads', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId || !authenticatedSessions.has(sessionId)) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (statusDownloader) {
        const keepFavorites = req.query.keepFavorites === 'true';
        const result = statusDownloader.clearAll(keepFavorites);
        io.emit('downloadStats', statusDownloader.getStats());
        res.json(result);
    } else {
        res.json({ error: 'Not ready' });
    }
});

app.post('/api/downloads/:id/favorite', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId || !authenticatedSessions.has(sessionId)) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (statusDownloader && statusDownloader.toggleFavorite) {
        const result = statusDownloader.toggleFavorite(req.params.id);
        res.json(result);
    } else {
        res.json({ error: 'Not supported' });
    }
});

app.get('/api/downloads/contacts/list', (req, res) => {
    if (statusDownloader && statusDownloader.getContacts) {
        res.json(statusDownloader.getContacts());
    } else {
        res.json([]);
    }
});

app.get('/api/downloads/view/timeline', (req, res) => {
    if (statusDownloader && statusDownloader.getTimeline) {
        res.json(statusDownloader.getTimeline());
    } else {
        res.json([]);
    }
});

app.post('/api/downloads/bulk-download', async (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId || !authenticatedSessions.has(sessionId)) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (statusDownloader && statusDownloader.createBulkDownload) {
        try {
            const result = await statusDownloader.createBulkDownload(
                req.body.ids,
                req.body.options || {}
            );
            res.json(result);
        } catch (e) {
            res.json({ error: e.message });
        }
    } else {
        res.json({ error: 'Bulk download not supported' });
    }
});

app.get('/api/downloads/settings', (req, res) => {
    if (statusDownloader && statusDownloader.getSettings) {
        res.json(statusDownloader.getSettings());
    } else {
        res.json({
            autoDownload: true,
            downloadImages: true,
            downloadVideos: true,
            downloadAudio: true,
            downloadText: true
        });
    }
});

app.post('/api/downloads/settings', (req, res) => {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId || !authenticatedSessions.has(sessionId)) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (statusDownloader && statusDownloader.updateSettings) {
        const result = statusDownloader.updateSettings(req.body);
        res.json(result);
    } else {
        res.json({ error: 'Not supported' });
    }
});


app.get('/api/debug/downloads', (req, res) => {
    const dataFile = path.join(__dirname, '..', 'data', 'statusMedia.json');
    const downloadsDir = path.join(__dirname, '..', 'downloads');
    
    let fileExists = fs.existsSync(dataFile);
    let fileContent = [];
    let folderStats = {};
    
    if (fileExists) {
        try {
            fileContent = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        } catch (e) {
            fileContent = { error: e.message };
        }
    }

    ['images', 'videos', 'audio', 'stickers', 'documents'].forEach(folder => {
        const folderPath = path.join(downloadsDir, folder);
        if (fs.existsSync(folderPath)) {
            folderStats[folder] = fs.readdirSync(folderPath).length;
        } else {
            folderStats[folder] = 0;
        }
    });
    
    res.json({
        dataFileExists: fileExists,
        dataFilePath: dataFile,
        itemsInDataFile: Array.isArray(fileContent) ? fileContent.length : 0,
        downloaderLoaded: !!statusDownloader,
        folderStats,
        sampleData: Array.isArray(fileContent) ? fileContent.slice(0, 3) : []
    });
});


io.on('connection', (socket) => {
    console.log('📊 Dashboard client connected:', socket.id);
    
    let bot;
    try {
        bot = require('../index');
    } catch (e) {
        console.log('Bot module not ready yet');
    }
    
    if (bot) {
        socket.emit('stats', bot.getStats());
        socket.emit('logs', bot.getLogs());
        socket.emit('state', bot.getState());
        socket.emit('selectedEmojis', bot.getSelectedEmojis());
        socket.emit('availableEmojis', bot.getAvailableEmojis());
        socket.emit('connectionMethod', config.connectionMethod);
        
        if (bot.getQR()) {
            socket.emit('qrCode', bot.getQR());
        }
        
        if (bot.getPairingCode()) {
            socket.emit('pairingCode', bot.getPairingCode());
        }
        
        socket.emit('connectionStatus', { connected: bot.isConnected() });
    }

    if (statusDownloader) {
        socket.emit('downloadStats', statusDownloader.getStats());
    }

    socket.on('authenticate', (password) => {
        if (password === config.dashboard.password) {
            authenticatedSessions.add(socket.id);
            socket.emit('authenticated', true);
            socket.emit('sessionId', socket.id);
            console.log('✅ Dashboard authenticated:', socket.id);
        } else {
            socket.emit('authenticated', false);
            console.log('❌ Dashboard auth failed:', socket.id);
        }
    });

    socket.on('toggleFeature', (data) => {
        if (!authenticatedSessions.has(socket.id)) {
            socket.emit('error', 'Not authenticated');
            return;
        }
        
        if (!bot) {
            socket.emit('error', 'Bot not ready');
            return;
        }
        
        const { feature, value } = data;
        const currentState = bot.getState();
        currentState[feature] = value;
        bot.setState(currentState);
        
        io.emit('stateUpdate', currentState);
        io.emit('stats', bot.getStats());
    });
    
    socket.on('updateEmojis', (emojis) => {
        console.log('📥 Received updateEmojis:', emojis);
        
        if (!authenticatedSessions.has(socket.id)) {
            console.log('❌ Not authenticated for emoji update');
            socket.emit('error', 'Not authenticated');
            socket.emit('emojiSaveResult', { success: false, message: 'Not authenticated' });
            return;
        }
        
        if (!bot) {
            socket.emit('emojiSaveResult', { success: false, message: 'Bot not ready' });
            return;
        }
        
        if (!Array.isArray(emojis)) {
            console.log('❌ Invalid emojis format');
            socket.emit('emojiSaveResult', { success: false, message: 'Invalid format' });
            return;
        }
        
        try {
            const result = bot.setEmojis(emojis);
            console.log('💾 Emoji save result:', result);
            
            io.emit('selectedEmojis', emojis);
            io.emit('stats', bot.getStats());
            
            socket.emit('emojiSaveResult', { 
                success: true, 
                message: 'Emojis saved successfully!',
                emojis: emojis 
            });
            
            console.log('✅ Emojis updated and broadcasted:', emojis);
        } catch (error) {
            console.error('❌ Error saving emojis:', error);
            socket.emit('emojiSaveResult', { 
                success: false, 
                message: error.message 
            });
        }
    });
    
    socket.on('submitPhoneNumber', (phoneNumber) => {
        if (!authenticatedSessions.has(socket.id)) {
            socket.emit('error', 'Not authenticated');
            return;
        }
        
        if (bot) {
            bot.setPhoneNumber(phoneNumber);
            socket.emit('phoneNumberSubmitted', true);
        }
    });
    
    socket.on('getStats', () => {
        if (bot) {
            socket.emit('stats', bot.getStats());
        }
    });
    
    
    socket.on('getDownloadStats', () => {
        if (statusDownloader) {
            socket.emit('downloadStats', statusDownloader.getStats());
        }
    });
    
    socket.on('getDownloads', (options) => {
        if (statusDownloader) {
            const result = statusDownloader.getMediaList(options || {});
            socket.emit('downloadsList', result);
        } else {
            socket.emit('downloadsList', { data: [], total: 0 });
        }
    });
    
    socket.on('deleteDownload', (id) => {
        if (!authenticatedSessions.has(socket.id)) {
            socket.emit('error', 'Not authenticated');
            return;
        }
        
        if (statusDownloader) {
            const result = statusDownloader.deleteMedia(id);
            socket.emit('deleteResult', result);
            io.emit('downloadStats', statusDownloader.getStats());
        }
    });
    
    socket.on('clearAllDownloads', (keepFavorites) => {
        if (!authenticatedSessions.has(socket.id)) {
            socket.emit('error', 'Not authenticated');
            return;
        }
        
        if (statusDownloader) {
            const result = statusDownloader.clearAll(keepFavorites);
            socket.emit('clearResult', result);
            io.emit('downloadStats', statusDownloader.getStats());
        }
    });
    
    socket.on('toggleFavorite', (id) => {
        if (!authenticatedSessions.has(socket.id)) {
            socket.emit('error', 'Not authenticated');
            return;
        }
        
        if (statusDownloader && statusDownloader.toggleFavorite) {
            const result = statusDownloader.toggleFavorite(id);
            socket.emit('favoriteResult', result);
        }
    });
    
    socket.on('updateDownloadSettings', (settings) => {
        if (!authenticatedSessions.has(socket.id)) {
            socket.emit('error', 'Not authenticated');
            return;
        }
        
        if (statusDownloader && statusDownloader.updateSettings) {
            const result = statusDownloader.updateSettings(settings);
            socket.emit('settingsUpdated', result);
        }
    });
    
    socket.on('disconnect', () => {
        authenticatedSessions.delete(socket.id);
        console.log('📊 Dashboard client disconnected:', socket.id);
    });
});

function emitNewDownload(entry) {
    io.emit('newDownload', entry);
    if (statusDownloader) {
        io.emit('downloadStats', statusDownloader.getStats());
    }
}

function startDashboard() {
    server.listen(config.dashboard.port, () => {
        console.log(`\n🌐 Dashboard: http://localhost:${config.dashboard.port}`);
        console.log(`📥 Downloads: http://localhost:${config.dashboard.port}/downloads.html`);
        console.log(`🔧 Debug: http://localhost:${config.dashboard.port}/api/debug/downloads\n`);
    });
}

module.exports = { startDashboard, io, app, emitNewDownload };
