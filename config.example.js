module.exports = {
    botName: 'WhatsApp Status Bot Pro',
    
    connectionMethod: 'phone',  // Change to 'qr' or 'phone'

    // can you change 'true' or 'false'
    features: {
        autoViewStatus: true,
        autoLikeStatus: true,
        autoReplyStatus: false
    },
    
    // Default Reactions (can be changed from dashboard)
    reactions: ['❤️', '😍', '🔥', '👍', '😂', '🎉', '💯', '🙌'],
    
    availableEmojis: [
        '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '💝', '💘', '💕', '💗', '💓', '💞',
        '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘',
        '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶',
        '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️',
        '👋', '🤚', '🖐️', '✋', '🖖', '👏', '🙌', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿',
        '🔥', '⭐', '🌟', '✨', '💫', '⚡', '☀️', '🌈', '💥', '💢', '💯', '🎯', '🏆', '🥇', '🎖️',
        '🎉', '🎊', '🎈', '🎁', '🎀', '🎂', '🍰', '🧁', '🥳', '🪅', '🎆', '🎇', '🧨',
        '🌸', '🌹', '🌺', '🌻', '🌼', '🌷', '🌱', '🌿', '🍀', '🍁', '🍂', '🍃', '🌴', '🌵', '🌲',
        '🦋', '🐝', '🐛', '🦄', '🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮',
        '🍕', '🍔', '🍟', '🌭', '🍿', '🧀', '🥚', '🍳', '🥓', '🥩', '🍗', '🍖', '🌮', '🌯', '🥗',
        '💎', '💍', '👑', '🎩', '🎭', '🎨', '🎬', '🎤', '🎧', '🎵', '🎶', '🎸', '🎹', '🎺', '🥁',
        '💮', '🏵️', '🎗️', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '💠', '🔶', '🔷'
    ],
    
    replyMessage: 'Nice status! 🔥', //add your reply msg
    
    // Dashboard Settings
    dashboard: {
        enabled: true,
        port: 3000, //don't change
        password: 'admin' //change for log dashboard
    },
    
    banProtection: {
        enabled: true,
        maxActionsPerHour: 30,
        maxActionsPerDay: 200,
        delays: {
            viewMin: 2000,
            viewMax: 5000,
            likeMin: 3000,
            likeMax: 8000,
            replyMin: 10000,
            replyMax: 20000
        },
        skipChance: 0.15,
        activeHoursOnly: true,
        activeHours: {
            start: 7,
            end: 23
        },
        cooldownAfterActions: 10,
        cooldownDuration: 60000,
        dailyResetHour: 0
    },
    
    filters: {
        excludeNumbers: [],
        onlyTheseNumbers: [],
        excludeGroups: true
    },
    
    logging: {
        enabled: true,
        maxLogs: 500
    }
};
