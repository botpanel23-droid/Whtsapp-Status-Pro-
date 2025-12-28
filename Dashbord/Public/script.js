const socket = io();
let isAuthenticated = false;
let selectedEmojis = [];
let availableEmojis = [];
let connectionMethod = 'qr';
const emojiCategories = {
    hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '💝', '💘', '💕', '💗', '💓', '💞'],
    faces: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😛', '😜', '🤪', '😝'],
    gestures: ['👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👋', '🤚', '🖐️', '✋', '👏', '🙌', '🤝', '🙏', '💪'],
    fire: ['🔥', '⭐', '🌟', '✨', '💫', '⚡', '☀️', '🌈', '💥', '💢', '💯', '🎯', '🏆', '🥇', '🎖️'],
    celebration: ['🎉', '🎊', '🎈', '🎁', '🎀', '🎂', '🍰', '🧁', '🥳', '🪅', '🎆', '🎇', '🧨'],
    nature: ['🌸', '🌹', '🌺', '🌻', '🌼', '🌷', '🌱', '🌿', '🍀', '🍁', '🍂', '🍃', '🌴', '🦋', '🐝'],
    objects: ['💎', '💍', '👑', '🎩', '🎭', '🎨', '🎬', '🎤', '🎧', '🎵', '🎶', '🎸', '🎹', '💮', '🏵️']
};
const loginModal = document.getElementById('loginModal');
const dashboard = document.getElementById('dashboard');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');
const connectionSection = document.getElementById('connectionSection');
const qrSection = document.getElementById('qrSection');
const phoneSection = document.getElementById('phoneSection');
const qrImage = document.getElementById('qrImage');
const connectionStatus = document.getElementById('connectionStatus');
const logsContainer = document.getElementById('logsContainer');
const phoneNumberInput = document.getElementById('phoneNumberInput');
const phoneInputSection = document.getElementById('phoneInputSection');
const pairingCodeSection = document.getElementById('pairingCodeSection');
const pairingCodeDisplay = document.getElementById('pairingCodeDisplay');
const selectedEmojisContainer = document.getElementById('selectedEmojis');
const emojiPicker = document.getElementById('emojiPicker');
const viewedCount = document.getElementById('viewedCount');
const likedCount = document.getElementById('likedCount');
const repliedCount = document.getElementById('repliedCount');
const skippedCount = document.getElementById('skippedCount');
const errorCount = document.getElementById('errorCount');
const uptime = document.getElementById('uptime');
const lastActivity = document.getElementById('lastActivity');
const botEnabled = document.getElementById('botEnabled');
const autoView = document.getElementById('autoView');
const autoLike = document.getElementById('autoLike');
const autoReply = document.getElementById('autoReply');
const protectionStatus = document.getElementById('protectionStatus');
const hourlyProgress = document.getElementById('hourlyProgress');
const dailyProgress = document.getElementById('dailyProgress');
const hourlyCount = document.getElementById('hourlyCount');
const dailyCount = document.getElementById('dailyCount');
const cooldownStatus = document.getElementById('cooldownStatus');

function authenticate() {
    const password = passwordInput.value;
    socket.emit('authenticate', password);
}

passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') authenticate();
});

socket.on('authenticated', (success) => {
    if (success) {
        isAuthenticated = true;
        loginModal.classList.add('hidden');
        dashboard.classList.remove('hidden');
        loginError.textContent = '';
        console.log('✅ Authenticated successfully');
    } else {
        loginError.textContent = 'Invalid password!';
        passwordInput.value = '';
    }
});

socket.on('connectionMethod', (method) => {
    connectionMethod = method;
    updateConnectionUI();
});

function updateConnectionUI() {
    if (connectionMethod === 'qr') {
        qrSection.classList.remove('hidden');
        phoneSection.classList.add('hidden');
    } else {
        qrSection.classList.add('hidden');
        phoneSection.classList.remove('hidden');
    }
}

socket.on('qrCode', (qr) => {
    if (qr) {
        connectionSection.classList.remove('hidden');
        qrSection.classList.remove('hidden');
        qrImage.src = qr;
    }
});

socket.on('requestPhoneNumber', () => {
    connectionSection.classList.remove('hidden');
    phoneSection.classList.remove('hidden');
    phoneInputSection.classList.remove('hidden');
    pairingCodeSection.classList.add('hidden');
});

socket.on('pairingCode', (code) => {
    phoneInputSection.classList.add('hidden');
    pairingCodeSection.classList.remove('hidden');
    pairingCodeDisplay.textContent = code;
});

function submitPhoneNumber() {
    const phoneNumber = phoneNumberInput.value.replace(/[^0-9]/g, '');
    if (phoneNumber.length < 10) {
        alert('Please enter a valid phone number');
        return;
    }
    socket.emit('submitPhoneNumber', phoneNumber);
}

socket.on('phoneNumberSubmitted', () => {
    phoneInputSection.innerHTML = '<p>⏳ Requesting pairing code...</p>';
});

socket.on('connectionStatus', (data) => {
    if (data.connected) {
        connectionStatus.className = 'connection-status connected';
        connectionStatus.querySelector('.text').textContent = 'Connected';
        connectionSection.classList.add('hidden');
    } else {
        connectionStatus.className = 'connection-status disconnected';
        connectionStatus.querySelector('.text').textContent = 'Disconnected';
    }
});

socket.on('stats', (stats) => updateStats(stats));

function updateStats(stats) {
    if (viewedCount) viewedCount.textContent = stats.viewed || 0;
    if (likedCount) likedCount.textContent = stats.liked || 0;
    if (repliedCount) repliedCount.textContent = stats.replied || 0;
    if (skippedCount) skippedCount.textContent = stats.skipped || 0;
    if (errorCount) errorCount.textContent = stats.errors || 0;
    if (uptime) uptime.textContent = stats.uptime || '0h 0m';
    
    if (stats.lastActivity && lastActivity) {
        lastActivity.textContent = new Date(stats.lastActivity).toLocaleTimeString();
    }
    
    if (stats.banProtection) {
        const bp = stats.banProtection;
        if (protectionStatus) {
            protectionStatus.textContent = bp.enabled ? 'Active' : 'Disabled';
            protectionStatus.className = 'badge ' + (bp.enabled ? 'active' : 'warning');
        }
        
        if (hourlyProgress && hourlyCount) {
            const hourlyPercent = (bp.actionsThisHour / bp.maxPerHour) * 100;
            hourlyProgress.style.width = Math.min(hourlyPercent, 100) + '%';
            hourlyCount.textContent = `${bp.actionsThisHour}/${bp.maxPerHour}`;
        }
        
        if (dailyProgress && dailyCount) {
            const dailyPercent = (bp.actionsToday / bp.maxPerDay) * 100;
            dailyProgress.style.width = Math.min(dailyPercent, 100) + '%';
            dailyCount.textContent = `${bp.actionsToday}/${bp.maxPerDay}`;
        }
        
        if (cooldownStatus) {
            cooldownStatus.textContent = bp.isInCooldown ? 'In Cooldown' : 'Normal';
            cooldownStatus.className = 'badge ' + (bp.isInCooldown ? 'warning' : 'active');
        }
    }
}

socket.on('state', (state) => updateState(state));
socket.on('stateUpdate', (state) => updateState(state));

function updateState(state) {
    if (botEnabled) botEnabled.checked = state.botEnabled;
    if (autoView) autoView.checked = state.autoView;
    if (autoLike) autoLike.checked = state.autoLike;
    if (autoReply) autoReply.checked = state.autoReply;
}

function toggleFeature(feature) {
    const element = document.getElementById(feature);
    if (element) {
        socket.emit('toggleFeature', { feature, value: element.checked });
    }
}

socket.on('selectedEmojis', (emojis) => {
    console.log('📥 Received selectedEmojis:', emojis);
    selectedEmojis = emojis || [];
    renderSelectedEmojis();
    renderEmojiPicker();
});

socket.on('availableEmojis', (emojis) => {
    availableEmojis = emojis || [];
    renderEmojiPicker();
});

socket.on('emojiSaveResult', (result) => {
    console.log('💾 Emoji save result:', result);
    if (result.success) {
        showNotification('✅ ' + result.message, 'success');
    } else {
        showNotification('❌ ' + result.message, 'error');
    }
});

function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function renderSelectedEmojis() {
    if (!selectedEmojisContainer) return;
    
    selectedEmojisContainer.innerHTML = '';
    
    if (selectedEmojis.length === 0) {
        selectedEmojisContainer.innerHTML = '<span style="color: var(--text-secondary);">No emojis selected. Add some below!</span>';
        return;
    }
    
    selectedEmojis.forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'selected-emoji';
        span.textContent = emoji;
        span.title = 'Click to remove';
        span.onclick = () => removeEmoji(emoji);
        selectedEmojisContainer.appendChild(span);
    });
}

function renderEmojiPicker(category = 'all') {
    if (!emojiPicker) return;
    
    emojiPicker.innerHTML = '';
    
    let emojisToShow = [];
    
    if (category === 'all') {
        emojisToShow = availableEmojis.length > 0 ? availableEmojis : Object.values(emojiCategories).flat();
    } else {
        emojisToShow = emojiCategories[category] || [];
    }
    
    emojisToShow.forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'emoji-item';
        if (selectedEmojis.includes(emoji)) {
            span.classList.add('selected');
        }
        span.textContent = emoji;
        span.title = selectedEmojis.includes(emoji) ? 'Already selected' : 'Click to add';
        span.onclick = () => addEmoji(emoji);
        emojiPicker.appendChild(span);
    });
}

function addEmoji(emoji) {
    if (!isAuthenticated) {
        showNotification('❌ Please login first', 'error');
        return;
    }
    
    if (!selectedEmojis.includes(emoji)) {
        selectedEmojis.push(emoji);
        console.log('📤 Sending updateEmojis:', selectedEmojis);
        socket.emit('updateEmojis', [...selectedEmojis]);  
        renderSelectedEmojis();
        renderEmojiPicker();
    }
}

function removeEmoji(emoji) {
    if (!isAuthenticated) {
        showNotification('❌ Please login first', 'error');
        return;
    }
    
    selectedEmojis = selectedEmojis.filter(e => e !== emoji);
    console.log('📤 Sending updateEmojis (remove):', selectedEmojis);
    socket.emit('updateEmojis', [...selectedEmojis]);  
    renderSelectedEmojis();
    renderEmojiPicker();
}

function clearAllEmojis() {
    if (!isAuthenticated) {
        showNotification('❌ Please login first', 'error');
        return;
    }
    
    if (confirm('Are you sure you want to remove all selected emojis?')) {
        selectedEmojis = [];
        socket.emit('updateEmojis', []);
        renderSelectedEmojis();
        renderEmojiPicker();
    }
}

function resetDefaultEmojis() {
    if (!isAuthenticated) {
        showNotification('❌ Please login first', 'error');
        return;
    }
    
    selectedEmojis = ['❤️', '😍', '🔥', '👍', '😂', '🎉', '💯', '🙌'];
    socket.emit('updateEmojis', [...selectedEmojis]);
    renderSelectedEmojis();
    renderEmojiPicker();
}

document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderEmojiPicker(btn.dataset.category);
    });
});

socket.on('logs', (logs) => {
    if (!logsContainer) return;
    logsContainer.innerHTML = '';
    logs.forEach(log => addLogToUI(log));
});

socket.on('newLog', (log) => addLogToUI(log, true));

function addLogToUI(log, prepend = false) {
    if (!logsContainer) return;
    
    const logItem = document.createElement('div');
    logItem.className = 'log-item';
    logItem.innerHTML = `
        <span class="time">${log.time}</span>
        <span class="type ${log.type}">${log.type}</span>
        <span class="message">${log.message}</span>
    `;
    
    if (prepend) {
        logsContainer.insertBefore(logItem, logsContainer.firstChild);
    } else {
        logsContainer.appendChild(logItem);
    }
    
    while (logsContainer.children.length > 100) {
        logsContainer.removeChild(logsContainer.lastChild);
    }
}

function clearLogs() {
    if (logsContainer) logsContainer.innerHTML = '';
}

socket.on('error', (error) => {
    console.error('Socket error:', error);
    showNotification('❌ ' + error, 'error');
});

socket.on('disconnect', () => {
    connectionStatus.className = 'connection-status disconnected';
    connectionStatus.querySelector('.text').textContent = 'Reconnecting...';
});

socket.on('connect', () => {
    console.log('🔌 Socket connected');
    if (isAuthenticated) {
        const password = sessionStorage.getItem('dashboardPassword');
        if (password) {
            socket.emit('authenticate', password);
        }
    }
});

setInterval(() => {
    if (isAuthenticated) {
        socket.emit('getStats');
    }
}, 30000);

document.addEventListener('DOMContentLoaded', () => {
    renderEmojiPicker();

    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
});

const originalAuthenticate = authenticate;
authenticate = function() {
    sessionStorage.setItem('dashboardPassword', passwordInput.value);
    originalAuthenticate();
};
