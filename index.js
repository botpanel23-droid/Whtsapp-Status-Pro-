const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    delay,
    makeCacheableSignalKeyStore,
    proto,
    getContentType
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const config = require('./config');
const banProtection = require('./banProtection');

const dataDir = path.join(__dirname, 'data');
const statsFilePath = path.join(dataDir, 'stats.json');
const logsFilePath = path.join(dataDir, 'logs.json');
const stateFilePath = path.join(dataDir, 'state.json');
const emojisFilePath = path.join(dataDir, 'emojis.json');

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

let dashboardModule = null;
let io = null;
try {
    dashboardModule = require('./dashboard/server');
    io = dashboardModule.io;
} catch (e) {
    console.log('Dashboard module not loaded');
}

let statusDownloader = null;
try {
    statusDownloader = require('./statusDownloader');
} catch (e) {
    console.log('Status downloader not loaded');
}

let sock = null;
let qrCodeData = null;
let pairingCode = null;
let isConnected = false;
let phoneNumber = null;
let pairingCodeRequested = false;
let downloadEnabled = true;

let stats = {
    viewed: 0,
    liked: 0,
    replied: 0,
    skipped: 0,
    errors: 0,
    downloaded: 0,
    startTime: new Date().toISOString(),
    lastActivity: null
};

let logs = [];

let commandState = {
    autoView: config.features?.autoViewStatus ?? true,
    autoLike: config.features?.autoLikeStatus ?? true,
    autoReply: config.features?.autoReplyStatus ?? false,
    botEnabled: true
};

let selectedEmojis = [...(config.reactions || ['❤️', '🔥', '😍', '👏', '😂', '🎉'])];


function loadEmojis() {
    try {
        if (fs.existsSync(emojisFilePath)) {
            const data = fs.readFileSync(emojisFilePath, 'utf8');
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        }
    } catch (e) {
        console.error('Error loading emojis:', e.message);
    }
    return [...(config.reactions || ['❤️', '🔥', '😍'])];
}

function saveEmojis(emojis) {
    try {
        fs.writeFileSync(emojisFilePath, JSON.stringify(emojis, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Error saving emojis:', e.message);
        return false;
    }
}

function loadData() {
    try {
        if (fs.existsSync(statsFilePath)) {
            stats = { ...stats, ...JSON.parse(fs.readFileSync(statsFilePath, 'utf8')) };
        }
        if (fs.existsSync(logsFilePath)) {
            logs = JSON.parse(fs.readFileSync(logsFilePath, 'utf8'));
        }
        if (fs.existsSync(stateFilePath)) {
            commandState = { ...commandState, ...JSON.parse(fs.readFileSync(stateFilePath, 'utf8')) };
        }
        selectedEmojis = loadEmojis();
    } catch (e) {
        console.log('Starting with fresh data');
    }
}

function saveData() {
    try {
        fs.writeFileSync(statsFilePath, JSON.stringify(stats, null, 2), 'utf8');
        fs.writeFileSync(logsFilePath, JSON.stringify(logs.slice(-500), null, 2), 'utf8');
        fs.writeFileSync(stateFilePath, JSON.stringify(commandState, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving data:', e.message);
    }
}

function addLog(message, type = 'INFO', details = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        time: new Date().toLocaleTimeString(),
        message,
        type,
        details
    };
    
    logs.unshift(entry);
    if (logs.length > 500) logs = logs.slice(0, 500);
    
    saveData();
    
    if (io) io.emit('newLog', entry);
    
    const colors = {
        INFO: '\x1b[36m',
        SUCCESS: '\x1b[32m',
        ERROR: '\x1b[31m',
        WARN: '\x1b[33m',
        SKIP: '\x1b[35m',
        RESET: '\x1b[0m'
    };
    console.log(`${colors[type] || colors.INFO}[${entry.time}] [${type}] ${message}${colors.RESET}`);
}

function getRandomReaction() {
    if (!selectedEmojis || selectedEmojis.length === 0) return '❤️';
    return selectedEmojis[Math.floor(Math.random() * selectedEmojis.length)];
}

function emitStateUpdate() {
    if (io) {
        io.emit('stateUpdate', commandState);
        io.emit('stats', getFullStats());
        io.emit('selectedEmojis', selectedEmojis);
    }
}

function getFullStats() {
    const uptimeMs = Date.now() - new Date(stats.startTime).getTime();
    const hours = Math.floor(uptimeMs / 3600000);
    const minutes = Math.floor((uptimeMs % 3600000) / 60000);
    
    return {
        ...stats,
        ...commandState,
        uptime: `${hours}h ${minutes}m`,
        banProtection: banProtection.getStatus(),
        connected: isConnected,
        selectedEmojis: selectedEmojis
    };
}

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function formatPairingCode(code) {
    if (!code) return '';
    const cleanCode = code.toString().replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (cleanCode.length === 8) {
        return cleanCode.slice(0, 4) + '-' + cleanCode.slice(4);
    }
    return cleanCode;
}

async function viewStatus(msg) {
    try {
        const key = msg.key;
        const participant = key.participant;
        
        if (!participant) {
            console.log('⚠️ No participant found for status');
            return false;
        }

        await sock.sendReceipt(
            key.remoteJid,      
            participant,         
            [key.id],           
            'read'              
        );

        console.log('   ✅ Status viewed successfully (sendReceipt)');
        return true;

    } catch (error) {
        console.log('   ⚠️ sendReceipt failed, trying alternative method...');
        
        try {
            await sock.readMessages([{
                remoteJid: msg.key.remoteJid,
                id: msg.key.id,
                participant: msg.key.participant
            }]);
            
            console.log('   ✅ Status viewed successfully (readMessages)');
            return true;
            
        } catch (error2) {
            console.log('   ⚠️ readMessages also failed, trying method 3...');
            
            try {
                await sock.sendPresenceUpdate('available', msg.key.participant);
                await delay(500);
                
                const node = {
                    tag: 'receipt',
                    attrs: {
                        id: msg.key.id,
                        to: msg.key.participant,
                        type: 'read',
                        t: Math.floor(Date.now() / 1000).toString()
                    }
                };

                if (sock.sendNode) {
                    await sock.sendNode(node);
                }
                
                return true;
                
            } catch (error3) {
                console.error('   ❌ All view methods failed:', error3.message);
                return false;
            }
        }
    }
}

async function reactToStatus(msg, emoji) {
    try {
        const key = msg.key;
        const participant = key.participant;
        
        if (!participant) {
            console.log('⚠️ No participant found for reaction');
            return false;
        }

        await sock.sendMessage(
            'status@broadcast',  
            {
                react: {
                    text: emoji,
                    key: {
                        remoteJid: key.remoteJid,
                        id: key.id,
                        participant: key.participant,
                        fromMe: false
                    }
                }
            },
            {
                statusJidList: [participant]  
            }
        );

        console.log(`   ${emoji} Reacted successfully`);
        return true;

    } catch (error) {
        console.error('   ❌ React failed:', error.message);

        try {
            await sock.sendMessage(
                msg.key.participant,  
                {
                    react: {
                        text: emoji,
                        key: msg.key
                    }
                }
            );
            console.log(`   ${emoji} Reacted (alternative method)`);
            return true;
        } catch (error2) {
            console.error('   ❌ Alternative react also failed:', error2.message);
            return false;
        }
    }
}

function getSenderInfo(msg) {
    try {
        const participant = msg.key.participant;
        
        if (!participant) {
            return null;
        }
        
        const senderNumber = participant.split('@')[0];
        const senderName = msg.pushName || senderNumber;
        
        return {
            sender: participant,
            senderNumber: senderNumber,
            senderName: senderName
        };
    } catch (e) {
        return null;
    }
}

function getStatusType(msg) {
    try {
        const m = msg.message;
        if (!m) return 'Unknown';
        
        const type = getContentType(m);
        
        if (type === 'imageMessage') return 'Image';
        if (type === 'videoMessage') return 'Video';
        if (type === 'extendedTextMessage') return 'Text';
        if (type === 'audioMessage') return 'Audio';
        if (type === 'stickerMessage') return 'Sticker';
        if (type === 'documentMessage') return 'Document';
        
        return type || 'Unknown';
    } catch (e) {
        return 'Unknown';
    }
}

async function handleStatus(msg) {
    try {
        if (!commandState.botEnabled) {
            return;
        }

        const senderInfo = getSenderInfo(msg);
        
        if (!senderInfo) {
            console.log('⚠️ Could not get sender info');
            stats.skipped++;
            saveData();
            return;
        }

        const { sender, senderNumber, senderName } = senderInfo;

        if (msg.key.fromMe) {
            return;
        }

        if (config.filters?.excludeNumbers?.includes(senderNumber)) {
            addLog(`Skipped ${senderName} (excluded)`, 'SKIP');
            stats.skipped++;
            saveData();
            return;
        }

        if (config.filters?.onlyTheseNumbers?.length > 0 && 
            !config.filters.onlyTheseNumbers.includes(senderNumber)) {
            stats.skipped++;
            saveData();
            return;
        }

        const canAct = await banProtection.canPerformAction();
        if (!canAct.allowed) {
            addLog(`Skipped: ${canAct.reason}`, 'SKIP', { sender: senderName });
            stats.skipped++;
            saveData();
            emitStateUpdate();
            return;
        }

        const statusType = getStatusType(msg);

        console.log('\n' + '═'.repeat(50));
        console.log('📸 NEW STATUS DETECTED');
        console.log('═'.repeat(50));
        console.log(`👤 Name: ${senderName}`);
        console.log(`📱 Number: +${senderNumber}`);
        console.log(`📝 Type: ${statusType}`);
        console.log(`🔑 ID: ${msg.key.id}`);
        console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
        console.log('═'.repeat(50));

        addLog(`New status from ${senderName} (${statusType})`, 'INFO');

        if (statusDownloader && downloadEnabled) {
            try {
                const downloadResult = await statusDownloader.downloadStatus(sock, msg, senderInfo);
                if (downloadResult.success) {
                    stats.downloaded = (stats.downloaded || 0) + 1;
                    addLog(`📥 Downloaded ${downloadResult.type} from ${senderName}`, 'SUCCESS');
                    
                    if (io) {
                        io.emit('newDownload', downloadResult.entry);
                        io.emit('downloadStats', statusDownloader.getStats());
                    }
                }
            } catch (downloadError) {
                console.error('Download error:', downloadError.message);
            }
        }

        if (commandState.autoView) {
            const viewDelay = banProtection.getRandomDelay('view');
            console.log(`   ⏳ Waiting ${viewDelay}ms before viewing...`);
            await delay(viewDelay);
            
            try {
                const viewSuccess = await viewStatus(msg);
                
                if (viewSuccess) {
                    stats.viewed++;
                    stats.lastActivity = new Date().toISOString();
                    banProtection.recordAction();
                    addLog(`✅ Viewed status from ${senderName}`, 'SUCCESS');
                } else {
                    stats.errors++;
                    addLog(`Failed to view status from ${senderName}`, 'ERROR');
                }
                
                saveData();
                emitStateUpdate();
            } catch (e) {
                stats.errors++;
                addLog(`View error: ${e.message}`, 'ERROR');
                saveData();
            }
        }

        if (commandState.autoLike) {
            const likeDelay = banProtection.getRandomDelay('like');
            console.log(`   ⏳ Waiting ${likeDelay}ms before reacting...`);
            await delay(likeDelay);
            
            const emoji = getRandomReaction();
            
            try {
                const reactSuccess = await reactToStatus(msg, emoji);
                
                if (reactSuccess) {
                    stats.liked++;
                    stats.lastActivity = new Date().toISOString();
                    banProtection.recordAction();
                    addLog(`${emoji} Reacted to ${senderName}'s status`, 'SUCCESS');
                } else {
                    stats.errors++;
                    addLog(`Failed to react to ${senderName}'s status`, 'ERROR');
                }
                
                saveData();
                emitStateUpdate();
            } catch (e) {
                stats.errors++;
                addLog(`React error: ${e.message}`, 'ERROR');
                saveData();
            }
        }

        if (commandState.autoReply) {
            const replyDelay = banProtection.getRandomDelay('reply');
            console.log(`   ⏳ Waiting ${replyDelay}ms before replying...`);
            await delay(replyDelay);
            
            try {
                await sock.sendMessage(sender, { 
                    text: config.replyMessage || 'Nice status! 🔥' 
                });
                stats.replied++;
                stats.lastActivity = new Date().toISOString();
                banProtection.recordAction();
                addLog(`💬 Replied to ${senderName}`, 'SUCCESS');
                saveData();
                emitStateUpdate();
            } catch (e) {
                stats.errors++;
                addLog(`Reply error: ${e.message}`, 'ERROR');
                saveData();
            }
        }

        console.log('═'.repeat(50) + '\n');

    } catch (error) {
        stats.errors++;
        addLog(`Error: ${error.message}`, 'ERROR');
        console.error('Status handling error:', error);
        saveData();
    }
}

async function handleCommand(text, msg) {
    if (!text) return;
    
    const cmd = text.toLowerCase().trim();
    
    const commands = {
        '.view on': () => { commandState.autoView = true; addLog('Auto View: ON ✅', 'SUCCESS'); },
        '.view off': () => { commandState.autoView = false; addLog('Auto View: OFF ❌', 'WARN'); },
        '.like on': () => { commandState.autoLike = true; addLog('Auto Like: ON ✅', 'SUCCESS'); },
        '.like off': () => { commandState.autoLike = false; addLog('Auto Like: OFF ❌', 'WARN'); },
        '.reply on': () => { commandState.autoReply = true; addLog('Auto Reply: ON ✅', 'SUCCESS'); },
        '.reply off': () => { commandState.autoReply = false; addLog('Auto Reply: OFF ❌', 'WARN'); },
        '.bot on': () => { commandState.botEnabled = true; addLog('Bot: ON ✅', 'SUCCESS'); },
        '.bot off': () => { commandState.botEnabled = false; addLog('Bot: OFF ❌', 'WARN'); },
        '.status': async () => {
            const statusText = `🤖 *BOT STATUS*
━━━━━━━━━━━━━━━━
⚡ Bot: ${commandState.botEnabled ? '✅ ON' : '❌ OFF'}
👁️ Auto View: ${commandState.autoView ? '✅ ON' : '❌ OFF'}
❤️ Auto Like: ${commandState.autoLike ? '✅ ON' : '❌ OFF'}
💬 Auto Reply: ${commandState.autoReply ? '✅ ON' : '❌ OFF'}

📊 *STATS*
━━━━━━━━━━━━━━━━
👁️ Viewed: ${stats.viewed}
❤️ Liked: ${stats.liked}
💬 Replied: ${stats.replied}
📥 Downloaded: ${stats.downloaded || 0}

🎭 *EMOJIS*: ${selectedEmojis.slice(0, 5).join(' ')}`;
            
            await sock.sendMessage(msg.key.remoteJid, { text: statusText });
        },
        '.stats': async () => {
            const statsText = `📊 *STATISTICS*
━━━━━━━━━━━━━━━━
👁️ Viewed: ${stats.viewed}
❤️ Liked: ${stats.liked}
💬 Replied: ${stats.replied}
⏭️ Skipped: ${stats.skipped}
❌ Errors: ${stats.errors}
📥 Downloaded: ${stats.downloaded || 0}
⏱️ Uptime: ${getFullStats().uptime}`;
            
            await sock.sendMessage(msg.key.remoteJid, { text: statsText });
        },
        '.help': async () => {
            const helpText = `📖 *COMMANDS*
━━━━━━━━━━━━━━━━
*.view on/off* - Toggle auto view
*.like on/off* - Toggle auto like
*.reply on/off* - Toggle auto reply
*.bot on/off* - Enable/disable bot
*.status* - Show status
*.stats* - Show statistics
*.emojis* - Show emojis
*.help* - Show help

🌐 Dashboard: http://localhost:${config.dashboard?.port || 3000}`;
            
            await sock.sendMessage(msg.key.remoteJid, { text: helpText });
        },
        '.emojis': async () => {
            const emojisText = `🎭 *SELECTED EMOJIS*
━━━━━━━━━━━━━━━━
${selectedEmojis.join(' ')}

Use dashboard to change emojis.`;
            
            await sock.sendMessage(msg.key.remoteJid, { text: emojisText });
        }
    };
    
    if (commands[cmd]) {
        await commands[cmd]();
        saveData();
        emitStateUpdate();
    }
}

function showBanner() {
    console.clear();
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║      🤖 WHATSAPP STATUS BOT PRO v3.1 - CONNECTED 🤖           ║
╠═══════════════════════════════════════════════════════════════╣
║  📊 FEATURES:                                                 ║
║  ├── Auto View:  ${commandState.autoView ? '✅ ON ' : '❌ OFF'}                                     ║
║  ├── Auto Like:  ${commandState.autoLike ? '✅ ON ' : '❌ OFF'}                                     ║
║  └── Auto Reply: ${commandState.autoReply ? '✅ ON ' : '❌ OFF'}                                     ║
║                                                               ║
║  🎭 EMOJIS: ${selectedEmojis.slice(0, 8).join(' ')}                    ║
║                                                               ║
║  🛡️  BAN PROTECTION: ${config.banProtection?.enabled ? '✅ ACTIVE' : '❌ DISABLED'}                           ║
║  🌐 DASHBOARD: http://localhost:${config.dashboard?.port || 3000}                      ║
╠═══════════════════════════════════════════════════════════════╣
║  📝 COMMANDS: .view .like .reply .bot .status .stats .help    ║
╚═══════════════════════════════════════════════════════════════╝
    `);
}

async function startBot() {
    loadData();
    
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    console.log(`\n📱 Using WA Version: ${version.join('.')}\n`);

    const needsPairing = !state.creds?.registered;

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: config.connectionMethod === 'qr',
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        browser: ['Ubuntu', 'Chrome', '114.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,  
        generateHighQualityLinkPreview: false,
        getMessage: async (key) => {
            return { conversation: '' };
        }
    });


    if (needsPairing && config.connectionMethod === 'phone') {
        pairingCodeRequested = false;
        pairingCode = null;
        
        if (!phoneNumber) {
            console.log('\n╔══════════════════════════════════════════════════════╗');
            console.log('║           📱 PHONE NUMBER PAIRING                    ║');
            console.log('╠══════════════════════════════════════════════════════╣');
            console.log('║  Enter phone number WITH country code                ║');
            console.log('║  Example: 947XXXXXXX (Sri Lanka)                       ║');
            console.log('║  NO + symbol, NO spaces, NO dashes                   ║');
            console.log('╚══════════════════════════════════════════════════════╝\n');
            
            phoneNumber = await askQuestion('📞 Enter phone number: ');
        }
        
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
        
        if (phoneNumber.length < 10 || phoneNumber.length > 15) {
            console.log('\n❌ Invalid phone number!\n');
            process.exit(1);
        }

        console.log(`\n📱 Phone: +${phoneNumber}`);
        console.log('⏳ Requesting pairing code...\n');
        
        await delay(3000);
        
        try {
            if (!pairingCodeRequested) {
                pairingCodeRequested = true;
                const rawCode = await sock.requestPairingCode(phoneNumber);
                pairingCode = formatPairingCode(rawCode);
                
                console.log('╔══════════════════════════════════════════════════════╗');
                console.log('║              🔐 PAIRING CODE                         ║');
                console.log('╠══════════════════════════════════════════════════════╣');
                console.log(`║                                                      ║`);
                console.log(`║           📱  CODE:  ${pairingCode}                     ║`);
                console.log(`║                                                      ║`);
                console.log('╠══════════════════════════════════════════════════════╣');
                console.log('║  1. Open WhatsApp → Settings → Linked Devices        ║');
                console.log('║  2. Tap "Link a Device"                              ║');
                console.log('║  3. Tap "Link with phone number instead"             ║');
                console.log('║  4. Enter the 8-digit code above                     ║');
                console.log('╚══════════════════════════════════════════════════════╝\n');
                
                if (io) io.emit('pairingCode', pairingCode);
            }
        } catch (error) {
            console.error('❌ Pairing code error:', error.message);
            pairingCodeRequested = false;
            phoneNumber = null;
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && config.connectionMethod === 'qr') {
            qrCodeData = await QRCode.toDataURL(qr);
            console.log('\n📱 Scan QR Code:\n');
            qrcode.generate(qr, { small: true });
            if (io) io.emit('qrCode', qrCodeData);
        }

        if (connection === 'close') {
            isConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(`\n❌ Disconnected. Code: ${statusCode}`);
            addLog(`Disconnected (Code: ${statusCode})`, 'WARN');
            
            if (io) io.emit('connectionStatus', { connected: false });
            
            if (shouldReconnect) {
                console.log('🔄 Reconnecting in 5 seconds...\n');
                pairingCodeRequested = false;
                pairingCode = null;
                phoneNumber = null;
                setTimeout(() => startBot(), 5000);
            } else {
                console.log('\n🚪 Logged out! Delete auth_info folder and restart.\n');
            }
        }

        if (connection === 'open') {
            isConnected = true;
            qrCodeData = null;
            pairingCode = null;
            
            showBanner();
            addLog('✅ Connected successfully!', 'SUCCESS');
            
            if (io) {
                io.emit('connectionStatus', { connected: true });
                io.emit('stats', getFullStats());
                io.emit('selectedEmojis', selectedEmojis);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        
        for (const msg of messages) {
            try {
                if (!msg.message) continue;
                
                const remoteJid = msg.key?.remoteJid;

                if (remoteJid === 'status@broadcast') {
                    console.log('\n📨 Status message received from:', msg.key.participant);
                    await handleStatus(msg);
                    continue;
                }

                if (msg.key?.fromMe) {
                    const text = msg.message?.conversation || 
                                msg.message?.extendedTextMessage?.text || '';
                    
                    if (text.startsWith('.')) {
                        await handleCommand(text, msg);
                    }
                }
            } catch (e) {
                console.error('Message processing error:', e.message);
            }
        }
    });

    sock.ev.on('messages.update', async (updates) => {
        // This can help track status updates
        for (const update of updates) {
            if (update.key?.remoteJid === 'status@broadcast') {
                console.log('📊 Status update event:', update);
            }
        }
    });

    return sock;
}

module.exports = {
    getStats: getFullStats,
    getLogs: () => logs,
    getQR: () => qrCodeData,
    getPairingCode: () => pairingCode,
    getState: () => commandState,
    getSelectedEmojis: () => [...selectedEmojis],
    getAvailableEmojis: () => config.availableEmojis || [],
    setState: (newState) => {
        commandState = { ...commandState, ...newState };
        saveData();
        emitStateUpdate();
    },
    setEmojis: (emojis) => {
        if (!Array.isArray(emojis)) return false;
        selectedEmojis = [...emojis];
        saveEmojis(selectedEmojis);
        emitStateUpdate();
        return true;
    },
    setPhoneNumber: (number) => {
        phoneNumber = number.replace(/[^0-9]/g, '');
    },
    isConnected: () => isConnected,
    getDownloadStats: () => statusDownloader?.getStats() || {},
    getDownloads: (options) => statusDownloader?.getMediaList(options) || { data: [] },
    deleteDownload: (id) => statusDownloader?.deleteMedia(id) || {},
    clearDownloads: () => statusDownloader?.clearAll() || {},
    setDownloadEnabled: (enabled) => { downloadEnabled = enabled; },
    isDownloadEnabled: () => downloadEnabled
};

async function main() {
    console.log('\n🚀 Starting WhatsApp Status Bot Pro v3.1...\n');
    console.log(`📡 Connection Method: ${config.connectionMethod?.toUpperCase() || 'PHONE'}\n`);
    
    if (dashboardModule && config.dashboard?.enabled) {
        dashboardModule.startDashboard();
    }
    
    await startBot();
}

main().catch(console.error);

process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down...');
    saveData();
    saveEmojis(selectedEmojis);
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});
