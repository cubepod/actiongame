// --- Global Error Handler to Diagnose Issues ---
window.onerror = function (msg, url, lineNo, columnNo, error) {
    const errorStr = `Error: ${msg}\nLine: ${lineNo}\nColumn: ${columnNo}\nURL: ${url}`;
    alert(errorStr);
    console.error(errorStr, error);
    return false;
};

// --- Canvas roundRect Polyfill (Always Override for Cross-Browser Consistency) ---
CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radii) {
    let r = { tl: 0, tr: 0, br: 0, bl: 0 };
    if (typeof radii === 'number') {
        r = { tl: radii, tr: radii, br: radii, bl: radii };
    } else if (Array.isArray(radii)) {
        if (radii.length === 1) {
            const val = radii[0];
            r = { tl: val, tr: val, br: val, bl: val };
        } else if (radii.length === 2) {
            r = { tl: radii[0], tr: radii[0], br: radii[1], bl: radii[1] };
        } else if (radii.length === 4) {
            r = { tl: radii[0], tr: radii[1], br: radii[2], bl: radii[3] };
        }
    }
    this.beginPath();
    this.moveTo(x + r.tl, y);
    this.lineTo(x + width - r.tr, y);
    this.arcTo(x + width, y, x + width, y + r.tr, r.tr);
    this.lineTo(x + width, y + height - r.br);
    this.arcTo(x + width, y + height, x + width - r.br, y + height, r.br);
    this.lineTo(x + r.bl, y + height);
    this.arcTo(x, y + height, x, y + height - r.bl, r.bl);
    this.lineTo(x, y + r.tl);
    this.arcTo(x, y, x + r.tl, y, r.tl);
    this.closePath();
    return this;
};

// --- Game Config & State ---
const DIFFICULTY_CONFIG = {
    'easy-peasy': { lives: 10, hp: 8 },
    'easy': { lives: 7, hp: 5 },
    'normal': { lives: 5, hp: 3 },
    'hard': { lives: 3, hp: 2 },
    'hardest': { lives: 1, hp: 1 }
};

const THEMES = ['地上', '地下', '水中', '城下'];

let selectedDifficulty = 'normal';
let startLives = 5;
let startHp = 3;

let state = 'TITLE'; // TITLE, PLAYING, TREASURE_ROOM, GAMEOVER, GAMECLEAR, PAUSED
let prevPlayingState = 'PLAYING'; // To return to from PAUSE

let round = 1;
let currentStageIdx = 0; // 0, 1, 2 (Stage 1, 2, 3)
let lives = 5;
let frame = 0;

let stageJustLoaded = false;
let isLoopRunning = false;
let spaceDampened = false;
let weaponPickups = [];
let attackDampened = false;

// Entities
let player = {
    x: 100, y: 300,
    w: 30, h: 44,
    vx: 0, vy: 0,
    hp: 3, maxHp: 3,
    grounded: false,
    climbing: false,
    facingLeft: false,
    invulnerable: false,
    invulnerableTimer: 0,
    shield: 0,
    weapon: null,
    shootCooldown: 0
};

// Stage data
let stage = {
    theme: '地上',
    platforms: [],
    enemies: [],
    vines: [],
    hiddenDoor: null,
    gate: null,
    boss: null,
    width: 4000
};

// Saved stage details for returning from Treasure Room
let savedStage = null;
let savedPlayerPos = { x: 0, y: 0 };

// Projectiles, Potions, Particles, Popups
let projectiles = [];
let potions = [];
let particles = [];
let popups = [];

// Treasure Room layout
let treasureRoom = {
    platforms: [
        { x: 0, y: 480, w: 800, h: 120 }, // Floor
        { x: 300, y: 380, w: 200, h: 20 }  // Chest platform
    ],
    chest: { x: 380, y: 340, w: 40, h: 40, opened: false, livesRewarded: 0 },
    exitDoor: { x: 680, y: 420, w: 40, h: 60 } // Exit door is moved to the far right
};

// Controls
const keys = {
    left: false,
    right: false,
    up: false,
    down: false,
    space: false,
    attack: false
};

// Audio Setup
let audioCtx = null;
let soundEnabled = true;

// DOM Elements
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const gameClearScreen = document.getElementById('game-clear-screen');
const pauseOverlay = document.getElementById('pause-overlay');

const startBtn = document.getElementById('start-btn');
const retryBtn = document.getElementById('retry-btn');
const backToTitleBtn = document.getElementById('back-to-title-btn');
const playAgainBtn = document.getElementById('play-again-btn');
const resumeBtn = document.getElementById('resume-btn');
const quitBtn = document.getElementById('quit-btn');
const soundToggle = document.getElementById('sound-toggle');
const pauseBtn = document.getElementById('pause-btn');

const livesCount = document.getElementById('lives-count');
const hpBar = document.getElementById('hp-bar');
const hpText = document.getElementById('hp-text');
const roundCount = document.getElementById('round-count');
const stageCount = document.getElementById('stage-count');
const stageType = document.getElementById('stage-type');
const shieldDisplay = document.getElementById('shield-display');
const shieldCount = document.getElementById('shield-count');

const touchToggle = document.getElementById('touch-toggle');
const touchControls = document.getElementById('touch-controls');
const btnLeft = document.getElementById('touch-left');
const btnRight = document.getElementById('touch-right');
const btnUp = document.getElementById('touch-up');
const btnDown = document.getElementById('touch-down');
const btnJump = document.getElementById('touch-jump');
const btnAttack = document.getElementById('touch-attack');
const weaponDisplay = document.getElementById('weapon-display');
const weaponCount = document.getElementById('weapon-count');

const bossHud = document.getElementById('boss-hud');
const bossHpBar = document.getElementById('boss-hp-bar');
const bossHpText = document.getElementById('boss-hp-text');

const goRound = document.getElementById('go-round');
const gcLives = document.getElementById('gc-lives');

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');


function init() {
    setupDifficultyButtons();
    setupEventListeners();
    setupTouchControls();
    handleResize();
    window.addEventListener('resize', handleResize);
    updateScreenVisibility();
}

// Setup difficulty button selection
function setupDifficultyButtons() {
    const diffButtons = document.querySelectorAll('.diff-btn');
    diffButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            diffButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedDifficulty = btn.getAttribute('data-diff');
            
            const config = DIFFICULTY_CONFIG[selectedDifficulty];
            startLives = config.lives;
            startHp = config.hp;
        });
    });
    
    // Set default
    const config = DIFFICULTY_CONFIG[selectedDifficulty];
    startLives = config.lives;
    startHp = config.hp;
}

// Setup Event Listeners for UI
function setupEventListeners() {
    startBtn.addEventListener('click', startGame);
    retryBtn.addEventListener('click', retryGame);
    backToTitleBtn.addEventListener('click', showTitleScreen);
    playAgainBtn.addEventListener('click', showTitleScreen);
    resumeBtn.addEventListener('click', resumeGame);
    quitBtn.addEventListener('click', showTitleScreen);
    
    soundToggle.addEventListener('click', toggleSound);
    pauseBtn.addEventListener('click', togglePause);
    if (touchToggle) {
        touchToggle.addEventListener('click', toggleTouchControls);
    }
    
    // Keyboard inputs
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Reset keys on window focus loss to prevent stuck inputs
    window.addEventListener('blur', () => {
        keys.left = false;
        keys.right = false;
        keys.up = false;
        keys.down = false;
        keys.space = false;
        keys.attack = false;
        attackDampened = false;
    });
}

// Prevent default browser scrolling on key presses
const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'z', 'Z', 'x', 'X'];
function handleKeyDown(e) {
    if (gameKeys.includes(e.key)) {
        e.preventDefault();
    }
    
    if (state !== 'PLAYING' && state !== 'TREASURE_ROOM') return;
    
    switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
            keys.left = true;
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            keys.right = true;
            break;
        case 'ArrowUp':
        case 'w':
        case 'W':
            keys.up = true;
            checkInteraction();
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            keys.down = true;
            break;
        case ' ':
            if (!spaceDampened) {
                spaceDampened = true;
                keys.space = true;
                triggerJump();
            }
            break;
        case 'z':
        case 'Z':
        case 'x':
        case 'X':
            if (!attackDampened) {
                attackDampened = true;
                keys.attack = true;
                throwWeapon();
            }
            break;
        case 'Escape':
            togglePause();
            break;
    }
}

function handleKeyUp(e) {
    if (gameKeys.includes(e.key)) {
        e.preventDefault();
    }
    
    switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
            keys.left = false;
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            keys.right = false;
            break;
        case 'ArrowUp':
        case 'w':
        case 'W':
            keys.up = false;
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            keys.down = false;
            break;
        case ' ':
            keys.space = false;
            spaceDampened = false;
            break;
        case 'z':
        case 'Z':
        case 'x':
        case 'X':
            keys.attack = false;
            attackDampened = false;
            break;
    }
}

// Sound System using Web Audio API
function initAudio() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            try {
                audioCtx = new AudioContextClass();
            } catch (e) {
                console.warn('AudioContext failed to initialize:', e);
                soundEnabled = false;
            }
        } else {
            soundEnabled = false;
        }
    }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    soundToggle.innerText = soundEnabled ? '🔊 音声: オン' : '🔇 音声: オフ';
    initAudio();
}

// Variable to track touch controls visibility state
let touchControlsVisible = false;

// Handle window resizing and container scaling
function handleResize() {
    const container = document.getElementById('game-container');
    if (!container) return;
    
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Scale container down if the window is smaller than 800x600, max scale = 1
    const scale = Math.min(windowWidth / 800, windowHeight / 600, 1);
    
    container.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

// Setup touch listeners for mobile controls
function setupTouchControls() {
    // Detect touch capability
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    touchControlsVisible = isTouchDevice;
    
    updateTouchControlsUI();
    
    // Bind touch events to keys
    const bindTouch = (btn, keyProp, onStart = null) => {
        if (!btn) return;
        
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            keys[keyProp] = true;
            if (onStart) onStart();
        }, { passive: false });
        
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys[keyProp] = false;
        }, { passive: false });
        
        btn.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            keys[keyProp] = false;
        }, { passive: false });
    };
    
    bindTouch(btnLeft, 'left');
    bindTouch(btnRight, 'right');
    bindTouch(btnUp, 'up', () => {
        if (state === 'PLAYING' || state === 'TREASURE_ROOM') {
            checkInteraction();
        }
    });
    bindTouch(btnDown, 'down');
    bindTouch(btnJump, 'space', () => {
        triggerJump();
    });
    bindTouch(btnAttack, 'attack', () => {
        throwWeapon();
    });
}

// Execute jump instantly for maximum responsiveness
function triggerJump() {
    if (state === 'PLAYING') {
        const isUnderwater = (stage.theme === '水中');
        if (player.climbing) {
            player.climbing = false;
            player.vy = isUnderwater ? -2.2 : -7.5;
            playSound(isUnderwater ? 'swim' : 'jump');
            keys.space = false;
        } else if (isUnderwater) {
            // Let frame loop handle progressive swimming
        } else if (player.grounded) {
            player.vy = -9.2;
            player.grounded = false;
            playSound('jump');
            createJumpDust(player.x + player.w/2, player.y + player.h);
            keys.space = false;
        }
    } else if (state === 'TREASURE_ROOM') {
        if (player.grounded) {
            player.vy = -9.2;
            player.grounded = false;
            playSound('jump');
            createJumpDust(player.x + player.w/2, player.y + player.h);
            keys.space = false;
        }
    }
}

// Handle throwing the equipped weapon
function throwWeapon() {
    if (player.weapon === null) return;
    if (player.shootCooldown > 0) return;
    
    // Cooldown: 22 frames (~360ms)
    player.shootCooldown = 22;
    
    playSound('jump');
    
    let dir = player.facingLeft ? -1 : 1;
    let vx = 0, vy = 0, gravity = 0;
    
    if (player.weapon === 'axe') {
        vx = dir * 4.5;
        vy = -5.5;
        gravity = 0.28;
    } else if (player.weapon === 'javelin') {
        vx = dir * 8.5;
        vy = -1.2;
        gravity = 0.08;
    } else if (player.weapon === 'knife') {
        vx = dir * 10;
        vy = 0;
        gravity = 0.03;
    }
    
    projectiles.push({
        x: player.x + player.w/2 - 8,
        y: player.y + player.h/2 - 8,
        w: 16, h: 16,
        vx: vx, vy: vy,
        gravity: gravity,
        isPlayerWeapon: true,
        weaponType: player.weapon,
        angle: 0,
        timer: 150
    });
}

// Toggle manual display of touch controls
function toggleTouchControls() {
    touchControlsVisible = !touchControlsVisible;
    updateTouchControlsUI();
}

// Update Touch Controls HUD text and visibility
function updateTouchControlsUI() {
    if (touchToggle) {
        touchToggle.innerText = touchControlsVisible ? '📱 タッチ: オン' : '📱 タッチ: オフ';
    }
    if (touchControls) {
        if (touchControlsVisible) {
            touchControls.classList.remove('hidden');
        } else {
            touchControls.classList.add('hidden');
            // Clear all touch keys when hiding touch controls
            keys.left = false;
            keys.right = false;
            keys.up = false;
            keys.down = false;
            keys.space = false;
        }
    }
}

function playSound(type) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch (type) {
        case 'jump':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(380, now + 0.12);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
            break;
            
        case 'swim':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
            break;

        case 'stomp':
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.setValueAtTime(80, now + 0.04);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
            break;

        case 'hurt':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(250, now);
            osc.frequency.linearRampToValueAtTime(80, now + 0.25);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
            break;

        case 'potion':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(350, now);
            osc.frequency.setValueAtTime(500, now + 0.06);
            osc.frequency.setValueAtTime(700, now + 0.12);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
            break;

        case 'chest':
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(250, now);
            osc.frequency.exponentialRampToValueAtTime(750, now + 0.35);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
            break;

        case 'door':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(350, now);
            osc.frequency.exponentialRampToValueAtTime(120, now + 0.25);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
            break;

        case 'clear':
            playNote(261.63, 0.08, now); // C4
            playNote(329.63, 0.08, now + 0.08); // E4
            playNote(392.00, 0.08, now + 0.16); // G4
            playNote(523.25, 0.25, now + 0.24); // C5
            break;

        case 'gameover':
            playNote(196.00, 0.18, now); // G3
            playNote(174.61, 0.18, now + 0.18); // F3
            playNote(146.83, 0.18, now + 0.36); // D3
            playNote(110.00, 0.35, now + 0.54); // A2
            break;
            
        case 'boss-hit':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.setValueAtTime(65, now + 0.06);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
            break;
    }
}

function playNote(freq, duration, time) {
    if (!soundEnabled) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.linearRampToValueAtTime(0.01, time + duration);
    osc.start(time);
    osc.stop(time + duration);
}

// --- Screen State Control ---
function updateScreenVisibility() {
    startScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    gameClearScreen.classList.remove('active');
    pauseOverlay.classList.add('hidden');
    
    switch (state) {
        case 'TITLE':
            startScreen.classList.add('active');
            break;
        case 'PLAYING':
        case 'TREASURE_ROOM':
            gameScreen.classList.add('active');
            break;
        case 'GAMEOVER':
            gameOverScreen.classList.add('active');
            goRound.innerText = round;
            break;
        case 'GAMECLEAR':
            gameClearScreen.classList.add('active');
            gcLives.innerText = lives;
            break;
        case 'PAUSED':
            gameScreen.classList.add('active');
            pauseOverlay.classList.remove('hidden');
            break;
    }
}

// --- HUD Updates ---
function updateHPDisplay() {
    const percent = (player.hp / player.maxHp) * 100;
    hpBar.style.width = `${percent}%`;
    hpText.innerText = `${player.hp} / ${player.maxHp}`;
    
    // Color coding HP bar
    if (percent > 50) {
        hpBar.style.background = 'linear-gradient(90deg, #22c55e 0%, #4ade80 100%)';
    } else if (percent > 20) {
        hpBar.style.background = 'linear-gradient(90deg, #fbbf24 0%, #fef08a 100%)';
    } else {
        hpBar.style.background = 'linear-gradient(90deg, #ef4444 0%, #fca5a5 100%)';
    }
}

function updateHUD() {
    livesCount.innerText = lives;
    updateHPDisplay();
    roundCount.innerText = round;
    stageCount.innerText = currentStageIdx + 1;
    stageType.innerText = stage.theme;
    
    if (shieldDisplay && shieldCount) {
        if (player.shield > 0) {
            shieldDisplay.classList.remove('hidden');
            shieldCount.innerText = `🛡️ ${player.shield}`;
        } else {
            shieldDisplay.classList.add('hidden');
        }
    }
    
    if (weaponDisplay && weaponCount) {
        if (player.weapon) {
            weaponDisplay.classList.remove('hidden');
            let icon = '🗡️';
            let name = 'なし';
            if (player.weapon === 'axe') { icon = '🪓'; name = '斧'; }
            else if (player.weapon === 'javelin') { icon = '🔱'; name = '槍'; }
            else if (player.weapon === 'knife') { icon = '🔪'; name = 'ナイフ'; }
            weaponCount.innerText = `${icon} ${name}`;
        } else {
            weaponDisplay.classList.add('hidden');
        }
    }
}

function updateBossHUD() {
    if (stage.boss && stage.boss.alive) {
        bossHud.classList.remove('hidden');
        const percent = Math.max(0, (stage.boss.hp / stage.boss.maxHp) * 100);
        bossHpBar.style.width = `${percent}%`;
        bossHpText.innerText = `${stage.boss.hp} / ${stage.boss.maxHp}`;
    } else {
        bossHud.classList.add('hidden');
    }
}

// --- Game Loop Management ---
function startGame() {
    initAudio();
    round = 1;
    currentStageIdx = 0;
    lives = startLives;
    
    player.maxHp = startHp;
    player.hp = startHp;
    player.invulnerable = false;
    player.climbing = false;
    player.shield = 0;
    player.weapon = null;
    player.shootCooldown = 0;
    
    // Seed and generate new round stages
    generateStagesForRound();
    loadStage();
    
    state = 'PLAYING';
    updateScreenVisibility();
    updateHUD();
    
    frame = 0;
    startLoop();
}

function retryGame() {
    // Regenerate stages on game over restart
    startGame();
}

function showTitleScreen() {
    state = 'TITLE';
    updateScreenVisibility();
}

function togglePause() {
    if (state === 'PLAYING' || state === 'TREASURE_ROOM') {
        prevPlayingState = state;
        state = 'PAUSED';
        updateScreenVisibility();
        // Reset key states to prevent stuck movement when paused
        keys.left = false;
        keys.right = false;
        keys.up = false;
        keys.down = false;
        keys.space = false;
        keys.attack = false;
        attackDampened = false;
    } else if (state === 'PAUSED') {
        state = prevPlayingState;
        updateScreenVisibility();
        startLoop();
    }
}

function resumeGame() {
    if (state === 'PAUSED') {
        state = prevPlayingState;
        updateScreenVisibility();
        startLoop();
    }
}

// --- Procedural Generation ---
// Generate stages for the current round
let roundStageThemes = [];
let hiddenDoorStageIdx = 0; // Stage in round (0 or 1) that has the hidden door

function generateStagesForRound() {
    // Generate stage themes: Stage 1 & 2 random, Stage 3 always Castle
    roundStageThemes = [
        THEMES[Math.floor(Math.random() * THEMES.length)],
        THEMES[Math.floor(Math.random() * THEMES.length)],
        '城内'
    ];
    
    // Randomly select which stage has the hidden door (Stage 1 or 2)
    hiddenDoorStageIdx = Math.floor(Math.random() * 2);
}

let respawnStageClone = null;

function loadStage(isRespawn = false) {
    stageJustLoaded = true;
    projectiles = [];
    potions = [];
    particles = [];
    popups = [];
    
    // Reset key states to prevent stuck movement during stage loading
    keys.left = false;
    keys.right = false;
    keys.up = false;
    keys.down = false;
    keys.space = false;
    keys.attack = false;
    attackDampened = false;
    
    // Clear current stage pickups and reset weapon on death
    weaponPickups = [];
    if (isRespawn) {
        player.weapon = null;
        player.shootCooldown = 0;
    }
    
    if (isRespawn && respawnStageClone) {
        // Restore stage state exactly from the clone
        stage = JSON.parse(JSON.stringify(respawnStageClone));
    } else {
        const theme = roundStageThemes[currentStageIdx];
        const hasHiddenDoor = (currentStageIdx === hiddenDoorStageIdx);
        
        if (theme === '城内') {
            stage = generateCastleStage(round, hasHiddenDoor);
        } else {
            stage = generateStage(theme, round, hasHiddenDoor);
        }
        // Save initial stage state for respawns
        respawnStageClone = JSON.parse(JSON.stringify(stage));
    }
    
    // Reset player position
    player.x = 100;
    player.y = 300;
    player.vx = 0;
    player.vy = 0;
    player.climbing = false;

    // Spawn a random weapon at the beginning of the stage with a 60% chance
    if (!isRespawn && Math.random() < 0.6) {
        const types = ['axe', 'javelin', 'knife'];
        const chosen = types[Math.floor(Math.random() * types.length)];
        weaponPickups.push({
            x: 220,
            y: 418, // resting on start platform (y=450, item height=24 => 450 - 24 - some offset? Let's use 418)
            w: 24, h: 24,
            type: chosen
        });
    }
    
    updateHUD();
    updateBossHUD();
}

// Normal stage generator
function generateStage(theme, currentRound, hasHiddenDoor) {
    const platforms = [];
    const enemies = [];
    const vines = [];
    let hiddenDoor = null;
    let gate = null;

    const isUnderwater = (theme === '水中');
    const stageWidth = 4000;

    // Start Platform
    platforms.push({ x: 0, y: 450, w: 400, h: 200 });

    let currentX = 400;
    let currentY = 450;



    while (currentX < stageWidth - 450) {
        // Height variation (smoother height changes, max climb 40px)
        let dy = (Math.random() * 80 - 40); // -40 to +40px
        let y = currentY + dy;
        y = Math.max(160, Math.min(480, y));

        // Gap size: smaller if the next platform is higher
        let maxGap = (y < currentY) ? 80 : 105;
        let gap = 45 + Math.random() * (maxGap - 45); // 45 to maxGap px
        let w = 100 + Math.random() * 150; // 100 to 250px

        platforms.push({ x: currentX + gap, y: y, w: w, h: 600 - y });

        // If underwater, sometimes add a hanging ceiling platform in the gap!
        if (isUnderwater && Math.random() < 0.45 && gap > 50) {
            let cpW = 60 + Math.random() * 80;
            let cpH = 80 + Math.random() * 90; // Hang down 80-170px
            let cpX = currentX + (gap / 2) - (cpW / 2);
            platforms.push({ x: cpX, y: 60, w: cpW, h: cpH, isCeiling: true });
            
            // Spawn either a downward spike or an upside-down enemy on the bottom of it
            if (Math.random() < 0.5) {
                // Downward spike (static spiked walker)
                let spike = createEnemy(cpX + cpW / 2 - 16, 60 + cpH, 'walker', true, currentRound);
                spike.vx = 0;
                spike.vy = 0;
                spike.upsideDown = true;
                enemies.push(spike);
            } else {
                // Upside-down enemy
                let type = chooseEnemyType(theme, currentRound);
                let isSpiked = Math.random() < (0.2 + currentRound * 0.05);
                let enemy = createEnemy(cpX + cpW / 2 - 16, 60 + cpH, type, isSpiked, currentRound);
                enemy.vx = (type === 'walker') ? (Math.random() < 0.5 ? 1 : -1) : 0;
                enemy.vy = 0;
                enemy.upsideDown = true;
                if (type === 'fire_breather' || type === 'wizard') {
                    enemy.shootTimer = 60 + Math.random() * 120;
                }
                enemies.push(enemy);
            }
        }

        // Vines (35% chance, if not underwater)
        if (!isUnderwater && Math.random() < 0.35 && w > 120) {
            let vineX = currentX + gap + 30 + Math.random() * (w - 60);
            let vineH = 140 + Math.random() * 120;
            vines.push({ x: vineX, y: y - vineH + 10, w: 20, h: vineH });
        }

        // Enemies
        if (Math.random() < 0.55 && (currentX > 600)) {
            let enemyX = currentX + gap + w / 2 - 16;
            let enemyY = y - 32;
            let type = chooseEnemyType(theme, currentRound);
            let isSpiked = Math.random() < (0.15 + currentRound * 0.04);
            enemies.push(createEnemy(enemyX, enemyY, type, isSpiked, currentRound));
        }

        currentX += gap + w;
        currentY = y;
    }

    // End platform (Gate area)
    platforms.push({ x: currentX, y: currentY, w: 450, h: 600 - currentY });
    
    // Gate
    gate = { x: currentX + 220, y: currentY - 80, w: 60, h: 80 };

    // Place Hidden Door if required
    if (hasHiddenDoor) {
        // Choose a platform in the middle of the stage
        const midIdx = Math.floor(platforms.length / 2);
        const pf = platforms[midIdx];
        hiddenDoor = { x: pf.x + pf.w / 2 - 20, y: pf.y - 60, w: 40, h: 60, opened: false };
    }

    // Ocean floor if underwater (so player does not drop off the screen)
    if (isUnderwater) {
        // Flat ground along the bottom with some spikes
        platforms.push({ x: 0, y: 560, w: stageWidth, h: 40 });
        
        // Spawn spikes on the ocean floor (only if no normal platform overlaps horizontally)
        for (let sx = 600; sx < stageWidth - 600; sx += 250) {
            let insidePlatform = false;
            for (let pf of platforms) {
                if (pf.y < 560 && sx + 32 > pf.x && sx < pf.x + pf.w && !pf.isCeiling) {
                    insidePlatform = true;
                    break;
                }
            }
            if (!insidePlatform) {
                let spike = createEnemy(sx, 560 - 32, 'walker', true, currentRound);
                spike.vx = 0;
                spike.vy = 0;
                enemies.push(spike);
            }
        }

        // Ceiling spikes (hanging down from y = 60)
        for (let sx = 500; sx < stageWidth - 500; sx += 320) {
            let overlapsCeilingPlatform = false;
            for (let pf of platforms) {
                if (pf.isCeiling && sx + 32 > pf.x && sx < pf.x + pf.w) {
                    overlapsCeilingPlatform = true;
                    break;
                }
            }
            if (!overlapsCeilingPlatform && Math.random() < 0.55) {
                let spike = createEnemy(sx, 60, 'walker', true, currentRound);
                spike.vx = 0;
                spike.vy = 0;
                spike.upsideDown = true;
                enemies.push(spike);
            }
        }
    }

    return {
        theme,
        platforms,
        enemies,
        vines,
        hiddenDoor,
        gate,
        boss: null,
        width: stageWidth
    };
}

// Castle stage generator
function generateCastleStage(currentRound, hasHiddenDoor) {
    const platforms = [];
    const enemies = [];
    const vines = [];
    let hiddenDoor = null;
    let gate = null;

    const stageWidth = 2200;

    // Start area
    platforms.push({ x: 0, y: 460, w: 400, h: 140 });

    // Lava pools / spikes in pit
    // Draw solid ground along bottom but make it instant death hazard later or just lava draw
    
    // Let's generate a sequence of platforms
    let currentX = 400;
    let currentY = 460;
    
    // Generate platforms up to the boss arena
    while (currentX < 1100) {
        let y = currentY + (Math.random() * 60 - 30); // -30 to +30px variation
        y = Math.max(220, Math.min(460, y));
        
        let maxGap = (y < currentY) ? 75 : 100;
        let gap = 50 + Math.random() * (maxGap - 50); // 50 to maxGap px
        let w = 120 + Math.random() * 100;
        
        platforms.push({ x: currentX + gap, y: y, w: w, h: 600 - y });
        
        // Vines
        if (Math.random() < 0.4 && w > 100) {
            let vineX = currentX + gap + 30;
            vines.push({ x: vineX, y: y - 180 + 10, w: 20, h: 180 });
        }
        
        // Spawn standard enemies
        if (Math.random() < 0.6) {
            enemies.push(createEnemy(currentX + gap + w/2 - 16, y - 32, chooseEnemyType('城内', currentRound), Math.random() < 0.25, currentRound));
        }
        
        currentX += gap + w;
        currentY = y;
    }

    // Boss Arena at Y = 480
    const gapToArena = 60 + Math.random() * 30; // 60 to 90px (extremely safe)
    const arenaX = currentX + gapToArena;
    const arenaY = 480;
    const arenaW = 950;
    
    // Gap before arena
    platforms.push({ x: arenaX, y: arenaY, w: arenaW, h: 600 - arenaY });

    // High bypass platforms (for bypass mechanic in rounds 1-8)
    platforms.push({ x: arenaX + 160, y: 320, w: 120, h: 20 });
    vines.push({ x: arenaX + 220, y: 140, w: 20, h: 180 });

    platforms.push({ x: arenaX + 380, y: 220, w: 160, h: 20 });
    
    platforms.push({ x: arenaX + 640, y: 320, w: 120, h: 20 });
    vines.push({ x: arenaX + 700, y: 140, w: 20, h: 180 });

    // Gate behind boss
    gate = { x: arenaX + arenaW - 130, y: arenaY - 80, w: 60, h: 80 };

    // Boss Entity
    const boss = createBoss(arenaX + 480, arenaY, currentRound);

    // Place Hidden Door (early in the stage)
    if (hasHiddenDoor) {
        hiddenDoor = { x: 220, y: 460 - 60, w: 40, h: 60, opened: false };
    }

    return {
        theme: '城内',
        platforms,
        enemies,
        vines,
        hiddenDoor,
        gate,
        boss,
        width: arenaX + arenaW
    };
}

// Enemy helper functions
function chooseEnemyType(theme, currentRound) {
    const types = ['walker', 'jumper'];
    if (theme === '地下' || theme === '城内' || currentRound >= 3) {
        types.push('fire_breather');
    }
    if (theme === '水中' || theme === '城下' || theme === '城内' || currentRound >= 5) {
        types.push('wizard');
    }
    return types[Math.floor(Math.random() * types.length)];
}

function createEnemy(x, y, type, isSpiked, currentRound) {
    let vx = 0;
    if (type === 'walker') {
        vx = (0.7 + currentRound * 0.1) * (Math.random() < 0.5 ? 1 : -1);
    }
    
    // HP based on type and spike variations
    let hp = 1;
    if (type === 'walker') {
        hp = isSpiked ? 2 : 1;
    } else if (type === 'jumper') {
        hp = 2;
    } else if (type === 'wizard') {
        hp = 2;
    } else if (type === 'fire_breather') {
        hp = 3;
    }
    
    return {
        x, y,
        w: 32, h: 32,
        vx, vy: 0,
        type,
        spiked: isSpiked,
        alive: true,
        hp: hp,
        maxHp: hp,
        hurtTimer: 0,
        jumpTimer: 50 + Math.random() * 80,
        shootTimer: 60 + Math.random() * 90
    };
}

function createBoss(x, y, currentRound) {
    const size = 64 + currentRound * 3.5;
    return {
        x: x - size/2,
        y: y - size,
        w: size,
        h: size,
        vx: (1.1 + currentRound * 0.15) * -1,
        vy: 0,
        hp: 3 + currentRound,
        maxHp: 3 + currentRound,
        round: currentRound,
        shootTimer: 80,
        invulnerableTimer: 0,
        grounded: true,
        alive: true
    };
}

// --- Interactions & Transitions ---
function checkInteraction() {
    if (state === 'PLAYING') {
        // Check Hidden Door entry
        if (stage.hiddenDoor && !stage.hiddenDoor.opened && checkOverlap(player, stage.hiddenDoor)) {
            enterTreasureRoom();
        }
    } else if (state === 'TREASURE_ROOM') {
        // Check Exit Door
        if (checkOverlap(player, treasureRoom.exitDoor)) {
            exitTreasureRoom();
        }
        // Check Chest open
        else if (!treasureRoom.chest.opened && checkOverlap(player, treasureRoom.chest)) {
            openChest();
        }
    }
}

// Enter the hidden treasure room
function enterTreasureRoom() {
    savedStage = JSON.parse(JSON.stringify(stage)); // clone state
    savedPlayerPos = { x: player.x, y: player.y };
    
    // Reset Treasure Room chest state
    treasureRoom.chest.opened = false;
    treasureRoom.chest.livesRewarded = 0;
    
    // Set player in treasure room (spawn at far left, away from exit door)
    player.x = 80;
    player.y = 480 - player.h;
    player.vx = 0;
    player.vy = 0;
    player.climbing = false;
    
    projectiles = [];
    potions = [];
    particles = [];
    popups = [];
    
    state = 'TREASURE_ROOM';
    playSound('door');
    updateScreenVisibility();
    updateHUD();
    
    // Pop alert text
    popups.push({
        x: 400, y: 250,
        text: '宝物庫に入った！',
        color: '#fbbf24',
        timer: 100
    });
}

// Exit the hidden treasure room
function exitTreasureRoom() {
    stage = savedStage;
    stage.hiddenDoor.opened = true; // Mark as used
    if (respawnStageClone && respawnStageClone.hiddenDoor) {
        respawnStageClone.hiddenDoor.opened = true;
    }
    
    player.x = stage.hiddenDoor.x + 50; // spawn slightly to the right
    player.y = stage.hiddenDoor.y;
    player.vx = 0;
    player.vy = 0;
    player.climbing = false;
    
    projectiles = [];
    potions = [];
    particles = [];
    popups = [];
    
    state = 'PLAYING';
    playSound('door');
    updateScreenVisibility();
    updateHUD();
}

// Open chest in treasure room
function openChest() {
    treasureRoom.chest.opened = true;
    const addedLives = 1 + Math.floor(Math.random() * 10); // 1 to 10 lives
    treasureRoom.chest.livesRewarded = addedLives;
    lives += addedLives;
    
    playSound('chest');
    updateHUD();
    
    popups.push({
        x: treasureRoom.chest.x + treasureRoom.chest.w/2,
        y: treasureRoom.chest.y - 15,
        text: `+${addedLives} LIVES!`,
        color: '#fbbf24',
        timer: 120
    });
    
    // Burst of gold particles
    for (let i = 0; i < 20; i++) {
        particles.push({
            x: treasureRoom.chest.x + treasureRoom.chest.w/2,
            y: treasureRoom.chest.y + 10,
            vx: (Math.random() - 0.5) * 6,
            vy: -2 - Math.random() * 5,
            color: '#fbbf24',
            size: 3 + Math.random() * 4,
            alpha: 1,
            decay: 0.015
        });
    }

    // Spawn potions
    const potCount = 2 + Math.floor(Math.random() * 3); // 2 to 4 potions
    for (let i = 0; i < potCount; i++) {
        potions.push({
            x: treasureRoom.chest.x + 8,
            y: treasureRoom.chest.y - 10,
            w: 24,
            h: 24,
            vx: (Math.random() - 0.5) * 4,
            vy: -4 - Math.random() * 4,
            type: Math.random() < 0.15 ? 'super' : 'normal',
            grounded: false
        });
    }
    
    // 25% chance to spawn a shield item!
    if (Math.random() < 0.25) {
        potions.push({
            x: treasureRoom.chest.x + 8,
            y: treasureRoom.chest.y - 10,
            w: 24,
            h: 24,
            vx: (Math.random() - 0.5) * 4,
            vy: -6 - Math.random() * 3,
            type: 'shield',
            grounded: false
        });
    }
}

// Damage Player
function damagePlayer(amount) {
    if (player.invulnerable) return;
    
    player.hp -= amount;
    playSound('hurt');
    
    if (player.hp <= 0) {
        killPlayer();
    } else {
        player.invulnerable = true;
        player.invulnerableTimer = 1500; // 1.5 seconds invincibility
        updateHPDisplay();
        
        // Red flash particles
        for (let i = 0; i < 8; i++) {
            particles.push({
                x: player.x + player.w/2,
                y: player.y + player.h/2,
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3,
                color: '#ef4444',
                size: 3 + Math.random() * 3,
                alpha: 1,
                decay: 0.02
            });
        }
    }
}

// Player Death
function killPlayer() {
    lives--;
    updateHUD();
    
    if (lives <= 0) {
        state = 'GAMEOVER';
        playSound('gameover');
        updateScreenVisibility();
    } else {
        // Explode player particles
        for (let i = 0; i < 25; i++) {
            particles.push({
                x: player.x + player.w/2,
                y: player.y + player.h/2,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                color: '#3b82f6',
                size: 4 + Math.random() * 4,
                alpha: 1,
                decay: 0.015
            });
        }
        
        // Delay respawn slightly or respawn instantly at stage start
        player.hp = player.maxHp;
        player.invulnerable = true;
        player.invulnerableTimer = 2000;
        player.shield = 0;
        
        // Reload current stage configuration (re-spawns player at start)
        loadStage(true);
    }
}

// Trigger stage clear
function triggerStageClear() {
    playSound('clear');
    
    if (currentStageIdx < 2) {
        // Go to next stage of round
        currentStageIdx++;
        loadStage();
        
        popups.push({
            x: 400, y: 250,
            text: 'STAGE CLEAR!',
            color: '#10b981',
            timer: 90
        });
    } else {
        // Round Clear!
        if (round === 9) {
            // Game clear!
            state = 'GAMECLEAR';
            updateScreenVisibility();
        } else {
            round++;
            currentStageIdx = 0;
            generateStagesForRound();
            loadStage();
            
            popups.push({
                x: 400, y: 250,
                text: 'ROUND CLEAR!',
                color: '#10b981',
                timer: 100
            });
        }
    }
}

// Spawn recovery potions from enemies
function spawnPotion(x, y) {
    potions.push({
        x: x - 10,
        y: y - 12,
        w: 20,
        h: 24,
        vx: (Math.random() - 0.5) * 2,
        vy: -3.5,
        grounded: false
    });
}

// --- Game Physics Updates ---
function updatePhysics() {
    if (player.shootCooldown > 0) player.shootCooldown--;
    
    // Collect weapon pickups
    for (let i = weaponPickups.length - 1; i >= 0; i--) {
        let wp = weaponPickups[i];
        let bob = Math.sin(frame * 0.08 + wp.x) * 4;
        let visualWp = { x: wp.x, y: wp.y + bob, w: wp.w, h: wp.h };
        if (checkOverlap(player, visualWp)) {
            player.weapon = wp.type;
            playSound('stomp');
            popups.push({
                x: wp.x + wp.w/2,
                y: wp.y - 15,
                text: `${wp.type === 'axe' ? '🪓 斧' : wp.type === 'javelin' ? '🔱 槍' : '🔪 ﾅｲﾌ'} 獲得!`,
                color: '#fbbf24',
                timer: 70
            });
            weaponPickups.splice(i, 1);
            updateHUD();
        }
    }

    if (state === 'PLAYING') {
        stageJustLoaded = false;
        
        updatePlayerPhysics(stage);
        if (stageJustLoaded) return;
        
        updateEnemies(stage);
        if (stageJustLoaded) return;
        
        updateBoss(stage);
        if (stageJustLoaded) return;
        
        updateProjectiles();
        if (stageJustLoaded) return;
        
        updatePotions(stage);
        if (stageJustLoaded) return;
        
        updateParticles();
        if (stageJustLoaded) return;
        
        // Check stage clear gate
        const isBossAlive = (stage.boss && stage.boss.hp > 0);
        
        // Round 9 boss cannot be bypassed
        if (round === 9 && currentStageIdx === 2 && isBossAlive) {
            // Block gate with invisible wall
            if (player.x + player.w > stage.gate.x) {
                player.x = stage.gate.x - player.w;
                player.vx = 0;
                if (frame % 60 === 0) {
                    popups.push({
                        x: player.x + player.w/2,
                        y: player.y - 10,
                        text: 'ボスを倒せ！',
                        color: '#ef4444',
                        timer: 60
                    });
                }
            }
        } else {
            // Normal Gate: Clear if crossed or jumped over
            if (player.x > stage.gate.x + 10) {
                triggerStageClear();
            }
        }
    } else if (state === 'TREASURE_ROOM') {
        updatePlayerPhysicsTreasure();
        updateParticles();
    }
}

// Player physics inside Treasure Room (fixed screen)
function updatePlayerPhysicsTreasure() {
    // Normal gravity and physics params
    const gravity = 0.4;
    const frictionX = 0.85;
    const speedLimitX = 4;

    if (player.invulnerable) {
        player.invulnerableTimer -= 1000 / 60;
        if (player.invulnerableTimer <= 0) player.invulnerable = false;
    }

    // Input handlers
    if (keys.left) {
        player.vx -= 0.4;
        player.facingLeft = true;
    } else if (keys.right) {
        player.vx += 0.4;
        player.facingLeft = false;
    }

    player.vx *= frictionX;

    if (player.vx > speedLimitX) player.vx = speedLimitX;
    if (player.vx < -speedLimitX) player.vx = -speedLimitX;

    player.vy += gravity;
    if (player.vy > 12) player.vy = 12;

    if (keys.space && player.grounded) {
        player.vy = -9.2;
        player.grounded = false;
        keys.space = false;
        playSound('jump');
        createJumpDust(player.x + player.w/2, player.y + player.h);
    }

    // Horizontal Movement
    player.x += player.vx;
    
    // Screen bounds check
    if (player.x < 0) player.x = 0;
    if (player.x + player.w > 800) player.x = 800 - player.w;

    for (let platform of treasureRoom.platforms) {
        if (checkOverlap(player, platform)) {
            if (player.vx > 0) player.x = platform.x - player.w;
            else if (player.vx < 0) player.x = platform.x + platform.w;
            player.vx = 0;
        }
    }

    // Vertical Movement
    player.grounded = false;
    player.y += player.vy;
    
    for (let platform of treasureRoom.platforms) {
        if (checkOverlap(player, platform)) {
            if (player.vy > 0) {
                player.y = platform.y - player.h;
                player.vy = 0;
                player.grounded = true;
            } else if (player.vy < 0) {
                player.y = platform.y + platform.h;
                player.vy = 0;
            }
        }
    }
}

// Player physics inside normal stages
function updatePlayerPhysics(currentStage) {
    const isUnderwater = (currentStage.theme === '水中');
    const gravity = isUnderwater ? 0.08 : 0.4;
    const frictionX = isUnderwater ? 0.88 : 0.85;
    const speedLimitX = isUnderwater ? 2.5 : 4;
    const climbSpeed = 2.5;

    if (player.invulnerable) {
        player.invulnerableTimer -= 1000 / 60;
        if (player.invulnerableTimer <= 0) player.invulnerable = false;
    }

    // Overlap vine check
    let overlappingVine = null;
    for (let vine of currentStage.vines) {
        if (checkOverlap(player, vine)) {
            overlappingVine = vine;
            break;
        }
    }

    if (!overlappingVine) player.climbing = false;

    if (player.climbing && overlappingVine) {
        player.vx = 0;
        player.vy = 0;
        if (keys.up) {
            player.y -= climbSpeed;
            if (player.y + player.h < overlappingVine.y) player.climbing = false;
        } else if (keys.down) {
            player.y += climbSpeed;
            if (player.y > overlappingVine.y + overlappingVine.h) player.climbing = false;
        }
        
        if (keys.space) {
            player.climbing = false;
            player.vy = isUnderwater ? -2.2 : -7.5;
            keys.space = false;
            playSound(isUnderwater ? 'swim' : 'jump');
        }
        
        if (keys.left) {
            player.x -= 2;
            player.facingLeft = true;
            if (!checkOverlap(player, overlappingVine)) player.climbing = false;
        } else if (keys.right) {
            player.x += 2;
            player.facingLeft = false;
            if (!checkOverlap(player, overlappingVine)) player.climbing = false;
        }
    } else {
        if (keys.left) {
            player.vx -= isUnderwater ? 0.2 : 0.4;
            player.facingLeft = true;
        } else if (keys.right) {
            player.vx += isUnderwater ? 0.2 : 0.4;
            player.facingLeft = false;
        }

        player.vx *= frictionX;

        if (player.vx > speedLimitX) player.vx = speedLimitX;
        if (player.vx < -speedLimitX) player.vx = -speedLimitX;

        player.vy += gravity;
        
        const maxFallSpeed = isUnderwater ? 1.5 : 12;
        if (player.vy > maxFallSpeed) player.vy = maxFallSpeed;

        if (keys.space) {
            if (isUnderwater) {
                player.vy -= 0.22;
                if (player.vy < -2.0) player.vy = -2.0;
                
                // Bubble emission
                if (Math.random() < 0.15) {
                    particles.push(createBubble(player.x + player.w/2, player.y));
                }
                if (frame % 15 === 0) playSound('swim');
            } else if (player.grounded) {
                player.vy = -9.2;
                player.grounded = false;
                keys.space = false;
                playSound('jump');
                createJumpDust(player.x + player.w/2, player.y + player.h);
            }
        }

        if (overlappingVine && (keys.up || keys.down)) {
            player.climbing = true;
            player.vx = 0;
            player.vy = 0;
            player.x = overlappingVine.x + overlappingVine.w/2 - player.w/2;
        }
    }

    player.grounded = false;

    // Horiz movement & collision
    player.x += player.vx;
    
    // Limit left stage edge
    if (player.x < 0) {
        player.x = 0;
        player.vx = 0;
    }

    for (let platform of currentStage.platforms) {
        if (checkOverlap(player, platform)) {
            if (player.vx > 0) player.x = platform.x - player.w;
            else if (player.vx < 0) player.x = platform.x + platform.w;
            player.vx = 0;
        }
    }

    // Vert movement & collision
    player.y += player.vy;
    
    for (let platform of currentStage.platforms) {
        if (checkOverlap(player, platform)) {
            if (player.vy > 0) {
                player.y = platform.y - player.h;
                player.vy = 0;
                player.grounded = true;
            } else if (player.vy < 0) {
                player.y = platform.y + platform.h;
                player.vy = 0;
            }
        }
    }

    // Vert bounds check
    if (isUnderwater) {
        if (player.y < 60) { // Limit top scroll
            player.y = 60;
            player.vy = 0;
        }
    } else {
        if (player.y > 600) {
            damagePlayer(player.hp); // instant death in pits
            if (stageJustLoaded) return;
        }
    }
}

// Enemy Updates
function updateEnemies(currentStage) {
    for (let enemy of currentStage.enemies) {
        if (!enemy.alive) continue;
        
        if (enemy.hurtTimer > 0) {
            enemy.hurtTimer--;
        }

        if (enemy.type === 'walker') {
            enemy.x += enemy.vx;
            
            // Turn back at platform edges
            let onPlatform = false;
            for (let platform of currentStage.platforms) {
                let checkX = enemy.vx > 0 ? enemy.x + enemy.w : enemy.x;
                if (checkX >= platform.x && checkX <= platform.x + platform.w) {
                    if (enemy.upsideDown) {
                        // Hanging from the bottom of a platform
                        if (Math.abs(enemy.y - (platform.y + platform.h)) < 5) {
                            onPlatform = true;
                            break;
                        }
                    } else {
                        // Standing on top of a platform
                        if (Math.abs(enemy.y + enemy.h - platform.y) < 5) {
                            onPlatform = true;
                            break;
                        }
                    }
                }
            }
            // Hanging directly from the ceiling (y = 60)
            if (enemy.upsideDown && !onPlatform && Math.abs(enemy.y - 60) < 5) {
                onPlatform = true;
            }
            if (!onPlatform) {
                enemy.vx *= -1;
                enemy.x += enemy.vx;
            }
            
            // Turn back on wall collisions
            for (let platform of currentStage.platforms) {
                if (checkOverlap(enemy, platform)) {
                    enemy.vx *= -1;
                    enemy.x += enemy.vx;
                    break;
                }
            }
        } else if (enemy.type === 'jumper') {
            // Gravity
            enemy.vy += 0.3;
            if (enemy.vy > 10) enemy.vy = 10;
            
            enemy.y += enemy.vy;
            let grounded = false;
            for (let platform of currentStage.platforms) {
                if (checkOverlap(enemy, platform)) {
                    if (enemy.vy > 0) {
                        enemy.y = platform.y - enemy.h;
                        enemy.vy = 0;
                        grounded = true;
                    } else {
                        enemy.y = platform.y + platform.h;
                        enemy.vy = 0;
                    }
                }
            }
            
            enemy.x += enemy.vx;
            for (let platform of currentStage.platforms) {
                if (checkOverlap(enemy, platform)) {
                    enemy.vx *= -1;
                    enemy.x += enemy.vx;
                }
            }

            if (grounded) {
                enemy.jumpTimer--;
                if (enemy.jumpTimer <= 0) {
                    enemy.vy = -6.5;
                    enemy.vx = (player.x > enemy.x) ? 1.5 : -1.5;
                    enemy.jumpTimer = 50 + Math.random() * 80;
                } else {
                    enemy.vx = 0;
                }
            }
        } else if (enemy.type === 'fire_breather') {
            enemy.shootTimer--;
            if (enemy.shootTimer <= 0) {
                let dir = (player.x > enemy.x) ? 1 : -1;
                projectiles.push({
                    x: dir > 0 ? enemy.x + enemy.w : enemy.x - 16,
                    y: enemy.y + 8,
                    w: 16, h: 16,
                    vx: dir * 4, vy: 0,
                    type: 'fire',
                    timer: 120
                });
                enemy.shootTimer = 90 + Math.random() * 80;
                playSound('swim');
            }
        } else if (enemy.type === 'wizard') {
            enemy.shootTimer--;
            if (enemy.shootTimer <= 0) {
                let angle = Math.atan2(player.y + player.h/2 - (enemy.y + 16), player.x + player.w/2 - (enemy.x + 16));
                projectiles.push({
                    x: enemy.x + 8,
                    y: enemy.y + 8,
                    w: 16, h: 16,
                    vx: Math.cos(angle) * 1.8,
                    vy: Math.sin(angle) * 1.8,
                    type: 'magic',
                    timer: 100,
                    tracking: true
                });
                enemy.shootTimer = 130 + Math.random() * 90;
                playSound('jump');
            }
        }

        // Collision with player
        if (checkOverlap(player, enemy)) {
            // Check if player is stomping enemy (player falling and landing on top 60% of enemy)
            let playerBottom = player.y + player.h;
            let enemyTopThreshold = enemy.y + enemy.h * 0.6;
            let isStomping = !enemy.upsideDown && player.vy > 0 && !player.climbing && (playerBottom <= enemyTopThreshold || (playerBottom - player.vy <= enemyTopThreshold));
            
            if (isStomping) {
                if (enemy.spiked) {
                    if (!player.invulnerable && !(enemy.hurtTimer > 0)) {
                        damagePlayer(1);
                        if (stageJustLoaded) return;
                        player.vy = -4.5; // bounce slightly off spikes
                    }
                } else {
                    // Only register stomp if enemy is not already in hurt status
                    if (!(enemy.hurtTimer > 0)) {
                        enemy.hp = (enemy.hp || 1) - 1;
                        player.vy = -6.5; // bounce up
                        playSound('stomp');
                        createStompExplosion(enemy.x + enemy.w/2, enemy.y + enemy.h/2);
                        
                        if (enemy.hp <= 0) {
                            enemy.alive = false;
                            // Restore item drop (10% chance)
                            if (Math.random() < 0.10) {
                                spawnPotion(enemy.x + enemy.w/2, enemy.y + enemy.h/2);
                            }
                        } else {
                            enemy.hurtTimer = 30; // Flash and remain harmless for 0.5s
                        }
                    }
                }
            } else if (!player.invulnerable && !(enemy.hurtTimer > 0)) {
                damagePlayer(1);
                if (stageJustLoaded) return;
            }
        }
    }
}

// Boss Updates
function updateBoss(currentStage) {
    if (!currentStage.boss) return;
    const boss = currentStage.boss;
    
    if (boss.hp <= 0) {
        if (boss.alive) {
            boss.alive = false;
            createDefeatExplosion(boss.x + boss.w/2, boss.y + boss.h/2);
            playSound('clear');
            updateBossHUD();
        }
        return;
    }

    if (boss.invulnerableTimer > 0) {
        boss.invulnerableTimer -= 1000/60;
    }

    // Move back and forth in the boss arena
    boss.x += boss.vx;
    const arenaX = 1250;
    if (boss.x < arenaX + 150 || boss.x + boss.w > arenaX + 800) {
        boss.vx *= -1;
        boss.x += boss.vx;
    }

    // Attacks
    boss.shootTimer--;
    if (boss.shootTimer <= 0) {
        const attack = Math.random();
        if (attack < 0.45) {
            // Fireballs
            let dir = (player.x > boss.x) ? 1 : -1;
            projectiles.push({
                x: dir > 0 ? boss.x + boss.w : boss.x - 20,
                y: boss.y + boss.h / 2 - 10,
                w: 20, h: 20,
                vx: dir * (3.5 + boss.round * 0.25), vy: 0,
                type: 'fire',
                timer: 160
            });
            playSound('swim');
        } else if (attack < 0.75) {
            // Jump Stomp attack
            boss.vy = -7.5 - Math.random() * 4;
            boss.grounded = false;
        } else {
            // Magical orb
            let angle = Math.atan2(player.y + player.h/2 - (boss.y + boss.h/2), player.x + player.w/2 - (boss.x + boss.w/2));
            projectiles.push({
                x: boss.x + boss.w/2 - 10,
                y: boss.y + boss.h/2 - 10,
                w: 20, h: 20,
                vx: Math.cos(angle) * (1.8 + boss.round * 0.1),
                vy: Math.sin(angle) * (1.8 + boss.round * 0.1),
                type: 'magic',
                timer: 200,
                tracking: true
            });
            playSound('jump');
        }
        boss.shootTimer = Math.max(35, 130 - boss.round * 8) + Math.random() * 60;
    }

    // Apply gravity
    if (!boss.grounded) {
        boss.vy += 0.4;
        boss.y += boss.vy;
        
        const floorY = 480;
        if (boss.y + boss.h >= floorY) {
            boss.y = floorY - boss.h;
            boss.vy = 0;
            boss.grounded = true;
            
            // Ground shake shockwave!
            createStompExplosion(boss.x + boss.w/2, floorY);
            if (player.grounded && Math.abs(player.x - (boss.x + boss.w/2)) < 320 && !player.invulnerable) {
                damagePlayer(1);
                if (stageJustLoaded) return;
            }
        }
    }

    // Stomp collision
    if (checkOverlap(player, boss)) {
        // Check if player is stomping boss (player falling and landing on top 60% of boss)
        let playerBottom = player.y + player.h;
        let bossTopThreshold = boss.y + boss.h * 0.6;
        let isStomping = player.vy > 0 && !player.climbing && (playerBottom <= bossTopThreshold || (playerBottom - player.vy <= bossTopThreshold));
        if (isStomping) {
            if (boss.invulnerableTimer <= 0) {
                boss.hp--;
                boss.invulnerableTimer = 800; // 0.8s
                player.vy = -7.5; // bounce up
                playSound('boss-hit');
                createStompExplosion(boss.x + boss.w/2, boss.y + boss.h/2);
                updateBossHUD();
            } else {
                player.vy = -3.5;
            }
        } else {
            damagePlayer(1);
            if (stageJustLoaded) return;
        }
    }
}

// Projectile Updates
function updateProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        p.timer--;
        
        if (p.isPlayerWeapon) {
            // Apply weapon gravity and update position
            if (p.gravity) p.vy += p.gravity;
            p.x += p.vx;
            p.y += p.vy;
            p.angle += (p.weaponType === 'javelin') ? 0 : 0.2;
            
            // Check collision with platforms (disappears on wall hit)
            let hitWall = false;
            if (state === 'PLAYING') {
                for (let pf of stage.platforms) {
                    if (checkOverlap(p, pf)) {
                        hitWall = true;
                        break;
                    }
                }
            }
            if (hitWall) {
                createDebrisExplosion(p.x + p.w/2, p.y + p.h/2, '#cbd5e1');
                projectiles.splice(i, 1);
                continue;
            }
            
            // Check collision with enemies
            let hitEnemy = false;
            if (state === 'PLAYING') {
                for (let enemy of stage.enemies) {
                    if (enemy.alive && checkOverlap(p, enemy)) {
                        let dmg = 1;
                        if (p.weaponType === 'axe') dmg = 2;
                        if (p.weaponType === 'javelin') dmg = 3;
                        
                        enemy.hp = (enemy.hp || 1) - dmg;
                        createDebrisExplosion(p.x + p.w/2, p.y + p.h/2, '#ef4444');
                        
                        if (enemy.hp <= 0) {
                            enemy.alive = false;
                            playSound('stomp');
                            createStompExplosion(enemy.x + enemy.w/2, enemy.y + enemy.h/2);
                            if (Math.random() < 0.10) {
                                spawnPotion(enemy.x + enemy.w/2, enemy.y + enemy.h/2);
                            }
                        } else {
                            enemy.hurtTimer = 15; // Flash for 15 frames when hit by weapon
                        }
                        
                        hitEnemy = true;
                        break;
                    }
                }
            }
            if (hitEnemy) {
                projectiles.splice(i, 1);
                continue;
            }
            
            // Check collision with boss
            if (state === 'PLAYING' && stage.boss && stage.boss.alive && checkOverlap(p, stage.boss)) {
                if (stage.boss.invulnerableTimer <= 0) {
                    let dmg = 1;
                    if (p.weaponType === 'axe') dmg = 2;
                    if (p.weaponType === 'javelin') dmg = 3;
                    
                    stage.boss.hp -= dmg;
                    stage.boss.invulnerableTimer = 800;
                    playSound('boss-hit');
                    createStompExplosion(stage.boss.x + stage.boss.w/2, stage.boss.y + stage.boss.h/2);
                }
                createDebrisExplosion(p.x + p.w/2, p.y + p.h/2, '#ef4444');
                projectiles.splice(i, 1);
                continue;
            }
            
            // Check screen bounds or timer
            if (p.timer <= 0 || p.x < player.x - 600 || p.x > player.x + 600 || p.y > 600) {
                projectiles.splice(i, 1);
                continue;
            }
            
            continue;
        }
        
        if (p.tracking) {
            let targetX = player.x + player.w/2;
            let targetY = player.y + player.h/2;
            let dx = targetX - p.x;
            let dy = targetY - p.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            if (dist > 5 && dist < 280) {
                p.vx = (p.vx * 0.94) + (dx / dist * 0.06) * 1.8;
                p.vy = (p.vy * 0.94) + (dy / dist * 0.06) * 1.8;
            }
        }

        p.x += p.vx;
        p.y += p.vy;

        // Visual trails
        if (Math.random() < 0.3) {
            particles.push({
                x: p.x + p.w/2,
                y: p.y + p.h/2,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                color: p.type === 'fire' ? '#f97316' : '#a855f7',
                size: 2 + Math.random() * 3,
                alpha: 0.8,
                decay: 0.03
            });
        }

        // Player Hit
        if (checkOverlap(p, player)) {
            if (player.shield > 0) {
                player.shield--;
                playSound('stomp'); // shield block sound
                popups.push({
                    x: player.x + player.w/2,
                    y: player.y - 10,
                    text: 'BLOCKED!',
                    color: '#22d3ee',
                    timer: 60
                });
                
                // Spawn cool shield impact sparks
                for (let j = 0; j < 15; j++) {
                    particles.push({
                        x: p.x + p.w/2,
                        y: p.y + p.h/2,
                        vx: (Math.random() - 0.5) * 6,
                        vy: (Math.random() - 0.5) * 6,
                        color: '#22d3ee',
                        size: 2 + Math.random() * 3,
                        alpha: 1,
                        decay: 0.025
                    });
                }
                
                projectiles.splice(i, 1);
                updateHUD();
                continue;
            }
            
            damagePlayer(1);
            if (stageJustLoaded) return;
            projectiles.splice(i, 1);
            continue;
        }

        if (p.timer <= 0) {
            projectiles.splice(i, 1);
        }
    }
}

// Collectible Potions Updates
function updatePotions(currentStage) {
    const isUnderwater = (currentStage.theme === '水中');
    const gravity = isUnderwater ? 0.05 : 0.3;
    const maxFall = isUnderwater ? 1.0 : 10;
    
    for (let i = potions.length - 1; i >= 0; i--) {
        let pot = potions[i];
        
        pot.vy += gravity;
        if (pot.vy > maxFall) pot.vy = maxFall;
        pot.y += pot.vy;
        
        pot.x += pot.vx;
        pot.vx *= 0.95;

        // Collision with platforms
        for (let platform of currentStage.platforms) {
            if (checkOverlap(pot, platform)) {
                pot.y = platform.y - pot.h;
                pot.vy = 0;
                pot.grounded = true;
            }
        }

        // Collection
        if (checkOverlap(pot, player)) {
            if (pot.type === 'shield') {
                player.shield = 3;
                playSound('potion');
                
                popups.push({
                    x: player.x + player.w/2,
                    y: player.y - 10,
                    text: '🛡️ SHIELD EQUIPPED!',
                    color: '#06b6d4',
                    timer: 80
                });
                
                for (let j = 0; j < 18; j++) {
                    particles.push({
                        x: pot.x + pot.w/2,
                        y: pot.y + pot.h/2,
                        vx: (Math.random() - 0.5) * 5,
                        vy: (Math.random() - 0.5) * 5,
                        color: '#22d3ee',
                        size: 2 + Math.random() * 3,
                        alpha: 1,
                        decay: 0.02
                    });
                }
            } else {
                const amount = pot.type === 'super' ? 2 : 1;
                player.hp = Math.min(player.maxHp, player.hp + amount);
                updateHPDisplay();
                playSound('potion');
                
                popups.push({
                    x: player.x + player.w/2,
                    y: player.y - 10,
                    text: `+${amount} HP!`,
                    color: '#22c55e',
                    timer: 60
                });
                
                for (let j = 0; j < 12; j++) {
                    particles.push({
                        x: pot.x + pot.w/2,
                        y: pot.y + pot.h/2,
                        vx: (Math.random() - 0.5) * 4,
                        vy: (Math.random() - 0.5) * 4,
                        color: '#22c55e',
                        size: 2 + Math.random() * 3,
                        alpha: 1,
                        decay: 0.025
                    });
                }
            }
            potions.splice(i, 1);
            updateHUD();
        } else if (pot.y > 600) {
            potions.splice(i, 1);
        }
    }
}

// Particle & Popups updates
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;
        
        if (p.alpha <= 0) {
            particles.splice(i, 1);
        }
    }
    
    for (let i = popups.length - 1; i >= 0; i--) {
        let p = popups[i];
        p.y -= 0.6;
        p.timer--;
        if (p.timer <= 0) {
            popups.splice(i, 1);
        }
    }
}

// --- Particle Creation Helpers ---
function createBubble(x, y) {
    return {
        x, y,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.8 - Math.random() * 0.6,
        color: '#38bdf8',
        size: 2 + Math.random() * 4,
        alpha: 0.8,
        decay: 0.008
    };
}

function createJumpDust(x, y) {
    for (let i = 0; i < 6; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 2,
            vy: -0.5 - Math.random() * 1.5,
            color: '#64748b',
            size: 3 + Math.random() * 3,
            alpha: 0.8,
            decay: 0.03
        });
    }
}

function createStompExplosion(x, y) {
    for (let i = 0; i < 15; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            color: '#e2e8f0',
            size: 2 + Math.random() * 4,
            alpha: 1,
            decay: 0.02
        });
    }
}

function createDebrisExplosion(x, y, color) {
    for (let i = 0; i < 8; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            color: color || '#cbd5e1',
            size: 1.5 + Math.random() * 2.5,
            alpha: 1,
            decay: 0.03
        });
    }
}

function createDefeatExplosion(x, y) {
    for (let i = 0; i < 40; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            color: '#ef4444',
            size: 3 + Math.random() * 5,
            alpha: 1,
            decay: 0.015
        });
    }
}

// --- Canvas Rendering ---
function drawCloud(c, cx, cy) {
    c.beginPath();
    c.arc(cx, cy, 25, 0, Math.PI * 2);
    c.arc(cx + 20, cy - 10, 30, 0, Math.PI * 2);
    c.arc(cx + 45, cy, 25, 0, Math.PI * 2);
    c.fill();
}

function drawBackground() {
    ctx.save();
    
    // Draw background based on theme
    const theme = (state === 'TREASURE_ROOM') ? '宝物庫' : stage.theme;
    const cameraX = (state === 'TREASURE_ROOM') ? 0 : player.x - 400;

    let grad;
    switch (theme) {
        case '地上':
            grad = ctx.createLinearGradient(0, 0, 0, 600);
            grad.addColorStop(0, '#0f172a');
            grad.addColorStop(0.6, '#1e1b4b');
            grad.addColorStop(1, '#312e81');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 800, 600);

            // Parallax Clouds
            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            for (let i = 0; i < 4; i++) {
                let cx = (i * 350 - cameraX * 0.1) % 1400;
                if (cx < -150) cx += 1400;
                drawCloud(ctx, cx, 100 + (i % 2) * 40);
            }

            // Parallax Hills
            ctx.fillStyle = '#111827';
            ctx.beginPath();
            for (let x = 0; x <= 800; x += 40) {
                let wx = x + cameraX * 0.18;
                let wy = 380 + Math.sin(wx * 0.003) * 35 + Math.cos(wx * 0.007) * 15;
                if (x === 0) ctx.moveTo(x, wy);
                else ctx.lineTo(x, wy);
            }
            ctx.lineTo(800, 600);
            ctx.lineTo(0, 600);
            ctx.closePath();
            ctx.fill();
            break;

        case '地下':
            ctx.fillStyle = '#090d16';
            ctx.fillRect(0, 0, 800, 600);

            // Rocky Pillars
            ctx.fillStyle = '#111827';
            for (let i = 0; i < 5; i++) {
                let px = (i * 280 - cameraX * 0.3) % 1400;
                if (px < -100) px += 1400;
                ctx.fillRect(px, 0, 45, 600);
                
                ctx.fillStyle = '#030712';
                ctx.fillRect(px + 10, 180, 25, 15);
                ctx.fillRect(px + 5, 400, 30, 20);
                ctx.fillStyle = '#111827';
            }
            break;

        case '水中':
            grad = ctx.createLinearGradient(0, 0, 0, 600);
            grad.addColorStop(0, '#083344');
            grad.addColorStop(0.7, '#155e75');
            grad.addColorStop(1, '#0e7490');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 800, 600);

            // Rays
            ctx.fillStyle = 'rgba(56, 189, 248, 0.04)';
            ctx.beginPath();
            ctx.moveTo(100, 0); ctx.lineTo(250, 0); ctx.lineTo(350, 600); ctx.lineTo(120, 600);
            ctx.closePath(); ctx.fill();

            ctx.beginPath();
            ctx.moveTo(480, 0); ctx.lineTo(600, 0); ctx.lineTo(720, 600); ctx.lineTo(520, 600);
            ctx.closePath(); ctx.fill();

            // Parallax Seaweed
            ctx.fillStyle = '#064e3b';
            for (let i = 0; i < 7; i++) {
                let sx = (i * 180 - cameraX * 0.2) % 1260;
                if (sx < -60) sx += 1260;
                ctx.beginPath();
                ctx.moveTo(sx, 600);
                let w = Math.sin(frame * 0.02 + i) * 18;
                ctx.quadraticCurveTo(sx + w, 400, sx + w / 2, 220);
                ctx.quadraticCurveTo(sx + w, 400, sx + 25, 600);
                ctx.closePath();
                ctx.fill();
            }
            break;

        case '城下':
            grad = ctx.createLinearGradient(0, 0, 0, 600);
            grad.addColorStop(0, '#2e1065');
            grad.addColorStop(0.5, '#4c1d95');
            grad.addColorStop(1, '#701a75');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 800, 600);

            // City silhouette
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            for (let i = 0; i < 9; i++) {
                let bx = (i * 130 - cameraX * 0.25) % 1170;
                if (bx < -120) bx += 1170;
                let bh = 140 + (i % 3) * 55;
                ctx.rect(bx, 600 - bh, 80, bh);
                
                ctx.moveTo(bx - 10, 600 - bh);
                ctx.lineTo(bx + 40, 600 - bh - 28);
                ctx.lineTo(bx + 90, 600 - bh);
            }
            ctx.closePath();
            ctx.fill();
            break;

        case '城内':
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, 800, 600);

            // Brick details in background
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.05)';
            ctx.lineWidth = 1;
            let gridX = -cameraX * 0.5 % 60;
            ctx.beginPath();
            for (let gx = gridX; gx < 800; gx += 60) {
                ctx.moveTo(gx, 0); ctx.lineTo(gx, 600);
            }
            for (let gy = 0; gy < 600; gy += 30) {
                ctx.moveTo(0, gy); ctx.lineTo(800, gy);
            }
            ctx.stroke();

            // Pillars & Torches
            for (let i = 0; i < 4; i++) {
                let tx = (i * 320 - cameraX * 0.4) % 1280;
                if (tx < -60) tx += 1280;
                
                // Pillar
                ctx.fillStyle = '#1e1b4b';
                ctx.fillRect(tx, 0, 40, 600);
                
                // Torch holder
                ctx.fillStyle = '#475569';
                ctx.fillRect(tx + 16, 260, 8, 16);
                
                // Flame animation
                const flameGrad = ctx.createRadialGradient(tx + 20, 255, 1, tx + 20, 255, 16);
                flameGrad.addColorStop(0, '#fef08a');
                flameGrad.addColorStop(0.4, '#f97316');
                flameGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
                ctx.fillStyle = flameGrad;
                ctx.beginPath();
                ctx.arc(tx + 20, 255, 14 + Math.sin(frame * 0.25) * 2, 0, Math.PI * 2);
                ctx.fill();
            }
            break;

        case '宝物庫':
            grad = ctx.createLinearGradient(0, 0, 0, 600);
            grad.addColorStop(0, '#422006');
            grad.addColorStop(0.7, '#713f12');
            grad.addColorStop(1, '#a16207');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 800, 600);

            // Draw treasure arches
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(400, 480, 280, Math.PI, 0);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(400, 480, 250, Math.PI, 0);
            ctx.stroke();

            // Piles of gold coins on ground
            ctx.fillStyle = '#eab308';
            ctx.beginPath();
            ctx.ellipse(200, 480, 150, 40, 0, 0, Math.PI * 2);
            ctx.ellipse(600, 480, 180, 35, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.ellipse(220, 480, 100, 25, 0, 0, Math.PI * 2);
            ctx.ellipse(580, 480, 130, 20, 0, 0, Math.PI * 2);
            ctx.fill();
            break;
    }
    
    ctx.restore();
}

function drawPlatform(pf, theme) {
    ctx.save();
    
    let bodyColor, topColor;
    switch (theme) {
        case '地上':
            bodyColor = '#473229'; // Dark brown dirt
            topColor = '#10b981';  // Emerald green grass
            break;
        case '地下':
            bodyColor = '#1e293b'; // Slate gray body
            topColor = '#475569';  // Lighter slate trim
            break;
        case '水中':
            bodyColor = '#083344'; // Cyan dark body
            topColor = '#fbbf24';  // Golden sand top
            break;
        case '城下':
            bodyColor = '#0f172a'; // Deep slate bricks
            topColor = '#94a3b8';  // Cobble gray top
            break;
        case '城内':
            bodyColor = '#2d0a0a'; // Dark bloodstone body
            topColor = '#dc2626';  // Magma red border
            break;
        case '宝物庫':
            bodyColor = '#451a03'; // Dark brown chest area
            topColor = '#eab308';  // Golden plate
            break;
        default:
            bodyColor = '#1e293b';
            topColor = '#475569';
    }

    // Main platform body
    ctx.fillStyle = bodyColor;
    ctx.fillRect(pf.x, pf.y, pf.w, pf.h);

    // Top or bottom trim border depending on ceiling alignment
    ctx.fillStyle = topColor;
    if (pf.isCeiling) {
        ctx.fillRect(pf.x, pf.y + pf.h - 8, pf.w, 8);
    } else {
        ctx.fillRect(pf.x, pf.y, pf.w, 8);
    }

    // Dynamic decorative patterns
    if (theme === '地上') {
        // Organic grassy hangs
        ctx.fillStyle = topColor;
        ctx.beginPath();
        for (let tx = pf.x; tx < pf.x + pf.w; tx += 8) {
            ctx.moveTo(tx, pf.y + 8);
            ctx.lineTo(tx + 4, pf.y + 12 + Math.sin(tx + frame * 0.02) * 2);
            ctx.lineTo(tx + 8, pf.y + 8);
        }
        ctx.fill();
    } else if (theme === '水中') {
        // Seaweed / hanging vines animation
        ctx.fillStyle = '#065f46';
        for (let tx = pf.x + 12; tx < pf.x + pf.w - 12; tx += 30) {
            ctx.beginPath();
            let wave = Math.sin(frame * 0.05 + tx) * 4;
            if (pf.isCeiling) {
                // Hanging seaweed (pointing down)
                let bottomY = pf.y + pf.h;
                ctx.moveTo(tx, bottomY);
                ctx.quadraticCurveTo(tx + wave, bottomY + 12, tx + wave / 2, bottomY + 24);
                ctx.quadraticCurveTo(tx + wave + 2, bottomY + 12, tx + 8, bottomY);
            } else {
                // Rising seaweed (pointing up)
                ctx.moveTo(tx, pf.y);
                ctx.quadraticCurveTo(tx + wave, pf.y - 12, tx + wave / 2, pf.y - 24);
                ctx.quadraticCurveTo(tx + wave + 2, pf.y - 12, tx + 8, pf.y);
            }
            ctx.fill();
        }
    } else if (theme === '城内') {
        // Glowing magma cracks
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let cy = pf.y + 25; cy < pf.y + pf.h; cy += 35) {
            ctx.moveTo(pf.x, cy);
            ctx.lineTo(pf.x + pf.w, cy + Math.sin(cy) * 8);
        }
        ctx.stroke();
    }

    ctx.restore();
}

function drawVine(vine) {
    ctx.save();
    
    // Main vine rope
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(vine.x + vine.w/2, vine.y);
    ctx.lineTo(vine.x + vine.w/2, vine.y + vine.h);
    ctx.stroke();

    // Leaf nodes
    ctx.fillStyle = '#10b981';
    const spacing = 18;
    for (let ly = vine.y + 8; ly < vine.y + vine.h; ly += spacing) {
        // Left
        ctx.beginPath();
        ctx.ellipse(vine.x + vine.w/2 - 6, ly, 5, 3, -Math.PI/6, 0, Math.PI * 2);
        ctx.fill();
        // Right
        ctx.beginPath();
        ctx.ellipse(vine.x + vine.w/2 + 6, ly + 4, 5, 3, Math.PI/6, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();
}

function drawHiddenDoor(door) {
    ctx.save();
    
    // Faint overlay that glows when player is nearby
    const dist = Math.abs((player.x + player.w/2) - (door.x + door.w/2));
    const alpha = dist < 120 ? 0.8 : 0.12;
    ctx.globalAlpha = alpha;
    
    // Wood frame
    ctx.fillStyle = '#78350f';
    ctx.fillRect(door.x, door.y, door.w, door.h);
    
    // Archway
    ctx.fillStyle = '#1e1b4b';
    ctx.beginPath();
    ctx.roundRect(door.x + 4, door.y + 4, door.w - 8, door.h - 4, [10, 10, 0, 0]);
    ctx.fill();
    
    // Knob
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(door.x + door.w - 8, door.y + door.h/2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Magic dust particles if close
    if (dist < 120 && Math.random() < 0.12) {
        particles.push({
            x: door.x + Math.random() * door.w,
            y: door.y + Math.random() * door.h,
            vx: (Math.random() - 0.5) * 0.4,
            vy: -Math.random() * 0.4,
            color: '#c084fc',
            size: 2,
            alpha: 0.9,
            decay: 0.02
        });
    }

    ctx.restore();
}

function drawGate(gate) {
    ctx.save();
    
    // Stone Pillars
    ctx.fillStyle = '#334155';
    ctx.fillRect(gate.x, gate.y, 14, gate.h);
    ctx.fillRect(gate.x + gate.w - 14, gate.y, 14, gate.h);
    ctx.fillRect(gate.x, gate.y, gate.w, 14); // Lintel top
    
    // Stone foundations
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(gate.x - 4, gate.y + gate.h - 10, 22, 10);
    ctx.fillRect(gate.x + gate.w - 18, gate.y + gate.h - 10, 22, 10);
    
    // Energy core glow
    const coreGrad = ctx.createLinearGradient(gate.x, 0, gate.x + gate.w, 0);
    coreGrad.addColorStop(0, 'rgba(14, 165, 233, 0.05)');
    coreGrad.addColorStop(0.5, `rgba(56, 189, 248, ${0.35 + Math.sin(frame * 0.12) * 0.15})`);
    coreGrad.addColorStop(1, 'rgba(14, 165, 233, 0.05)');
    ctx.fillStyle = coreGrad;
    ctx.fillRect(gate.x + 14, gate.y + 14, gate.w - 28, gate.h - 14);

    // Floating gateway particles
    if (Math.random() < 0.18) {
        particles.push({
            x: gate.x + 14 + Math.random() * (gate.w - 28),
            y: gate.y + gate.h - 4,
            vx: 0,
            vy: -0.6 - Math.random() * 1.2,
            color: '#0ea5e9',
            size: 2 + Math.random() * 2,
            alpha: 0.8,
            decay: 0.015
        });
    }

    // Locked energy barrier for Round 9 Boss
    if (round === 9 && currentStageIdx === 2 && state === 'PLAYING') {
        const isBossDead = (stage.boss && stage.boss.hp <= 0);
        if (!isBossDead) {
            ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
            ctx.fillRect(gate.x + 14, gate.y + 14, gate.w - 28, gate.h - 14);
            
            // Draw a big warning lock cross
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(gate.x + 22, gate.y + 22);
            ctx.lineTo(gate.x + gate.w - 22, gate.y + gate.h - 22);
            ctx.moveTo(gate.x + gate.w - 22, gate.y + 22);
            ctx.lineTo(gate.x + 22, gate.y + gate.h - 22);
            ctx.stroke();
        }
    }

    ctx.restore();
}

function drawChest(chest) {
    ctx.save();
    
    // Chest Body
    ctx.fillStyle = '#78350f'; // Dark wood
    ctx.fillRect(chest.x, chest.y + 12, chest.w, chest.h - 12);
    
    // Gold straps
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(chest.x + 4, chest.y + 12, 4, chest.h - 12);
    ctx.fillRect(chest.x + chest.w - 8, chest.y + 12, 4, chest.h - 12);

    if (chest.opened) {
        // Open lid (flat outline on top)
        ctx.fillStyle = '#78350f';
        ctx.fillRect(chest.x - 4, chest.y, chest.w + 8, 8);
        
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(chest.x - 4, chest.y + 3, 3, 3);
        ctx.fillRect(chest.x + chest.w + 1, chest.y + 3, 3, 3);
        
        // Golden treasure glow inside
        ctx.fillStyle = 'rgba(251, 191, 36, 0.45)';
        ctx.fillRect(chest.x + 6, chest.y + 8, chest.w - 12, 4);
    } else {
        // Closed lid
        ctx.fillStyle = '#92400e';
        ctx.beginPath();
        ctx.roundRect(chest.x - 2, chest.y, chest.w + 4, 12, [6, 6, 0, 0]);
        ctx.fill();
        
        // Iron Lock
        ctx.fillStyle = '#475569';
        ctx.fillRect(chest.x + chest.w/2 - 4, chest.y + 8, 8, 6);
        ctx.fillStyle = '#000000';
        ctx.fillRect(chest.x + chest.w/2 - 1, chest.y + 11, 2, 3);
    }
    
    ctx.restore();
}

function drawPlayer() {
    ctx.save();
    
    // Invulnerability Flashing
    if (player.invulnerable && Math.floor(frame / 5) % 2 === 0) {
        ctx.globalAlpha = 0.25;
    }
    
    // Shift position relative to the camera
    const screenX = (state === 'TREASURE_ROOM') ? player.x : 400 - player.w/2;
    
    ctx.translate(screenX + player.w/2, player.y + player.h/2);
    
    // Draw Shield Bubble around player
    if (player.shield > 0) {
        ctx.save();
        
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 10;
        
        // Pulsate radius
        const radius = 28 + Math.sin(frame * 0.15) * 2;
        
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
        ctx.fill();
        
        // Rotating outer sheen arcs
        ctx.rotate(frame * 0.025);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, radius + 4, 0, Math.PI * 0.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, radius + 4, Math.PI, Math.PI * 1.3);
        ctx.stroke();
        
        ctx.restore();
    }
    
    // Running Animation bobbing
    let bob = 0;
    if (Math.abs(player.vx) > 0.4 && player.grounded) {
        bob = Math.sin(frame * 0.25) * 3;
    }
    ctx.translate(0, bob);
    
    if (player.facingLeft) {
        ctx.scale(-1, 1);
    }
    
    // Main Body Armor (Indigo-Blue Knight)
    ctx.fillStyle = '#4f46e5';
    ctx.beginPath();
    ctx.roundRect(-player.w/2, -player.h/2, player.w, player.h, 6);
    ctx.fill();
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // Visor Shield (Cyan neon glow)
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.roundRect(1, -player.h/2 + 5, player.w/2 - 2, 12, 3);
    ctx.fill();
    
    // Visor eye sparkle
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(player.w/4 - 1, -player.h/2 + 8, 3, 3);
    
    // Flowing Cape (Red)
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(-player.w/2, -player.h/4);
    let flowW = 14 + Math.abs(player.vx) * 3;
    let flowY = player.h/4 + (player.vy < 0 ? 4 : -2);
    ctx.quadraticCurveTo(-player.w/2 - flowW/2, -player.h/4 + flowY/2, -player.w/2 - flowW, -player.h/4 + flowY);
    ctx.lineTo(-player.w/2 - flowW, player.h/2 - 6);
    ctx.quadraticCurveTo(-player.w/2 - flowW/2, player.h/2 - 2, -player.w/2, player.h/4);
    ctx.closePath();
    ctx.fill();
    
    // Feet
    ctx.fillStyle = '#1e1b4b';
    let fOffset = 0;
    if (Math.abs(player.vx) > 0.4 && player.grounded) {
        fOffset = Math.sin(frame * 0.25) * 4;
    }
    ctx.fillRect(-player.w/3 - 2, player.h/2 - 2 + fOffset, 5, 5);
    ctx.fillRect(player.w/3 - 3, player.h/2 - 2 - fOffset, 5, 5);

    ctx.restore();
}

function drawEnemy(enemy) {
    ctx.save();
    
    // Flash when hurt
    if (enemy.hurtTimer > 0 && Math.floor(frame / 4) % 2 === 0) {
        ctx.globalAlpha = 0.35;
    }
    
    // Flip enemy upside down if flagged
    if (enemy.upsideDown) {
        ctx.translate(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
        ctx.scale(1, -1);
        ctx.translate(-(enemy.x + enemy.w / 2), -(enemy.y + enemy.h / 2));
    }
    
    // Base Slime/Critter color matching enemy types
    let color;
    switch (enemy.type) {
        case 'walker':
            color = '#10b981'; // Green walker
            break;
        case 'jumper':
            color = '#f59e0b'; // Orange jumper
            break;
        case 'fire_breather':
            color = '#ef4444'; // Red fire dragon
            break;
        case 'wizard':
            color = '#8b5cf6'; // Purple wizard
            break;
    }

    // Draw body
    ctx.fillStyle = color;
    ctx.beginPath();
    
    // Body compression for jumper
    let bobH = enemy.h;
    let bobW = enemy.w;
    if (enemy.type === 'jumper') {
        if (enemy.vy < 0) {
            bobH = enemy.h + 6;
            bobW = enemy.w - 4;
        } else if (enemy.vy > 0.5) {
            bobH = enemy.h - 4;
            bobW = enemy.w + 4;
        }
    }
    
    ctx.roundRect(enemy.x, enemy.y + (enemy.h - bobH), bobW, bobH, 6);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#ffffff';
    let dir = (enemy.vx >= 0) ? 1 : -1;
    if (enemy.type === 'fire_breather' || enemy.type === 'wizard') {
        dir = (player.x > enemy.x) ? 1 : -1;
    }
    
    // Left eye
    ctx.fillRect(enemy.x + enemy.w/2 + dir * 4 - 3, enemy.y + 6, 6, 6);
    // Pupils
    ctx.fillStyle = '#000000';
    ctx.fillRect(enemy.x + enemy.w/2 + dir * 4 - 2 + dir, enemy.y + 8, 3, 3);

    // Horns / wizard hat details
    if (enemy.type === 'wizard') {
        // Pointed Hat overlay
        ctx.fillStyle = '#5b21b6';
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y + 2);
        ctx.lineTo(enemy.x + enemy.w/2, enemy.y - 12);
        ctx.lineTo(enemy.x + enemy.w, enemy.y + 2);
        ctx.closePath();
        ctx.fill();
    } else if (enemy.type === 'fire_breather') {
        // snout/mouth flashes when shooting soon
        if (enemy.shootTimer < 25) {
            ctx.fillStyle = '#facc15';
            ctx.fillRect(enemy.x + enemy.w/2 + dir * 8 - 4, enemy.y + 12, 8, 6);
        }
    }

    // Render Spikes on Head
    if (enemy.spiked) {
        ctx.fillStyle = '#cbd5e1';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        const spikeCount = 3;
        const spikeW = enemy.w / spikeCount;
        for (let k = 0; k < spikeCount; k++) {
            ctx.beginPath();
            ctx.moveTo(enemy.x + k * spikeW, enemy.y);
            ctx.lineTo(enemy.x + k * spikeW + spikeW/2, enemy.y - 10);
            ctx.lineTo(enemy.x + (k + 1) * spikeW, enemy.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    }

    ctx.restore();
}

function drawBoss(boss) {
    ctx.save();
    
    // Boss flashing when hit
    if (boss.invulnerableTimer > 0 && Math.floor(frame / 4) % 2 === 0) {
        ctx.globalAlpha = 0.35;
    }

    // Radial gradient coloring (gets darker/fiery in higher rounds)
    const red = Math.max(70, 190 - boss.round * 10);
    const purple = Math.min(110, 30 + boss.round * 8);
    const grad = ctx.createRadialGradient(
        boss.x + boss.w/2, boss.y + boss.h/2, 5,
        boss.x + boss.w/2, boss.y + boss.h/2, boss.w/2
    );
    grad.addColorStop(0, `rgb(${red}, ${purple}, 50)`);
    grad.addColorStop(1, `rgb(${red - 40}, 12, 15)`);
    
    // Horned body
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(boss.x, boss.y, boss.w, boss.h, 14);
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Glowing golden eyes
    ctx.fillStyle = '#f59e0b';
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(boss.x + boss.w * 0.3, boss.y + boss.h * 0.38, 7 + boss.round * 0.4, 0, Math.PI * 2);
    ctx.arc(boss.x + boss.w * 0.7, boss.y + boss.h * 0.38, 7 + boss.round * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; // reset


    // Angry Grin
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(boss.x + boss.w * 0.28, boss.y + boss.h * 0.7);
    ctx.quadraticCurveTo(boss.x + boss.w/2, boss.y + boss.h * 0.88, boss.x + boss.w * 0.72, boss.y + boss.h * 0.7);
    ctx.stroke();

    // Invulnerability forcefield
    if (boss.invulnerableTimer > 0) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#0ea5e9';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(boss.x + boss.w/2, boss.y + boss.h/2, boss.w * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    ctx.restore();
}

function drawPotion(pot) {
    ctx.save();
    
    if (pot.type === 'shield') {
        // Glowing cyan crest shield
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = '#06b6d4';
        
        ctx.beginPath();
        ctx.moveTo(pot.x + pot.w/2, pot.y);
        ctx.lineTo(pot.x + pot.w - 2, pot.y + pot.h * 0.3);
        ctx.quadraticCurveTo(pot.x + pot.w - 4, pot.y + pot.h * 0.8, pot.x + pot.w/2, pot.y + pot.h);
        ctx.quadraticCurveTo(pot.x + 4, pot.y + pot.h * 0.8, pot.x + 2, pot.y + pot.h * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Draw inner star or cross lines for extra detail
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pot.x + pot.w/2, pot.y + 4);
        ctx.lineTo(pot.x + pot.w/2, pot.y + pot.h - 4);
        ctx.moveTo(pot.x + 6, pot.y + pot.h * 0.45);
        ctx.lineTo(pot.x + pot.w - 6, pot.y + pot.h * 0.45);
        ctx.stroke();
    } else {
        // Glowing capsule (Green for normal, Yellow/Gold for super)
        let color = pot.type === 'super' ? '#fbbf24' : '#10b981';
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = color;
        
        // Oval flask base
        ctx.beginPath();
        ctx.arc(pot.x + pot.w/2, pot.y + pot.h * 0.65, pot.w/2 - 2, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        
        // Neck & cork
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(pot.x + pot.w/2 - 3, pot.y + 3, 6, 5);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(pot.x + pot.w/2 - 2, pot.y, 4, 3);
    }
    
    ctx.restore();
}

function drawWeaponPickup(wp) {
    ctx.save();
    
    // Floating animation
    let bob = Math.sin(frame * 0.08 + wp.x) * 4;
    let y = wp.y + bob;
    
    // Outer glowing circle
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(wp.x + wp.w/2, y + wp.h/2, wp.w/2 + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0; // reset
    
    // Draw weapon inside
    ctx.translate(wp.x + wp.w/2, y + wp.h/2);
    if (wp.type === 'axe') {
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(2, -2, 5, -Math.PI/2, Math.PI/2);
        ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-5, -3, 6, 2.5);
    } else if (wp.type === 'javelin') {
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-6, 6);
        ctx.lineTo(6, -6);
        ctx.stroke();
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.moveTo(4, -4);
        ctx.lineTo(7, -7);
        ctx.lineTo(8, -2);
        ctx.closePath();
        ctx.fill();
    } else if (wp.type === 'knife') {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(-1, -4, 2, 6);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-2, 2, 4, 3);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-3, 1, 6, 1);
    }
    
    ctx.restore();
}

function drawProjectile(p) {
    ctx.save();
    
    if (p.isPlayerWeapon) {
        if (p.weaponType === 'axe') {
            ctx.translate(p.x + p.w/2, p.y + p.h/2);
            ctx.rotate(p.angle);
            ctx.fillStyle = '#94a3b8'; // steel blade
            ctx.beginPath();
            ctx.arc(3, 0, 8, -Math.PI/2, Math.PI/2);
            ctx.fill();
            ctx.fillStyle = '#78350f'; // wood handle
            ctx.fillRect(-7, -2, 10, 4);
        } else if (p.weaponType === 'javelin') {
            let angle = Math.atan2(p.vy, p.vx);
            ctx.translate(p.x + p.w/2, p.y + p.h/2);
            ctx.rotate(angle);
            ctx.fillStyle = '#78350f'; // shaft
            ctx.fillRect(-12, -1.5, 20, 3);
            ctx.fillStyle = '#cbd5e1'; // metal tip
            ctx.beginPath();
            ctx.moveTo(8, -4);
            ctx.lineTo(16, 0);
            ctx.lineTo(8, 4);
            ctx.closePath();
            ctx.fill();
        } else if (p.weaponType === 'knife') {
            let angle = Math.atan2(p.vy, p.vx);
            ctx.translate(p.x + p.w/2, p.y + p.h/2);
            ctx.rotate(angle);
            ctx.fillStyle = '#cbd5e1'; // blade
            ctx.fillRect(-2, -1.5, 10, 3);
            ctx.fillStyle = '#1e293b'; // handle
            ctx.fillRect(-6, -2, 4, 4);
            ctx.fillStyle = '#fbbf24'; // guard
            ctx.fillRect(-2, -4, 1.5, 8);
        }
    } else {
        let color = p.type === 'fire' ? '#ef4444' : '#c084fc';
        let coreColor = p.type === 'fire' ? '#facc15' : '#f472b6';
        
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x + p.w/2, p.y + p.h/2, p.w/2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = coreColor;
        ctx.beginPath();
        ctx.arc(p.x + p.w/2, p.y + p.h/2, p.w/4, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawGameEntities() {
    ctx.save();
    
    // Set camera offset translation
    const cameraX = (state === 'TREASURE_ROOM') ? 0 : player.x - 400;
    ctx.translate(-cameraX, 0);

    // Draw active elements
    if (state === 'PLAYING') {
        // 1. Platforms
        for (let pf of stage.platforms) {
            drawPlatform(pf, stage.theme);
        }
        // 2. Vines
        for (let vine of stage.vines) {
            drawVine(vine);
        }
        // 3. Hidden Door
        if (stage.hiddenDoor && !stage.hiddenDoor.opened) {
            drawHiddenDoor(stage.hiddenDoor);
        }
        // 4. Gate
        if (stage.gate) {
            drawGate(stage.gate);
        }
        // 5. Potions
        for (let pot of potions) {
            drawPotion(pot);
        }
        // 5b. Weapon Pickups
        for (let wp of weaponPickups) {
            drawWeaponPickup(wp);
        }
        // 6. Enemies
        for (let enemy of stage.enemies) {
            if (enemy.alive) drawEnemy(enemy);
        }
        // 7. Boss
        if (stage.boss) {
            drawBoss(stage.boss);
        }
    } else if (state === 'TREASURE_ROOM') {
        // Draw Treasure platforms
        for (let pf of treasureRoom.platforms) {
            drawPlatform(pf, '宝物庫');
        }
        // Exit Door
        ctx.fillStyle = '#78350f';
        ctx.fillRect(treasureRoom.exitDoor.x, treasureRoom.exitDoor.y, treasureRoom.exitDoor.w, treasureRoom.exitDoor.h);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(treasureRoom.exitDoor.x + treasureRoom.exitDoor.w - 8, treasureRoom.exitDoor.y + treasureRoom.exitDoor.h/2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1e1b4b';
        ctx.beginPath();
        ctx.roundRect(treasureRoom.exitDoor.x + 4, treasureRoom.exitDoor.y + 4, treasureRoom.exitDoor.w - 8, treasureRoom.exitDoor.h - 4, [8, 8, 0, 0]);
        ctx.fill();

        // Chest
        drawChest(treasureRoom.chest);
    }

    // 8. Projectiles
    for (let p of projectiles) {
        drawProjectile(p);
    }

    // 9. Particles
    for (let p of particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    
    ctx.restore();

    // 10. Player (Drawn on screen coordinate overlay mapping center if playing)
    drawPlayer();

    // 11. Screen-aligned Popups / Texts
    for (let p of popups) {
        ctx.fillStyle = p.color;
        ctx.font = "bold 16px 'Press Start 2P', monospace";
        ctx.textAlign = 'center';
        // Display relative to camera offset or fixed depending on room
        let px = p.x;
        if (state === 'PLAYING') px -= cameraX;
        ctx.fillText(p.text, px, p.y);
    }
}

// --- Main Game loop ---
function gameLoop() {
    if (state === 'TITLE') {
        isLoopRunning = false;
        return;
    }
    
    frame++;
    
    if (state === 'PLAYING' || state === 'TREASURE_ROOM') {
        updatePhysics();
    }
    
    // Rendering
    ctx.clearRect(0, 0, 800, 600);
    drawBackground();
    drawGameEntities();
    
    // Updates HUD overlays
    if (state === 'PLAYING' || state === 'TREASURE_ROOM' || state === 'PAUSED') {
        updateHUD();
        updateBossHUD();
    }
    
    if (state !== 'PAUSED' && state !== 'TITLE') {
        requestAnimationFrame(gameLoop);
    } else {
        isLoopRunning = false;
    }
}

function startLoop() {
    if (!isLoopRunning) {
        isLoopRunning = true;
        requestAnimationFrame(gameLoop);
    }
}

// AABB collision detection helper
function checkOverlap(rect1, rect2) {
    if (!rect1 || !rect2) return false;
    return rect1.x < rect2.x + rect2.w &&
           rect1.x + rect1.w > rect2.x &&
           rect1.y < rect2.y + rect2.h &&
           rect1.y + rect1.h > rect2.y;
}

// --- Initialization ---
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
} else {
    window.addEventListener('load', init);
}
