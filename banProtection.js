const config = require('./config');
const fs = require('fs');

class BanProtection {
    constructor() {
        this.actionsThisHour = 0;
        this.actionsToday = 0;
        this.actionsSinceLastCooldown = 0;
        this.isInCooldown = false;
        this.lastActionTime = 0;
        this.hourlyResetTime = Date.now();
        this.dailyResetTime = Date.now();
        
        this.loadState();
        this.startResetTimers();
    }

    loadState() {
        try {
            if (fs.existsSync('./data/banprotection.json')) {
                const data = JSON.parse(fs.readFileSync('./data/banprotection.json'));
                this.actionsToday = data.actionsToday || 0;
                this.dailyResetTime = data.dailyResetTime || Date.now();
            }
        } catch (e) {
            console.log('Ban protection state not found, starting fresh');
        }
    }

    saveState() {
        try {
            if (!fs.existsSync('./data')) fs.mkdirSync('./data');
            fs.writeFileSync('./data/banprotection.json', JSON.stringify({
                actionsToday: this.actionsToday,
                dailyResetTime: this.dailyResetTime
            }));
        } catch (e) {}
    }

    startResetTimers() {
        setInterval(() => {
            this.actionsThisHour = 0;
            console.log('🔄 Hourly action counter reset');
        }, 3600000);

        setInterval(() => {
            const now = new Date();
            if (now.getHours() === config.banProtection.dailyResetHour) {
                if (Date.now() - this.dailyResetTime > 82800000) { // 23 hours
                    this.actionsToday = 0;
                    this.dailyResetTime = Date.now();
                    this.saveState();
                    console.log('🔄 Daily action counter reset');
                }
            }
        }, 60000);
    }

    getRandomDelay(type) {
        const delays = config.banProtection.delays;
        let min, max;
        
        switch(type) {
            case 'view':
                min = delays.viewMin;
                max = delays.viewMax;
                break;
            case 'like':
                min = delays.likeMin;
                max = delays.likeMax;
                break;
            case 'reply':
                min = delays.replyMin;
                max = delays.replyMax;
                break;
            default:
                min = 2000;
                max = 5000;
        }
        
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    shouldSkipRandomly() {
        return Math.random() < config.banProtection.skipChance;
    }

    isWithinActiveHours() {
        if (!config.banProtection.activeHoursOnly) return true;
        
        const hour = new Date().getHours();
        const { start, end } = config.banProtection.activeHours;
        
        return hour >= start && hour <= end;
    }

    async canPerformAction() {
        if (!config.banProtection.enabled) {
            return { allowed: true, reason: null };
        }

        if (!this.isWithinActiveHours()) {
            return { 
                allowed: false, 
                reason: 'Outside active hours',
                waitTime: this.getTimeUntilActiveHours()
            };
        }

        if (this.actionsThisHour >= config.banProtection.maxActionsPerHour) {
            return { 
                allowed: false, 
                reason: 'Hourly limit reached',
                waitTime: 3600000 - (Date.now() - this.hourlyResetTime)
            };
        }

        if (this.actionsToday >= config.banProtection.maxActionsPerDay) {
            return { 
                allowed: false, 
                reason: 'Daily limit reached',
                waitTime: this.getTimeUntilDailyReset()
            };
        }

        if (this.isInCooldown) {
            return { 
                allowed: false, 
                reason: 'In cooldown period',
                waitTime: config.banProtection.cooldownDuration
            };
        }

        if (this.shouldSkipRandomly()) {
            return { 
                allowed: false, 
                reason: 'Random skip (human-like behavior)',
                waitTime: 0
            };
        }

        return { allowed: true, reason: null };
    }

    recordAction() {
        this.actionsThisHour++;
        this.actionsToday++;
        this.actionsSinceLastCooldown++;
        this.lastActionTime = Date.now();
        this.saveState();

        if (this.actionsSinceLastCooldown >= config.banProtection.cooldownAfterActions) {
            this.startCooldown();
        }
    }

    startCooldown() {
        this.isInCooldown = true;
        this.actionsSinceLastCooldown = 0;
        
        console.log(`😴 Entering cooldown for ${config.banProtection.cooldownDuration / 1000}s`);
        
        setTimeout(() => {
            this.isInCooldown = false;
            console.log('✅ Cooldown ended');
        }, config.banProtection.cooldownDuration);
    }

    getTimeUntilActiveHours() {
        const now = new Date();
        const start = config.banProtection.activeHours.start;
        let targetHour = start;
        
        if (now.getHours() >= config.banProtection.activeHours.end) {
            targetHour = start + 24;
        }
        
        const target = new Date(now);
        target.setHours(targetHour, 0, 0, 0);
        
        return target.getTime() - now.getTime();
    }

    getTimeUntilDailyReset() {
        const now = new Date();
        const reset = new Date(now);
        reset.setHours(config.banProtection.dailyResetHour, 0, 0, 0);
        
        if (now >= reset) {
            reset.setDate(reset.getDate() + 1);
        }
        
        return reset.getTime() - now.getTime();
    }

    getStatus() {
        return {
            enabled: config.banProtection.enabled,
            actionsThisHour: this.actionsThisHour,
            actionsToday: this.actionsToday,
            maxPerHour: config.banProtection.maxActionsPerHour,
            maxPerDay: config.banProtection.maxActionsPerDay,
            isInCooldown: this.isInCooldown,
            isWithinActiveHours: this.isWithinActiveHours(),
            actionsSinceLastCooldown: this.actionsSinceLastCooldown
        };
    }
}

module.exports = new BanProtection();
