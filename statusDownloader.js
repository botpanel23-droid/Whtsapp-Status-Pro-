const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

class StatusDownloader {
    constructor() {
        this.downloadDir = path.join(__dirname, 'downloads');
        this.dataDir = path.join(__dirname, 'data');
        this.mediaDataFile = path.join(this.dataDir, 'statusMedia.json');
        
        this.mediaData = [];
        
        this.initDirectories();
        this.loadMediaData();
    }

    initDirectories() {
        const dirs = [
            this.downloadDir,
            this.dataDir,
            path.join(this.downloadDir, 'images'),
            path.join(this.downloadDir, 'videos'),
            path.join(this.downloadDir, 'audio'),
            path.join(this.downloadDir, 'stickers'),
            path.join(this.downloadDir, 'documents')
        ];

        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`📁 Created directory: ${dir}`);
            }
        });
    }

    loadMediaData() {
        try {
            if (fs.existsSync(this.mediaDataFile)) {
                const data = fs.readFileSync(this.mediaDataFile, 'utf8');
                this.mediaData = JSON.parse(data);
                console.log(`📂 Loaded ${this.mediaData.length} media items`);
            } else {
                this.mediaData = [];
                this.saveMediaData();
            }
        } catch (e) {
            console.error('Error loading media data:', e.message);
            this.mediaData = [];
        }
    }

    saveMediaData() {
        try {
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }
            fs.writeFileSync(this.mediaDataFile, JSON.stringify(this.mediaData, null, 2));
            console.log(`💾 Saved ${this.mediaData.length} media items`);
        } catch (e) {
            console.error('Error saving media data:', e.message);
        }
    }

    getMediaType(msg) {
        const m = msg.message;
        if (!m) return null;

        if (m.imageMessage) return { type: 'image', ext: 'jpg', folder: 'images', message: m.imageMessage };
        if (m.videoMessage) return { type: 'video', ext: 'mp4', folder: 'videos', message: m.videoMessage };
        if (m.audioMessage) return { type: 'audio', ext: 'mp3', folder: 'audio', message: m.audioMessage };
        if (m.stickerMessage) return { type: 'sticker', ext: 'webp', folder: 'stickers', message: m.stickerMessage };
        if (m.documentMessage) {
            const filename = m.documentMessage.fileName || 'document';
            const ext = filename.split('.').pop() || 'bin';
            return { type: 'document', ext, folder: 'documents', message: m.documentMessage };
        }

        return null;
    }

    async downloadStatus(sock, msg, senderInfo) {
        try {
            const mediaInfo = this.getMediaType(msg);

            if (!mediaInfo) {
                const textContent = msg.message?.extendedTextMessage?.text || 
                                   msg.message?.conversation || '';
                
                if (textContent) {
                    const entry = {
                        id: `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        type: 'text',
                        content: textContent,
                        sender: senderInfo.senderName,
                        senderNumber: senderInfo.senderNumber,
                        timestamp: new Date().toISOString(),
                        downloadedAt: new Date().toLocaleString()
                    };
                    
                    this.mediaData.unshift(entry);
                    this.saveMediaData();
                    
                    console.log(`📝 Saved text status from ${senderInfo.senderName}`);
                    return { success: true, type: 'text', entry };
                }
                return { success: false, reason: 'No content' };
            }

            console.log(`📥 Downloading ${mediaInfo.type} from ${senderInfo.senderName}...`);
            
            const buffer = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                {
                    logger: console,
                    reuploadRequest: sock.updateMediaMessage
                }
            );

            if (!buffer) {
                console.log('❌ Failed to download buffer');
                return { success: false, reason: 'Failed to download' };
            }

            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substr(2, 9);
            const filename = `${senderInfo.senderNumber}_${timestamp}_${randomId}.${mediaInfo.ext}`;
            const filePath = path.join(this.downloadDir, mediaInfo.folder, filename);

            fs.writeFileSync(filePath, buffer);
            console.log(`💾 Saved: ${filePath}`);

            const stats = fs.statSync(filePath);
            const fileSizeKB = (stats.size / 1024).toFixed(2);
            const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

            const entry = {
                id: `${mediaInfo.type}_${timestamp}_${randomId}`,
                type: mediaInfo.type,
                filename: filename,
                folder: mediaInfo.folder,
                path: `/downloads/${mediaInfo.folder}/${filename}`,
                size: stats.size > 1024 * 1024 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`,
                sizeBytes: stats.size,
                caption: mediaInfo.message?.caption || '',
                sender: senderInfo.senderName,
                senderNumber: senderInfo.senderNumber,
                timestamp: new Date().toISOString(),
                downloadedAt: new Date().toLocaleString()
            };

            this.mediaData.unshift(entry);
            this.saveMediaData();

            console.log(`✅ Downloaded: ${filename} (${entry.size})`);
            return { success: true, type: mediaInfo.type, entry };

        } catch (error) {
            console.error('❌ Download error:', error.message);
            return { success: false, reason: error.message };
        }
    }

    getMediaList(options = {}) {
        this.loadMediaData();
        
        let data = [...this.mediaData];

        console.log(`📊 getMediaList called. Total items: ${data.length}`);

        if (options.type && options.type !== 'all') {
            data = data.filter(item => item.type === options.type);
        }

        if (options.sender) {
            const searchTerm = options.sender.toLowerCase();
            data = data.filter(item => 
                item.senderNumber?.includes(options.sender) ||
                item.sender?.toLowerCase().includes(searchTerm)
            );
        }

        if (options.search) {
            const searchTerm = options.search.toLowerCase();
            data = data.filter(item => 
                item.caption?.toLowerCase().includes(searchTerm) ||
                item.content?.toLowerCase().includes(searchTerm) ||
                item.sender?.toLowerCase().includes(searchTerm)
            );
        }

        if (options.date) {
            const filterDate = new Date(options.date).toDateString();
            data = data.filter(item => 
                new Date(item.timestamp).toDateString() === filterDate
            );
        }

        const page = parseInt(options.page) || 1;
        const limit = parseInt(options.limit) || 20;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        const result = {
            data: data.slice(startIndex, endIndex),
            total: data.length,
            page,
            limit,
            totalPages: Math.ceil(data.length / limit) || 1,
            hasMore: endIndex < data.length
        };

        console.log(`📊 Returning ${result.data.length} items (page ${page}/${result.totalPages})`);
        
        return result;
    }

    getStats() {
        this.loadMediaData();
        
        let totalSize = 0;
        const stats = {
            total: this.mediaData.length,
            images: 0,
            videos: 0,
            audio: 0,
            text: 0,
            stickers: 0,
            documents: 0
        };

        this.mediaData.forEach(m => {
            if (m.type === 'image') stats.images++;
            else if (m.type === 'video') stats.videos++;
            else if (m.type === 'audio') stats.audio++;
            else if (m.type === 'text') stats.text++;
            else if (m.type === 'sticker') stats.stickers++;
            else if (m.type === 'document') stats.documents++;
            
            if (m.sizeBytes) totalSize += m.sizeBytes;
        });

        stats.totalSizeBytes = totalSize;
        stats.totalSize = totalSize > 1024 * 1024 
            ? `${(totalSize / (1024 * 1024)).toFixed(2)} MB`
            : `${(totalSize / 1024).toFixed(2)} KB`;

        console.log('📊 Stats:', stats);
        return stats;
    }

    deleteMedia(id) {
        const index = this.mediaData.findIndex(m => m.id === id);
        if (index === -1) return { success: false, reason: 'Not found' };

        const item = this.mediaData[index];
        
        if (item.filename && item.folder) {
            const filePath = path.join(this.downloadDir, item.folder, item.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Deleted file: ${filePath}`);
            }
        }

        this.mediaData.splice(index, 1);
        this.saveMediaData();

        return { success: true };
    }

    clearAll() {
        const folders = ['images', 'videos', 'audio', 'stickers', 'documents'];
        
        folders.forEach(folder => {
            const folderPath = path.join(this.downloadDir, folder);
            if (fs.existsSync(folderPath)) {
                const files = fs.readdirSync(folderPath);
                files.forEach(file => {
                    fs.unlinkSync(path.join(folderPath, file));
                });
            }
        });

        this.mediaData = [];
        this.saveMediaData();
        
        console.log('🗑️ Cleared all downloads');
        return { success: true };
    }
}

module.exports = new StatusDownloader();