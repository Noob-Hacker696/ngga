import createHellbreakModule from "./game.js";

const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const overlay = document.querySelector("#overlay");
const overlayKicker = document.querySelector("#overlay-kicker");
const overlayTitle = document.querySelector("#overlay-title");
const overlayMessage = document.querySelector("#overlay-message");
const startButton = document.querySelector("#start-button");
const statusMessage = document.querySelector("#status");
const damageFlashElement = document.querySelector("#damage-flash");
const reloadPrompt = document.querySelector("#reload-prompt");
const crosshair = document.querySelector(".crosshair");
const levelText = document.querySelector("#level");
const levelNameText = document.querySelector("#level-name");
const healthText = document.querySelector("#health");
const healthBar = document.querySelector("#health-bar");
const ammoText = document.querySelector("#ammo");
const reserveText = document.querySelector("#reserve");
const killsText = document.querySelector("#kills");

const screenWidth = canvas.width;
const screenHeight = canvas.height;
const fieldOfView = Math.PI / 3;
const focalLength = screenWidth / (2 * Math.tan(fieldOfView / 2));
const cameraHeight = 0.48;
const horizon = Math.floor(screenHeight * 0.5);
const keys = new Set();
const wallDepth = new Float32Array(screenWidth);
const sceneImage = context.createImageData(screenWidth, screenHeight);
const rayCosines = new Float32Array(screenWidth);
const raySines = new Float32Array(screenWidth);
const deathSpriteCanvas = document.createElement("canvas");
deathSpriteCanvas.width = 112;
deathSpriteCanvas.height = 112;
const deathSpriteContext = deathSpriteCanvas.getContext("2d");
const wallTexture = createTexture("wall");
const floorTexture = createTexture("floor");
const ceilingTexture = createTexture("ceiling");
const weaponTexture = createTexture("weapon");
const leatherTexture = createTexture("leather");
const skinTexture = createTexture("skin");
const weaponPattern = context.createPattern(weaponTexture, "repeat");
const leatherPattern = context.createPattern(leatherTexture, "repeat");
const skinPattern = context.createPattern(skinTexture, "repeat");
const demonPatterns = [0, 1, 2, 3].map((variant) => context.createPattern(createTexture("demon", variant), "repeat"));
const wallTextureData = wallTexture.getContext("2d").getImageData(0, 0, wallTexture.width, wallTexture.height).data;
const floorTextureData = floorTexture.getContext("2d").getImageData(0, 0, floorTexture.width, floorTexture.height).data;
const ceilingTextureData = ceilingTexture.getContext("2d").getImageData(0, 0, ceilingTexture.width, ceilingTexture.height).data;
let game;
let running = false;
let gameFinished = false;
let mouseLookFallback = false;
let fallbackLastMouseX = null;
let previousTime = 0;
let painFlash = 0;
let damageShake = 0;
let weaponRecoil = 0;
let muzzleFlash = 0;
let reloadAnimation = 0;
let reloadPending = false;
const reloadDuration = 1.45;
let lastAnimationTimestamp = 0;
let levelComplete = false;
let lastHealthPickupsCollected = 0;
let audioContext;
let audioMasterGain;
let gunshotBuffer;
let gunshotLoadPromise;
let reloadBuffer;
let reloadLoadPromise;
let footstepsBuffer;
let footstepsLoadPromise;
let footstepsSource;
let victoryBuffer;
let victoryLoadPromise;
let eliminationBuffer;
let eliminationLoadPromise;
let ambientOscillators = [];
let footstepTimer = 0;
const enemyAudioState = [];
const deathAnimations = [];
const demonSprites = [0, 1, 2, 3].map((variant) => createDemonSprite(variant, demonPatterns[variant]));
const levelNames = ["Chindi", "Monsters Ain't tuff", "Nightmare Horde"];
const levelTints = [
    { red: 1.04, green: 0.96, blue: 0.86, wall: "rgba(132,58,27,0.10)" },
    { red: 0.82, green: 0.91, blue: 1.08, wall: "rgba(45,76,120,0.16)" },
    { red: 1.08, green: 0.82, blue: 0.84, wall: "rgba(130,24,34,0.18)" }
];

context.imageSmoothingEnabled = false;

function updateBrowserFullscreenLayout() {
    const fillsScreenWidth = window.innerWidth >= window.screen.availWidth - 80;
    const fillsScreenHeight = window.innerHeight >= window.screen.availHeight - 80;
    const isFullscreen = Boolean(document.fullscreenElement)
        || (fillsScreenWidth && fillsScreenHeight);
    document.body.classList.toggle("browser-fullscreen", isFullscreen);
}

window.addEventListener("resize", updateBrowserFullscreenLayout);
window.addEventListener("orientationchange", updateBrowserFullscreenLayout);
window.addEventListener("fullscreenchange", updateBrowserFullscreenLayout);
window.visualViewport?.addEventListener("resize", updateBrowserFullscreenLayout);
window.addEventListener("keydown", (event) => {
    if (event.key === "F11") {
        window.setTimeout(updateBrowserFullscreenLayout, 150);
    }
});
updateBrowserFullscreenLayout();

function initializeAudio() {
    if (audioContext) {
        if (audioContext.state === "suspended") {
            void audioContext.resume().catch((error) => {
                console.warn("Could not resume HELLBREAK audio:", error);
            }).then(startAmbientSound);
        }
        void loadGunshotSound();
        void loadReloadSound();
        void loadFootstepsSound();
        void loadVictorySong();
        void loadEliminationSound();
        return;
    }

    if (!window.AudioContext) {
        console.warn("Web Audio is unavailable; HELLBREAK will run without sound.");
        return;
    }

    try {
        audioContext = new window.AudioContext();
        audioMasterGain = audioContext.createGain();
        audioMasterGain.gain.value = 0.35;
        audioMasterGain.connect(audioContext.destination);
        void loadGunshotSound();
        void loadReloadSound();
        void loadFootstepsSound();
        void loadVictorySong();
        void loadEliminationSound();
        void audioContext.resume().catch((error) => {
            console.warn("Could not start HELLBREAK audio:", error);
        }).then(startAmbientSound);
    } catch (error) {
        console.warn("Could not initialize HELLBREAK audio:", error);
        audioContext = undefined;
        audioMasterGain = undefined;
    }
}

function loadGunshotSound() {
    if (!audioContext || gunshotBuffer || gunshotLoadPromise) {
        return gunshotLoadPromise;
    }

    gunshotLoadPromise = fetch(new URL("./assets/gun-shot-350315.mp3", import.meta.url))
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Gunshot audio request failed: ${response.status}`);
            }
            return response.arrayBuffer();
        })
        .then((audioData) => audioContext.decodeAudioData(audioData))
        .then((decodedAudio) => {
            gunshotBuffer = decodedAudio;
        })
        .catch((error) => {
            console.warn("Could not load the supplied gunshot sound; using the synthesized fallback.", error);
            gunshotLoadPromise = undefined;
        });
    return gunshotLoadPromise;
}

function loadReloadSound() {
    if (!audioContext || reloadBuffer || reloadLoadPromise) {
        return reloadLoadPromise;
    }

    reloadLoadPromise = fetch(new URL("./assets/universfield-gun-reload-123781.mp3", import.meta.url))
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Reload audio request failed: ${response.status}`);
            }
            return response.arrayBuffer();
        })
        .then((audioData) => audioContext.decodeAudioData(audioData))
        .then((decodedAudio) => {
            reloadBuffer = decodedAudio;
        })
        .catch((error) => {
            console.warn("Could not load the supplied reload sound; using the synthesized fallback.", error);
            reloadLoadPromise = undefined;
        });
    return reloadLoadPromise;
}

function loadFootstepsSound() {
    if (!audioContext || footstepsBuffer || footstepsLoadPromise) {
        return footstepsLoadPromise;
    }

    footstepsLoadPromise = fetch(new URL("./assets/footsteps-dirt-gravel-6823.mp3", import.meta.url))
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Footsteps audio request failed: ${response.status}`);
            }
            return response.arrayBuffer();
        })
        .then((audioData) => audioContext.decodeAudioData(audioData))
        .then((decodedAudio) => {
            footstepsBuffer = decodedAudio;
        })
        .catch((error) => {
            console.warn("Could not load the supplied footsteps sound; using the synthesized fallback.", error);
            footstepsLoadPromise = undefined;
        });
    return footstepsLoadPromise;
}

function loadVictorySong() {
    if (!audioContext || victoryBuffer || victoryLoadPromise) {
        return victoryLoadPromise;
    }

    victoryLoadPromise = fetch(new URL("./assets/romanceeeeeeeeeeeeee.mp3", import.meta.url))
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Victory song request failed: ${response.status}`);
            }
            return response.arrayBuffer();
        })
        .then((audioData) => audioContext.decodeAudioData(audioData))
        .then((decodedAudio) => {
            victoryBuffer = decodedAudio;
        })
        .catch((error) => {
            console.warn("Could not load the supplied victory song; using the synthesized fallback.", error);
            victoryLoadPromise = undefined;
        });
    return victoryLoadPromise;
}

function loadEliminationSound() {
    if (!audioContext || eliminationBuffer || eliminationLoadPromise) {
        return eliminationLoadPromise;
    }

    eliminationLoadPromise = fetch(new URL("./assets/kill.mp3", import.meta.url))
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Elimination sound request failed: ${response.status}`);
            }
            return response.arrayBuffer();
        })
        .then((audioData) => audioContext.decodeAudioData(audioData))
        .then((decodedAudio) => {
            eliminationBuffer = decodedAudio;
        })
        .catch((error) => {
            console.warn("Could not load the supplied elimination sound; using the synthesized fallback.", error);
            eliminationLoadPromise = undefined;
        });
    return eliminationLoadPromise;
}

function playEliminationSound() {
    if (!audioContext || !audioMasterGain) {
        return;
    }

    void loadEliminationSound().then(() => {
        if (eliminationBuffer) {
            const source = audioContext.createBufferSource();
            const gain = audioContext.createGain();
            source.buffer = eliminationBuffer;
            gain.gain.value = 0.75;
            source.connect(gain);
            gain.connect(audioMasterGain);
            source.start();
            return;
        }

        playTone(620, 390, 0.16, "triangle", 0.1);
        playNoise(0.12, 0.04, "lowpass", 260);
        window.setTimeout(() => playTone(390, 145, 0.65, "triangle", 0.13), 140);
    });
}

function playVictorySong() {
    if (!audioContext || !audioMasterGain) {
        return;
    }

    void loadVictorySong().then(() => {
        if (victoryBuffer) {
            const source = audioContext.createBufferSource();
            source.buffer = victoryBuffer;
            source.connect(audioMasterGain);
            source.start();
            return;
        }

        playMusic([
            [523, 0.22], [659, 0.22], [784, 0.22], [1047, 0.48],
            [784, 0.2], [880, 0.2], [1047, 0.58], [988, 0.2],
            [1047, 0.9]
        ], "triangle", 0.17);
    });
}

function syncFootstepAudio(isMoving) {
    if (!audioContext || !audioMasterGain) {
        return;
    }

    if (isMoving && footstepsBuffer && !footstepsSource) {
        footstepsSource = audioContext.createBufferSource();
        const gain = audioContext.createGain();
        const compressor = audioContext.createDynamicsCompressor();
        footstepsSource.buffer = footstepsBuffer;
        footstepsSource.loop = true;
        gain.gain.value = 1.2;
        compressor.threshold.value = -18;
        compressor.knee.value = 6;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.12;
        footstepsSource.connect(gain);
        gain.connect(compressor);
        compressor.connect(audioMasterGain);
        const source = footstepsSource;
        source.onended = () => {
            if (footstepsSource === source) {
                footstepsSource = undefined;
            }
        };
        source.start();
    } else if (!isMoving && footstepsSource) {
        stopFootstepAudio();
    }
}

function stopFootstepAudio() {
    if (!footstepsSource) {
        return;
    }

    const source = footstepsSource;
    footstepsSource = undefined;
    source.stop();
}

function playTone(startFrequency, endFrequency, duration, waveform, volume) {
    if (!audioContext || !audioMasterGain) {
        return;
    }

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(Math.max(1, startFrequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioMasterGain);
    oscillator.start(now);
    oscillator.stop(now + duration);
}

function playNoise(duration, volume, filterType, filterFrequency) {
    if (!audioContext || !audioMasterGain) {
        return;
    }

    const frameCount = Math.max(1, Math.floor(audioContext.sampleRate * duration));
    const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
        samples[index] = Math.random() * 2 - 1;
    }

    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.value = filterFrequency;
    gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioMasterGain);
    source.start(now);
    source.stop(now + duration);
}

function playMusic(notes, waveform, volume) {
    if (!audioContext || !audioMasterGain) {
        return;
    }

    let noteStart = audioContext.currentTime;
    for (const [frequency, duration] of notes) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = waveform;
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(volume, noteStart + 0.025);
        gain.gain.setValueAtTime(volume * 0.72, noteStart + duration * 0.65);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);
        oscillator.connect(gain);
        gain.connect(audioMasterGain);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + duration);
        noteStart += duration * 0.82;
    }
}

function playGameSound(name) {
    if (!audioContext || !audioMasterGain) {
        return;
    }

    switch (name) {
        case "shot":
            if (gunshotBuffer) {
                const source = audioContext.createBufferSource();
                const gain = audioContext.createGain();
                source.buffer = gunshotBuffer;
                gain.gain.value = 0.75;
                source.connect(gain);
                gain.connect(audioMasterGain);
                const shotStart = audioContext.currentTime;
                source.start(shotStart);
                source.stop(shotStart + Math.min(gunshotBuffer.duration, 1.2));
            } else {
                playNoise(0.16, 0.55, "lowpass", 1500);
                playTone(105, 38, 0.2, "sawtooth", 0.32);
            }
            break;
        case "dry":
            playTone(600, 240, 0.045, "square", 0.09);
            break;
        case "reload":
            if (reloadBuffer) {
                const source = audioContext.createBufferSource();
                const gain = audioContext.createGain();
                source.buffer = reloadBuffer;
                gain.gain.value = 0.75;
                source.connect(gain);
                gain.connect(audioMasterGain);
                source.start();
            } else {
                playTone(480, 720, 0.055, "square", 0.08);
            }
            break;
        case "reloadDone":
            playTone(820, 420, 0.07, "triangle", 0.08);
            break;
        case "hit":
            playTone(880, 1250, 0.075, "square", 0.08);
            break;
        case "heal":
            playTone(523, 784, 0.16, "sine", 0.11);
            window.setTimeout(() => playTone(784, 1047, 0.2, "sine", 0.1), 90);
            break;
        case "kill":
            playTone(520, 220, 0.18, "triangle", 0.13);
            break;
        case "damage":
            playNoise(0.2, 0.18, "lowpass", 420);
            playTone(115, 58, 0.2, "sawtooth", 0.12);
            break;
        case "enemyAttack":
            playNoise(0.12, 0.11, "bandpass", 540);
            playTone(190, 75, 0.16, "sawtooth", 0.09);
            break;
        case "projectile":
            playTone(520, 180, 0.24, "sawtooth", 0.09);
            break;
        case "footstep":
            playNoise(0.09, 0.2, "lowpass", 500);
            playTone(110, 48, 0.09, "triangle", 0.17);
            playNoise(0.035, 0.07, "highpass", 1500);
            break;
        case "level":
            playMusic([[523, 0.18], [659, 0.18], [784, 0.34], [1047, 0.52]], "triangle", 0.16);
            break;
        case "gameOver":
            playEliminationSound();
            break;
        case "victory":
            playVictorySong();
            break;
        case "ui":
            playTone(520, 760, 0.06, "triangle", 0.07);
            break;
        default:
            break;
    }
}

function startAmbientSound() {
    if (!audioContext || audioContext.state !== "running" || ambientOscillators.length > 0) {
        return;
    }

    const ambientGain = audioContext.createGain();
    ambientGain.gain.value = 0.035;
    ambientGain.connect(audioMasterGain);
    for (const frequency of [48, 51]) {
        const oscillator = audioContext.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(ambientGain);
        oscillator.start();
        ambientOscillators.push(oscillator);
    }
}

function stopAmbientSound() {
    for (const oscillator of ambientOscillators) {
        oscillator.stop();
    }
    ambientOscillators = [];
}

function resetEnemyAudioState() {
    enemyAudioState.length = 0;
    if (!game) {
        return;
    }
    for (let index = 0; index < game._game_get_enemy_count(); index += 1) {
        enemyAudioState.push({
            attackTime: game._game_get_enemy_attack_time(index),
            projectileActive: Boolean(game._game_get_enemy_projectile_active(index))
        });
    }
}

function updateEnemySounds() {
    for (let index = 0; index < game._game_get_enemy_count(); index += 1) {
        const attackTime = game._game_get_enemy_attack_time(index);
        const projectileActive = Boolean(game._game_get_enemy_projectile_active(index));
        const previous = enemyAudioState[index];
        if (previous && attackTime > previous.attackTime + 0.02) {
            playGameSound("enemyAttack");
        }
        if (previous && projectileActive && !previous.projectileActive) {
            playGameSound("projectile");
        }
        enemyAudioState[index] = { attackTime, projectileActive };
    }
}

for (let column = 0; column < screenWidth; column += 1) {
    const cameraOffset = (2 * column) / screenWidth - 1;
    const angleOffset = Math.atan(cameraOffset * Math.tan(fieldOfView / 2));
    rayCosines[column] = Math.cos(angleOffset);
    raySines[column] = Math.sin(angleOffset);
}

function drawPolygon(target, points, fill, stroke = "#231312", lineWidth = 2) {
    target.beginPath();
    target.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < points.length; index += 1) {
        target.lineTo(points[index][0], points[index][1]);
    }
    target.closePath();
    target.fillStyle = fill;
    target.fill();
    if (stroke) {
        target.strokeStyle = stroke;
        target.lineWidth = lineWidth;
        target.stroke();
    }
}

function createTexture(type, variant = 0) {
    const texture = document.createElement("canvas");
    const size = 64;
    texture.width = size;
    texture.height = size;
    const textureContext = texture.getContext("2d");
    let seed = type === "wall" ? 4171
        : type === "floor" ? 9829
            : type === "weapon" ? 6113
                : type === "leather" ? 7537
                    : type === "demon" ? 3469 + variant * 1877
                        : type === "skin" ? 5237
                        : 2819;

    function random() {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    }

    textureContext.imageSmoothingEnabled = false;
    if (type === "wall") {
        textureContext.fillStyle = "#211c1a";
        textureContext.fillRect(0, 0, size, size);
        const brickHeight = 16;
        for (let row = 0; row < size / brickHeight; row += 1) {
            const offset = row % 2 ? -16 : 0;
            for (let x = offset; x < size; x += 32) {
                const shade = Math.floor(random() * 22);
                textureContext.fillStyle = `rgb(${83 + shade},${51 + shade / 2},${39 + shade / 3})`;
                textureContext.fillRect(x + 1, row * brickHeight + 1, 30, 14);
                textureContext.fillStyle = "rgba(224,150,99,0.12)";
                textureContext.fillRect(x + 2, row * brickHeight + 2, 28, 2);
                textureContext.fillStyle = "rgba(0,0,0,0.2)";
                textureContext.fillRect(x + 2, row * brickHeight + 13, 28, 2);
                for (let fleck = 0; fleck < 7; fleck += 1) {
                    textureContext.fillStyle = random() > 0.5
                        ? "rgba(25,20,19,0.28)"
                        : "rgba(222,143,91,0.16)";
                    textureContext.fillRect(x + 3 + random() * 25, row * brickHeight + 4 + random() * 7, 2, 2);
                }
            }
        }
        textureContext.fillStyle = "rgba(14,12,12,0.64)";
        for (let y = 0; y < size; y += brickHeight) {
            textureContext.fillRect(0, y, size, 2);
        }
        for (let row = 0; row < size / brickHeight; row += 1) {
            for (let x = row % 2 ? 0 : 31; x < size; x += 32) {
                textureContext.fillRect(x, row * brickHeight, 2, brickHeight);
            }
        }
    } else if (type === "floor") {
        textureContext.fillStyle = "#211e1a";
        textureContext.fillRect(0, 0, size, size);
        for (let row = 0; row < 8; row += 1) {
            for (let column = 0; column < 4; column += 1) {
                const x = column * 16 + (row % 2) * 8;
                const y = row * 8;
                const shade = Math.floor(random() * 20);
                textureContext.fillStyle = `rgb(${74 + shade},${70 + shade},${61 + shade})`;
                textureContext.fillRect(x + 1, y + 1, 14, 6);
                textureContext.fillStyle = "rgba(206,184,147,0.18)";
                textureContext.fillRect(x + 2, y + 2, 10, 1);
                textureContext.fillStyle = "rgba(5,5,5,0.32)";
                textureContext.fillRect(x + 2, y + 6, 12, 1);
                textureContext.fillStyle = "#27221f";
                textureContext.fillRect(x, y, 1, 8);
            }
        }
        for (let chip = 0; chip < 90; chip += 1) {
            textureContext.fillStyle = random() > 0.5
                ? "rgba(226,211,182,0.19)"
                : "rgba(14,13,13,0.34)";
            textureContext.fillRect(random() * size, random() * size, 1 + random() * 2, 1);
        }
    } else if (type === "weapon") {
        textureContext.fillStyle = "#282a29";
        textureContext.fillRect(0, 0, size, size);
        for (let row = 0; row < size; row += 4) {
            const shade = Math.floor(random() * 18);
            textureContext.fillStyle = `rgba(${106 + shade},${106 + shade},${99 + shade},0.3)`;
            textureContext.fillRect(0, row, size, 1);
        }
        for (let scratch = 0; scratch < 76; scratch += 1) {
            const x = Math.floor(random() * size);
            const y = Math.floor(random() * size);
            const length = 2 + Math.floor(random() * 10);
            textureContext.fillStyle = random() > 0.48
                ? "rgba(172,165,143,0.38)"
                : "rgba(7,8,8,0.55)";
            textureContext.fillRect(x, y, length, 1);
            if (scratch % 5 === 0) {
                textureContext.fillStyle = "#171918";
                textureContext.fillRect(x + 2, y + 2, 2, 2);
                textureContext.fillStyle = "#9c927a";
                textureContext.fillRect(x + 2, y + 2, 1, 1);
            }
        }
        textureContext.fillStyle = "rgba(118,48,32,0.38)";
        for (let rust = 0; rust < 36; rust += 1) {
            textureContext.fillRect(random() * size, random() * size, 1 + random() * 3, 1);
        }
    } else if (type === "leather") {
        textureContext.fillStyle = "#44352d";
        textureContext.fillRect(0, 0, size, size);
        for (let row = 0; row < size; row += 5) {
            textureContext.fillStyle = row % 2 ? "rgba(10,9,9,0.22)" : "rgba(160,119,79,0.14)";
            textureContext.fillRect(0, row, size, 1);
        }
        for (let grain = 0; grain < 115; grain += 1) {
            textureContext.fillStyle = random() > 0.5
                ? "rgba(17,14,13,0.35)"
                : "rgba(184,137,91,0.2)";
            textureContext.fillRect(random() * size, random() * size, 1 + random() * 2, 1);
        }
        textureContext.strokeStyle = "rgba(18,14,13,0.52)";
        textureContext.setLineDash([2, 3]);
        textureContext.beginPath();
        textureContext.moveTo(6, 8);
        textureContext.lineTo(58, 8);
        textureContext.moveTo(6, 56);
        textureContext.lineTo(58, 56);
        textureContext.stroke();
        textureContext.setLineDash([]);
    } else if (type === "demon") {
        const baseColors = ["#382e29", "#35383a", "#303a34", "#342c40"];
        textureContext.fillStyle = baseColors[variant];
        textureContext.fillRect(0, 0, size, size);
        if (variant === 0) {
            for (let row = 0; row < size; row += 8) {
                for (let column = 0; column < size; column += 8) {
                    const x = column + ((row / 8) % 2) * 4;
                    textureContext.fillStyle = "rgba(12,10,9,0.42)";
                    textureContext.fillRect(x, row + 2, 5, 4);
                    textureContext.fillStyle = "rgba(193,124,78,0.3)";
                    textureContext.fillRect(x + 1, row + 1, 3, 1);
                    textureContext.fillStyle = "rgba(110,65,47,0.42)";
                    textureContext.fillRect(x + 1, row + 6, 3, 1);
                }
            }
        } else if (variant === 1) {
            for (let row = 0; row < size; row += 12) {
                for (let column = 0; column < size; column += 12) {
                    const offset = (row / 12) % 2 ? 6 : 0;
                    textureContext.fillStyle = "rgba(9,12,14,0.62)";
                    textureContext.fillRect(column + offset, row + 1, 10, 9);
                    textureContext.fillStyle = "rgba(174,167,151,0.3)";
                    textureContext.fillRect(column + offset + 1, row + 1, 8, 1);
                    textureContext.fillRect(column + offset + 1, row + 2, 1, 5);
                    textureContext.fillStyle = "rgba(18,19,20,0.72)";
                    textureContext.fillRect(column + offset + 2, row + 8, 7, 1);
                }
            }
        } else if (variant === 2) {
            for (let mark = 0; mark < 24; mark += 1) {
                const x = Math.floor(random() * size);
                const y = Math.floor(random() * size);
                const length = 4 + Math.floor(random() * 12);
                textureContext.strokeStyle = random() > 0.5
                    ? "rgba(12,18,14,0.64)"
                    : "rgba(134,177,111,0.38)";
                textureContext.lineWidth = 1;
                textureContext.beginPath();
                textureContext.moveTo(x, y);
                textureContext.lineTo(x + length * 0.45, y + 2);
                textureContext.lineTo(x + length, y - 2);
                textureContext.stroke();
            }
            for (let scale = 0; scale < 72; scale += 1) {
                textureContext.fillStyle = "rgba(149,173,120,0.22)";
                textureContext.fillRect(random() * size, random() * size, 2, 1);
            }
        } else {
            for (let row = 0; row < size; row += 10) {
                textureContext.fillStyle = "rgba(12,9,17,0.58)";
                textureContext.fillRect(0, row, size, 2);
                textureContext.fillStyle = "rgba(165,103,205,0.34)";
                textureContext.fillRect(0, row + 2, size, 1);
            }
            for (let rune = 0; rune < 20; rune += 1) {
                const x = Math.floor(random() * size);
                const y = Math.floor(random() * size);
                textureContext.strokeStyle = "rgba(213,156,244,0.54)";
                textureContext.lineWidth = 1;
                textureContext.beginPath();
                textureContext.moveTo(x, y);
                textureContext.lineTo(x + 3, y - 3);
                textureContext.lineTo(x + 5, y + 1);
                textureContext.stroke();
            }
        }
    } else if (type === "skin") {
        textureContext.fillStyle = "#73513f";
        textureContext.fillRect(0, 0, size, size);
        for (let grain = 0; grain < 130; grain += 1) {
            const shade = Math.floor(random() * 24);
            textureContext.fillStyle = random() > 0.53
                ? `rgba(${117 + shade},${81 + shade / 2},${59 + shade / 3},0.22)`
                : `rgba(37,23,19,${0.12 + random() * 0.16})`;
            textureContext.fillRect(random() * size, random() * size, 1 + random() * 2, 1);
        }
    } else {
        textureContext.fillStyle = "#1b1b1b";
        textureContext.fillRect(0, 0, size, size);
        for (let row = 0; row < 4; row += 1) {
            for (let column = 0; column < 4; column += 1) {
                const x = column * 16;
                const y = row * 16;
                const shade = Math.floor(random() * 15);
                textureContext.fillStyle = `rgb(${43 + shade},${44 + shade},${43 + shade})`;
                textureContext.fillRect(x + 1, y + 1, 14, 14);
                textureContext.fillStyle = "rgba(178,171,153,0.2)";
                textureContext.fillRect(x + 2, y + 2, 12, 1);
                textureContext.fillRect(x + 2, y + 3, 1, 4);
                textureContext.fillStyle = "rgba(0,0,0,0.42)";
                textureContext.fillRect(x + 2, y + 14, 12, 1);
                textureContext.fillRect(x + 14, y + 3, 1, 11);
                textureContext.strokeStyle = "rgba(11,11,11,0.55)";
                textureContext.beginPath();
                textureContext.moveTo(x + 5, y + 4);
                textureContext.lineTo(x + 8, y + 7);
                textureContext.lineTo(x + 7, y + 10);
                textureContext.lineTo(x + 11, y + 13);
                textureContext.stroke();
            }
        }
    }

    return texture;
}

function createDemonSprite(variant, texturePattern) {
    const sprite = document.createElement("canvas");
    sprite.width = 80;
    sprite.height = 96;
    const demon = sprite.getContext("2d");
    const palette = [
        { skin: "#684337", light: "#956247", dark: "#34231f", horn: "#bca27b", eyes: "#ffb65c", mark: "#d8aa58" },
        { skin: "#55585a", light: "#89877e", dark: "#252a2d", horn: "#d0c3a5", eyes: "#e88c53", mark: "#8f9695" },
        { skin: "#4c6250", light: "#829477", dark: "#24352c", horn: "#a9b58e", eyes: "#b7ed76", mark: "#91b96e" },
        { skin: "#594966", light: "#9179a2", dark: "#2c2335", horn: "#c5a7d7", eyes: "#ed8cff", mark: "#bd85d6" }
    ][variant];
    const { skin, dark: darkSkin } = palette;
    const lightSkin = palette.light;
    const fleshGradient = demon.createLinearGradient(18, 24, 61, 77);
    fleshGradient.addColorStop(0, lightSkin);
    fleshGradient.addColorStop(0.42, skin);
    fleshGradient.addColorStop(1, darkSkin);
    const hornGradient = demon.createLinearGradient(26, 6, 56, 27);
    hornGradient.addColorStop(0, palette.horn);
    hornGradient.addColorStop(0.48, "#88765f");
    hornGradient.addColorStop(1, "#40342d");

    demon.imageSmoothingEnabled = false;
    demon.fillStyle = "rgba(0,0,0,0.28)";
    demon.fillRect(19, 89, 43, 5);
    if (variant === 2) {
        drawPolygon(demon, [[49, 74], [60, 77], [67, 73], [72, 75],
            [64, 82], [57, 84], [51, 81]], darkSkin, "#26342b", 1);
        drawPolygon(demon, [[68, 75], [75, 70], [73, 78]], palette.mark, "#26342b", 1);
    }

    if (variant === 1) {
        drawPolygon(demon, [[25, 30], [13, 14], [30, 17], [36, 10], [42, 24]], hornGradient, "#302722", 1);
        drawPolygon(demon, [[46, 24], [52, 10], [60, 17], [75, 14], [57, 32]], hornGradient, "#302722", 1);
    } else if (variant === 3) {
        drawPolygon(demon, [[25, 30], [13, 15], [29, 19], [34, 3], [42, 23]], hornGradient, "#302722", 1);
        drawPolygon(demon, [[47, 23], [54, 3], [60, 19], [75, 15], [57, 32]], hornGradient, "#302722", 1);
    } else {
        drawPolygon(demon, [[25, 30], [16, 11], [30, 18], [36, variant === 2 ? 1 : 5], [41, 22]], hornGradient, "#302722", 1);
        drawPolygon(demon, [[47, 22], [53, variant === 2 ? 1 : 5], [60, 18], [72, 11], [58, 31]], hornGradient, "#302722", 1);
    }
    drawPolygon(demon, [[25, 32], [18, 30], [8, 24], [17, 40], [28, 43]], skin);
    drawPolygon(demon, [[55, 32], [63, 30], [73, 24], [65, 40], [53, 43]], skin);

    drawPolygon(demon, [[27, 24], [36, 19], [49, 20], [57, 28], [59, 43],
        [52, 52], [29, 51], [22, 42]], fleshGradient, darkSkin, 1);
    drawPolygon(demon, [[26, 34], [39, 38], [55, 32], [53, 45], [43, 52], [30, 46]], skin, null);
    drawPolygon(demon, [[27, 31], [38, 30], [37, 37], [29, 38]], darkSkin, null);
    drawPolygon(demon, [[46, 30], [56, 31], [53, 38], [45, 37]], darkSkin, null);
    demon.fillStyle = palette.eyes;
    demon.fillRect(31, 33, 4, 2);
    demon.fillRect(48, 33, 4, 2);
    demon.fillStyle = "#21100f";
    demon.fillRect(32, 33, 2, 2);
    demon.fillRect(49, 33, 2, 2);
    drawPolygon(demon, [[33, 43], [48, 42], [45, 50], [38, 52]], "#21100f", "#21100f", 1);
    drawPolygon(demon, [[35, 44], [39, 45], [38, 48]], "#cbb99b", null);
    drawPolygon(demon, [[45, 44], [48, 44], [45, 48]], "#cbb99b", null);
    demon.strokeStyle = "rgba(22,15,14,0.8)";
    demon.lineWidth = 1;
    demon.beginPath();
    demon.moveTo(41, 35);
    demon.lineTo(39, 42);
    demon.lineTo(42, 43);
    demon.stroke();

    drawPolygon(demon, [[20, 44], [28, 47], [34, 55], [25, 65], [12, 61], [10, 52]], skin);
    drawPolygon(demon, [[59, 44], [52, 47], [46, 55], [55, 65], [68, 61], [70, 52]], skin);
    if (variant === 2) {
        drawPolygon(demon, [[20, 48], [17, 41], [26, 47]], palette.mark, "#26342b", 1);
        drawPolygon(demon, [[60, 48], [63, 41], [54, 47]], palette.mark, "#26342b", 1);
    }
    drawPolygon(demon, [[27, 49], [37, 45], [49, 48], [57, 59], [54, 75],
        [45, 81], [34, 79], [24, 70]], fleshGradient, darkSkin, 1);
    if (variant === 1) {
        drawPolygon(demon, [[26, 55], [34, 51], [39, 57], [36, 73], [28, 69]], "#383d40", "#252a2d", 1);
        drawPolygon(demon, [[54, 55], [46, 51], [41, 57], [44, 73], [52, 69]], "#383d40", "#252a2d", 1);
        drawPolygon(demon, [[28, 59], [36, 57], [39, 61], [32, 65]], palette.mark, "#282727", 1);
        drawPolygon(demon, [[52, 59], [44, 57], [41, 61], [48, 65]], palette.mark, "#282727", 1);
    } else if (variant === 2) {
        drawPolygon(demon, [[18, 53], [25, 51], [28, 57], [23, 63]], palette.mark, "#253129", 1);
        drawPolygon(demon, [[62, 53], [55, 51], [52, 57], [57, 63]], palette.mark, "#253129", 1);
        drawPolygon(demon, [[34, 69], [40, 66], [46, 69], [43, 72], [37, 72]], "#a7d27b", null);
    } else if (variant === 3) {
        drawPolygon(demon, [[21, 48], [29, 45], [34, 54], [28, 62]], "#30263a", "#1f1925", 1);
        drawPolygon(demon, [[59, 48], [51, 45], [46, 54], [52, 62]], "#30263a", "#1f1925", 1);
        drawPolygon(demon, [[18, 53], [27, 49], [30, 56], [24, 66], [14, 63]], "#6b5878", "#2c2335", 1);
        drawPolygon(demon, [[62, 53], [53, 49], [50, 56], [56, 66], [66, 63]], "#6b5878", "#2c2335", 1);
        demon.strokeStyle = "#d8b8e9";
        demon.lineWidth = 1;
        demon.beginPath();
        demon.moveTo(20, 54);
        demon.lineTo(27, 57);
        demon.lineTo(22, 61);
        demon.moveTo(60, 54);
        demon.lineTo(53, 57);
        demon.lineTo(58, 61);
        demon.stroke();
    }
    drawPolygon(demon, [[33, 51], [39, 49], [40, 58], [36, 61]], "rgba(189,139,92,0.42)", null);
    drawPolygon(demon, [[47, 51], [42, 49], [41, 58], [45, 61]], "rgba(28,21,20,0.55)", null);
    drawPolygon(demon, [[31, 54], [38, 51], [40, 60], [36, 65]], darkSkin, null);
    drawPolygon(demon, [[48, 54], [41, 51], [40, 60], [44, 65]], darkSkin, null);
    drawPolygon(demon, [[37, 63], [42, 63], [40, 69]], "#8b6045", null);
    demon.fillStyle = darkSkin;
    demon.fillRect(35, 71, 12, 3);
    demon.strokeStyle = "#f0d7b4";
    demon.lineWidth = 1;
    demon.beginPath();
    demon.moveTo(37, 71);
    demon.lineTo(38, 75);
    demon.moveTo(44, 71);
    demon.lineTo(43, 75);
    demon.stroke();

    drawPolygon(demon, [[10, 57], [18, 58], [24, 66], [20, 78], [16, 87],
        [9, 87], [12, 78], [7, 75], [12, 69]], darkSkin);
    drawPolygon(demon, [[70, 57], [62, 58], [56, 66], [60, 78], [64, 87],
        [71, 87], [68, 78], [73, 75], [68, 69]], darkSkin);
    drawPolygon(demon, [[12, 58], [19, 60], [23, 67], [18, 72], [10, 68]], skin);
    drawPolygon(demon, [[68, 58], [61, 60], [57, 67], [62, 72], [70, 68]], skin);
    drawPolygon(demon, [[12, 84], [18, 83], [17, 90], [8, 91]], "#191515");
    drawPolygon(demon, [[62, 83], [68, 84], [72, 91], [63, 90]], "#191515");

    drawPolygon(demon, [[31, 76], [39, 79], [37, 88], [35, 94], [23, 94],
        [26, 88], [25, 81]], darkSkin);
    drawPolygon(demon, [[42, 79], [50, 76], [55, 81], [54, 88], [59, 94],
        [47, 94], [45, 88]], darkSkin);
    drawPolygon(demon, [[25, 89], [36, 89], [35, 94], [21, 95]], "#211717");
    drawPolygon(demon, [[45, 89], [56, 89], [61, 95], [47, 95]], "#211717");
    drawPolygon(demon, [[28, 59], [35, 58], [38, 61], [31, 64]], palette.mark, "#39221c", 1);
    drawPolygon(demon, [[45, 61], [48, 58], [55, 59], [52, 64]], palette.mark, "#39221c", 1);

    demon.save();
    demon.globalCompositeOperation = "source-atop";
    demon.globalAlpha = variant === 1 ? 0.48 : 0.4;
    demon.fillStyle = texturePattern;
    demon.fillRect(0, 0, sprite.width, sprite.height);
    demon.restore();

    demon.strokeStyle = "rgba(25,20,19,0.42)";
    demon.lineWidth = 1.5;
    demon.beginPath();
    demon.moveTo(28, 27);
    demon.lineTo(35, 24);
    demon.lineTo(39, 29);
    demon.moveTo(52, 28);
    demon.lineTo(46, 24);
    demon.lineTo(42, 29);
    demon.moveTo(31, 55);
    demon.lineTo(36, 58);
    demon.moveTo(49, 55);
    demon.lineTo(44, 58);
    demon.stroke();

    return sprite;
}

function drawWeapon(timestamp) {
    const moving = keys.has("w") || keys.has("a") || keys.has("s") || keys.has("d");
    const bob = moving ? Math.sin(timestamp * 0.012) * 2.5 : Math.sin(timestamp * 0.002) * 0.7;
    const recoil = -weaponRecoil * 11;
    const reloadProgress = 1 - reloadAnimation;
    const reloading = reloadAnimation > 0;
    const easeInOut = (t) => t * t * (3 - 2 * t);
    const lowered = 165;
    let reloadDrop = 0;
    let shellPhase = -1;
    let pump = 0;
    if (reloading) {
        if (reloadProgress < 0.22) {
            reloadDrop = easeInOut(reloadProgress / 0.22) * lowered;
        } else if (reloadProgress < 0.72) {
            const loadT = (reloadProgress - 0.22) / 0.5;
            shellPhase = (loadT * 4) % 1;
            reloadDrop = lowered - Math.sin(shellPhase * Math.PI) * 7;
        } else if (reloadProgress < 0.9) {
            reloadDrop = (1 - easeInOut((reloadProgress - 0.72) / 0.18)) * lowered;
        } else {
            pump = Math.sin((reloadProgress - 0.9) / 0.1 * Math.PI);
        }
    }
    const reloadDip = reloadDrop / lowered;
    const x = screenWidth / 2 + bob + reloadDip * 6;
    const y = 58 + reloadDrop + pump * 7;
    const skinGradient = context.createLinearGradient(-68, 229, 68, 258);
    skinGradient.addColorStop(0, "#a77a57");
    skinGradient.addColorStop(0.45, "#80543a");
    skinGradient.addColorStop(1, "#422d25");

    context.save();
    context.translate(x, y + recoil);
    context.scale(0.76, 0.76);
    context.rotate(reloadDip * 0.12 - pump * 0.03);

    drawPolygon(context, [[-69, 270], [-59, 226], [-39, 202], [-20, 193],
        [1, 202], [12, 232], [19, 270]], leatherPattern, "#201918", 3);
    drawPolygon(context, [[69, 270], [59, 226], [39, 202], [20, 193],
        [-1, 202], [-12, 232], [-19, 270]], leatherPattern, "#201918", 3);
    drawPolygon(context, [[-26, 226], [-24, 184], [-16, 153], [-7, 146],
        [7, 146], [16, 153], [24, 184], [26, 226]], weaponPattern, "#080b0c", 3);
    drawPolygon(context, [[-16, 196], [-12, 161], [-7, 156], [-3, 191],
        [-5, 216], [-16, 220]], "#3e4543", "#17191a", 2);
    drawPolygon(context, [[16, 196], [12, 161], [7, 156], [3, 191],
        [5, 216], [16, 220]], "#323735", "#17191a", 2);
    context.fillStyle = "#96917e";
    context.fillRect(-10, 162, 20, 3);
    context.fillStyle = "#090b0c";
    context.fillRect(-12, 150, 9, 13);
    context.fillRect(3, 150, 9, 13);
    context.fillStyle = "#79402f";
    context.fillRect(-9, 152, 5, 7);
    context.fillRect(4, 152, 5, 7);

    drawPolygon(context, [[-30, 222], [-27, 207], [-18, 200], [18, 200],
        [27, 207], [30, 222], [21, 238], [12, 244], [-12, 244], [-21, 238]],
    weaponPattern, "#0c0e0f", 3);
    drawPolygon(context, [[-23, 214], [-16, 207], [16, 207], [23, 214],
        [18, 220], [-18, 220]], "#65665e", "#15191a", 2);
    context.fillStyle = "#111516";
    context.fillRect(-19, 215, 38, 5);
    context.fillStyle = "#79513b";
    context.fillRect(-5, 208, 10, 3);
    context.fillStyle = "#a9a08c";
    context.fillRect(-2, 199, 4, 8);

    drawPolygon(context, [[-20, 230], [-12, 226], [10, 226], [19, 232],
        [14, 244], [10, 253], [16, 264], [11, 270], [-12, 270],
        [-17, 263], [-10, 250]], leatherPattern, "#101213", 3);
    drawPolygon(context, [[-13, 238], [-4, 235], [5, 238], [8, 249],
        [2, 255], [-7, 252]], "#16191a", "#080a0b", 2);
    context.fillStyle = "#79513b";
    context.fillRect(-18, 226, 36, 4);
    context.fillStyle = "#6b6d66";
    context.fillRect(-14, 231, 28, 2);

    drawPolygon(context, [[-82, 330], [-79, 275], [-68, 238], [-56, 222],
        [-42, 226], [-34, 243], [-35, 270], [-48, 302], [-52, 330]],
    leatherPattern, "#211817", 3);
    drawPolygon(context, [[82, 330], [79, 275], [68, 238], [56, 222],
        [42, 226], [34, 243], [35, 270], [48, 302], [52, 330]],
    leatherPattern, "#211817", 3);
    const leftHand = [[-68, 251], [-64, 234], [-55, 227], [-43, 230],
        [-35, 241], [-39, 252], [-49, 258], [-61, 256]];
    const rightHand = [[68, 251], [64, 234], [55, 227], [43, 230],
        [35, 241], [39, 252], [49, 258], [61, 256]];
    drawPolygon(context, leftHand, skinGradient, "#301b19", 2);
    drawPolygon(context, rightHand, skinGradient, "#301b19", 2);
    for (const hand of [leftHand, rightHand]) {
        context.save();
        context.beginPath();
        context.moveTo(hand[0][0], hand[0][1]);
        for (let point = 1; point < hand.length; point += 1) {
            context.lineTo(hand[point][0], hand[point][1]);
        }
        context.closePath();
        context.clip();
        context.globalAlpha = 0.24;
        context.fillStyle = skinPattern;
        context.fillRect(-72, 226, 144, 34);
        context.restore();
    }
    context.strokeStyle = "rgba(36,23,19,0.72)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-62, 237);
    context.lineTo(-56, 240);
    context.lineTo(-50, 239);
    context.moveTo(-59, 244);
    context.lineTo(-52, 247);
    context.moveTo(62, 237);
    context.lineTo(56, 240);
    context.lineTo(50, 239);
    context.moveTo(59, 244);
    context.lineTo(52, 247);
    context.stroke();
    context.fillStyle = "#c09469";
    context.fillRect(-59, 233, 4, 2);
    context.fillRect(55, 233, 4, 2);

    if (muzzleFlash > 0) {
        context.globalAlpha = Math.min(1, muzzleFlash * 15);
        drawPolygon(context, [[-13, 147], [-8, 135], [-3, 141], [0, 122],
            [4, 139], [10, 131], [8, 148]], "#ffe391", "#f15a2b", 2);
        context.globalAlpha = 1;
    }

    context.restore();

    if (shellPhase >= 0) {
        const shellX = screenWidth / 2 + 14 + shellPhase * -6;
        const shellY = screenHeight - 6 - Math.sin(shellPhase * Math.PI * 0.5) * 34;
        context.fillStyle = "#b3261e";
        context.fillRect(shellX, shellY, 6, 11);
        context.fillStyle = "#e3b55c";
        context.fillRect(shellX, shellY + 8, 6, 3);
        context.fillStyle = "rgba(255,255,255,0.35)";
        context.fillRect(shellX + 1, shellY + 1, 1, 6);
    }
}

function drawDeathAnimations(playerX, playerY, playerAngle, timestamp) {
    const directionX = Math.cos(playerAngle);
    const directionY = Math.sin(playerAngle);
    const focalLength = screenWidth / (2 * Math.tan(fieldOfView / 2));
    const baseline = screenHeight * 0.82;
    const visibleDeaths = [];

    for (const death of deathAnimations) {
        const differenceX = death.x - playerX;
        const differenceY = death.y - playerY;
        const depth = differenceX * directionX + differenceY * directionY;
        if (depth <= 0.1) {
            continue;
        }
        visibleDeaths.push({
            death,
            depth,
            lateral: -differenceX * directionY + differenceY * directionX
        });
    }

    visibleDeaths.sort((first, second) => second.depth - first.depth);

    for (const visible of visibleDeaths) {
        const { death, depth, lateral } = visible;
        const screenX = Math.floor(screenWidth / 2 + lateral / depth * focalLength);
        const progress = Math.min(1, death.elapsed / 0.68);
        const fade = death.elapsed < 1.6 ? 1 : Math.max(0, 1 - (death.elapsed - 1.6) / 2);
        const projectedDepth = Math.max(1.7, depth);
        const spriteHeight = Math.min(screenHeight * 0.68, focalLength * 0.62 / projectedDepth);
        const spriteWidth = spriteHeight * (112 / 112);
        const left = Math.floor(screenX - spriteWidth / 2);
        const projectedBaseline = horizon + focalLength * cameraHeight / projectedDepth;
        const top = projectedBaseline - spriteHeight;
        deathSpriteContext.setTransform(1, 0, 0, 1, 0, 0);
        deathSpriteContext.globalAlpha = 1;
        deathSpriteContext.globalCompositeOperation = "source-over";
        deathSpriteContext.clearRect(0, 0, deathSpriteCanvas.width, deathSpriteCanvas.height);
        const flash = Math.max(0, 1 - death.elapsed / 0.16);

        deathSpriteContext.translate(56, 90);
        deathSpriteContext.rotate(progress * 0.95);
        deathSpriteContext.scale(1.05, Math.max(0.3, 1 - progress * 0.65));
        deathSpriteContext.globalAlpha = fade;
        deathSpriteContext.drawImage(demonSprites[death.variant], -40, -96, 80, 96);
        if (flash > 0) {
            deathSpriteContext.globalCompositeOperation = "source-atop";
            deathSpriteContext.fillStyle = `rgba(255,230,190,${flash * 0.88})`;
            deathSpriteContext.fillRect(-45, -100, 90, 110);
        }

        for (let column = Math.max(0, left); column < Math.min(screenWidth, left + spriteWidth); column += 1) {
            if (depth >= wallDepth[column]) {
                continue;
            }
            const sourceX = ((column - left) / spriteWidth) * deathSpriteCanvas.width;
            context.drawImage(
                deathSpriteCanvas,
                sourceX, 0, Math.max(1, deathSpriteCanvas.width / spriteWidth), deathSpriteCanvas.height,
                column, top, 1, spriteHeight
            );
        }

        for (const particle of death.particles) {
            if (particle.life <= 0) {
                continue;
            }
            const particleX = particle.x - playerX;
            const particleY = particle.y - playerY;
            const particleDepth = particleX * directionX + particleY * directionY;
            if (particleDepth <= 0.1) {
                continue;
            }
            const particleLateral = -particleX * directionY + particleY * directionX;
            const x = Math.floor(screenWidth / 2 + particleLateral / particleDepth * focalLength);
            if (x < 0 || x >= screenWidth || particleDepth >= wallDepth[x]) {
                continue;
            }
            const y = Math.floor(baseline - particle.z * focalLength / particleDepth);
            const radius = Math.max(1, Math.min(5, Math.ceil(3 / particleDepth)));
            context.globalAlpha = Math.min(1, particle.life * 2);
            context.fillStyle = particle.z < 0.12 ? "#772019" : "#df3827";
            context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
            context.globalAlpha = 1;
        }
    }
}

function drawDamageEffect() {
    if (painFlash <= 0) {
        damageFlashElement.style.opacity = "0";
        return;
    }

    damageFlashElement.style.opacity = String(Math.min(0.9, painFlash * 2.1));
}

function showOverlay(kicker, title, message, buttonText) {
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    startButton.textContent = buttonText;
    overlay.hidden = false;
}

function updateHud() {
    const health = game._game_get_health();
    healthText.textContent = health;
    healthBar.style.width = `${health}%`;
    healthBar.style.background = health <= 30 ? "#ef4d34" : "#c33d2b";
    ammoText.textContent = game._game_get_ammo();
    reserveText.textContent = game._game_get_reserve_ammo();
    killsText.textContent = `${game._game_get_level_kills()}/${game._game_get_enemy_count()}`;
    levelText.textContent = `${game._game_get_level()} / ${game._game_get_level_count()}`;
    levelNameText.textContent = levelNames[game._game_get_level() - 1];
    const isOutOfAmmo = game._game_get_ammo() === 0;
    reloadPrompt.hidden = !isOutOfAmmo;
    if (isOutOfAmmo) {
        reloadPrompt.textContent = game._game_get_reserve_ammo() > 0
            ? "RELOAD PLEASE - PRESS R"
            : "NO AMMO LEFT";
    }
}

function fireWeapon() {
    if (reloadAnimation > 0) {
        return;
    }

    const enemiesBeforeShot = Array.from({ length: game._game_get_enemy_count() }, (_, index) => ({
        alive: Boolean(game._game_get_enemy_alive(index)),
        x: game._game_get_enemy_x(index),
        y: game._game_get_enemy_y(index),
        variant: game._game_get_enemy_type(index),
        health: game._game_get_enemy_health(index)
    }));
    const ammoBeforeShot = game._game_get_ammo();
    game._game_shoot();
    if (game._game_get_ammo() < ammoBeforeShot) {
        playGameSound("shot");
        weaponRecoil = 1;
        muzzleFlash = 0.12;
    } else if (ammoBeforeShot === 0) {
        playGameSound("dry");
    }
    let confirmedHit = false;
    let confirmedKill = false;
    for (let index = 0; index < enemiesBeforeShot.length; index += 1) {
        if (enemiesBeforeShot[index].alive && !game._game_get_enemy_alive(index)) {
            createDeathAnimation(
                index,
                enemiesBeforeShot[index].x,
                enemiesBeforeShot[index].y,
                enemiesBeforeShot[index].variant
            );
            confirmedHit = true;
            confirmedKill = true;
        } else if (enemiesBeforeShot[index].alive
            && game._game_get_enemy_health(index) < enemiesBeforeShot[index].health) {
            confirmedHit = true;
        }
    }
    if (confirmedHit) {
        playGameSound(confirmedKill ? "kill" : "hit");
        crosshair.classList.remove("confirmed");
        void crosshair.offsetWidth;
        crosshair.classList.add("confirmed");
        window.setTimeout(() => crosshair.classList.remove("confirmed"), 180);
    }
    updateHud();
}

function createDeathAnimation(index, x, y, variant) {
    const particleCount = 13;
    const particles = [];

    for (let particle = 0; particle < particleCount; particle += 1) {
        const angleAround = (Math.PI * 2 * particle) / particleCount + Math.random() * 0.3;
        const speed = 0.45 + Math.random() * 1.25;
        particles.push({
            x,
            y,
            z: 0.48 + Math.random() * 0.48,
            vx: Math.cos(angleAround) * speed,
            vy: Math.sin(angleAround) * speed,
            vz: 0.45 + Math.random() * 1.15,
            life: 0.8 + Math.random() * 0.35
        });
    }

    deathAnimations.push({
        index,
        variant,
        x,
        y,
        elapsed: 0,
        particles
    });
}

function updateDeathAnimations(deltaTime) {
    for (let index = deathAnimations.length - 1; index >= 0; index -= 1) {
        const death = deathAnimations[index];
        death.elapsed += deltaTime;
        for (const particle of death.particles) {
            if (particle.life <= 0) {
                continue;
            }
            particle.x += particle.vx * deltaTime;
            particle.y += particle.vy * deltaTime;
            particle.z += particle.vz * deltaTime;
            particle.vz -= 3.2 * deltaTime;
            particle.life -= deltaTime;
            if (particle.z < 0.08) {
                particle.z = 0.08;
                particle.vz *= -0.22;
                particle.vx *= 0.62;
                particle.vy *= 0.62;
            }
        }

        if (death.elapsed >= 3.6) {
            deathAnimations.splice(index, 1);
        }
    }
}

function renderWorld(timestamp = performance.now()) {
    const playerX = game._game_get_player_x();
    const playerY = game._game_get_player_y();
    const playerAngle = game._game_get_player_angle();
    const levelTint = levelTints[game._game_get_level() - 1];
    const shake = damageShake > 0 ? Math.sin(timestamp * 0.08) * damageShake * 5 : 0;

    context.save();
    context.translate(shake, damageShake > 0 ? Math.cos(timestamp * 0.1) * damageShake * 2 : 0);
    renderTexturedPlanes(playerX, playerY, playerAngle, levelTint);

    for (let column = 0; column < screenWidth; column += 1) {
        const rayAngle = playerAngle + Math.atan(
            ((2 * column) / screenWidth - 1) * Math.tan(fieldOfView / 2)
        );
        const rayDirectionX = Math.cos(rayAngle);
        const rayDirectionY = Math.sin(rayAngle);
        let mapX = Math.floor(playerX);
        let mapY = Math.floor(playerY);
        const deltaDistanceX = Math.abs(1 / (rayDirectionX || 1e-12));
        const deltaDistanceY = Math.abs(1 / (rayDirectionY || 1e-12));
        const stepX = rayDirectionX < 0 ? -1 : 1;
        const stepY = rayDirectionY < 0 ? -1 : 1;
        let sideDistanceX = rayDirectionX < 0
            ? (playerX - mapX) * deltaDistanceX
            : (mapX + 1 - playerX) * deltaDistanceX;
        let sideDistanceY = rayDirectionY < 0
            ? (playerY - mapY) * deltaDistanceY
            : (mapY + 1 - playerY) * deltaDistanceY;
        let hit = false;
        let side = 0;
        let steps = 0;

        while (!hit && steps < 48) {
            if (sideDistanceX < sideDistanceY) {
                sideDistanceX += deltaDistanceX;
                mapX += stepX;
                side = 0;
            } else {
                sideDistanceY += deltaDistanceY;
                mapY += stepY;
                side = 1;
            }
            hit = game._game_get_map_cell(mapX, mapY) === 35;
            steps += 1;
        }

        let distance = side === 0
            ? (mapX - playerX + (1 - stepX) / 2) / (rayDirectionX || 1e-12)
            : (mapY - playerY + (1 - stepY) / 2) / (rayDirectionY || 1e-12);
        distance = Math.max(0.12, distance * Math.cos(rayAngle - playerAngle));
        wallDepth[column] = distance;

        const wallHeight = Math.min(screenHeight * 3, screenHeight / distance);
        const wallTop = Math.floor(horizon - wallHeight / 2);
        const wallBottom = Math.ceil(horizon + wallHeight / 2);
        const hitPosition = side === 0
            ? playerY + ((mapX - playerX + (1 - stepX) / 2) / (rayDirectionX || 1e-12)) * rayDirectionY
            : playerX + ((mapY - playerY + (1 - stepY) / 2) / (rayDirectionY || 1e-12)) * rayDirectionX;
        const textureCoordinate = Math.floor((hitPosition - Math.floor(hitPosition)) * wallTexture.width);
        const textureColumn = side === 0
            ? wallTexture.width - 1 - textureCoordinate
            : textureCoordinate;
        const wallShade = Math.max(0.25, 1 - distance / 15) * (side === 1 ? 0.74 : 1);
        context.drawImage(
            wallTexture,
            textureColumn, 0, 1, wallTexture.height,
            column, wallTop, 1, wallBottom - wallTop
        );
        context.fillStyle = `rgba(0,0,0,${1 - wallShade})`;
        context.fillRect(column, wallTop, 1, wallBottom - wallTop);
        context.fillStyle = levelTint.wall;
        context.fillRect(column, wallTop, 1, wallBottom - wallTop);
    }

    drawHealthPickups(playerX, playerY, playerAngle, timestamp);
    drawEnemies(playerX, playerY, playerAngle, timestamp);
    drawEnemyProjectiles(playerX, playerY, playerAngle);
    drawDeathAnimations(playerX, playerY, playerAngle, timestamp);
    drawWeapon(timestamp);
    context.restore();
    drawDamageEffect();
}

function drawHealthPickups(playerX, playerY, playerAngle, timestamp) {
    const directionX = Math.cos(playerAngle);
    const directionY = Math.sin(playerAngle);
    const pickupCount = game._game_get_health_pickup_count();

    for (let index = 0; index < pickupCount; index += 1) {
        if (!game._game_get_health_pickup_alive(index)) {
            continue;
        }

        const x = game._game_get_health_pickup_x(index);
        const y = game._game_get_health_pickup_y(index);
        const differenceX = x - playerX;
        const differenceY = y - playerY;
        const depth = differenceX * directionX + differenceY * directionY;
        if (depth <= 0.1) {
            continue;
        }

        const lateral = -differenceX * directionY + differenceY * directionX;
        const screenX = Math.floor(screenWidth / 2 + lateral / depth * focalLength);
        if (screenX < 0 || screenX >= screenWidth || depth >= wallDepth[screenX]) {
            continue;
        }

        const size = Math.max(5, Math.min(42, focalLength * 0.12 / depth));
        const bob = Math.sin(timestamp * 0.004 + index * 2) * size * 0.12;
        const bottom = horizon + focalLength * cameraHeight / depth;
        const centerY = bottom - size * 0.55 + bob;
        const glowRadius = size * 1.15;
        const glow = context.createRadialGradient(screenX, centerY, 1, screenX, centerY, glowRadius);
        glow.addColorStop(0, "rgba(118,255,158,0.44)");
        glow.addColorStop(1, "rgba(67,210,113,0)");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(screenX, centerY, glowRadius, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = "#d9e7d0";
        context.fillRect(screenX - size * 0.34, centerY - size * 0.34, size * 0.68, size * 0.68);
        context.fillStyle = "#338c4d";
        context.fillRect(screenX - size * 0.24, centerY - size * 0.24, size * 0.48, size * 0.48);
        context.fillStyle = "#e9f5df";
        context.fillRect(screenX - size * 0.075, centerY - size * 0.19, size * 0.15, size * 0.38);
        context.fillRect(screenX - size * 0.19, centerY - size * 0.075, size * 0.38, size * 0.15);
        context.fillStyle = "rgba(255,255,255,0.55)";
        context.fillRect(screenX - size * 0.25, centerY - size * 0.25, size * 0.1, size * 0.1);
    }
}

function renderTexturedPlanes(playerX, playerY, playerAngle, levelTint) {
    const pixels = sceneImage.data;
    const baseDirectionX = Math.cos(playerAngle);
    const baseDirectionY = Math.sin(playerAngle);

    for (let row = 0; row < screenHeight; row += 1) {
        const verticalOffset = row - horizon;
        const isFloor = verticalOffset >= 0;
        const planeTexture = isFloor ? floorTextureData : ceilingTextureData;
        const verticalDistance = cameraHeight * focalLength / Math.max(1, Math.abs(verticalOffset));
        const shade = Math.max(0.18, 1 - verticalDistance / (isFloor ? 13 : 10));
        const verticalIndex = (row * screenWidth) * 4;

        for (let column = 0; column < screenWidth; column += 1) {
            const textureWorldX = playerX + (baseDirectionX * rayCosines[column]
                - baseDirectionY * raySines[column]) * verticalDistance;
            const textureWorldY = playerY + (baseDirectionY * rayCosines[column]
                + baseDirectionX * raySines[column]) * verticalDistance;
            const textureX = Math.floor(textureWorldX * 64) & 63;
            const textureY = Math.floor(textureWorldY * 64) & 63;
            const sourceIndex = (textureY * 64 + textureX) * 4;
            const targetIndex = verticalIndex + column * 4;
            pixels[targetIndex] = planeTexture[sourceIndex] * shade * levelTint.red;
            pixels[targetIndex + 1] = planeTexture[sourceIndex + 1] * shade * levelTint.green;
            pixels[targetIndex + 2] = planeTexture[sourceIndex + 2] * shade * levelTint.blue;
            pixels[targetIndex + 3] = 255;
        }
    }

    context.putImageData(sceneImage, 0, 0);
}

function drawEnemies(playerX, playerY, playerAngle, timestamp) {
    const enemies = [];
    const directionX = Math.cos(playerAngle);
    const directionY = Math.sin(playerAngle);

    for (let index = 0; index < game._game_get_enemy_count(); index += 1) {
        if (!game._game_get_enemy_alive(index)) {
            continue;
        }

        const x = game._game_get_enemy_x(index);
        const y = game._game_get_enemy_y(index);
        const differenceX = x - playerX;
        const differenceY = y - playerY;
        const depth = differenceX * directionX + differenceY * directionY;
        if (depth <= 0.1) {
            continue;
        }

        enemies.push({
            index,
            variant: game._game_get_enemy_type(index),
            health: game._game_get_enemy_health(index),
            maxHealth: game._game_get_enemy_max_health(index),
            hitTime: game._game_get_enemy_hit_time(index),
            x,
            y,
            depth,
            attackTime: game._game_get_enemy_attack_time(index),
            lateral: -differenceX * directionY + differenceY * directionX
        });
    }

    enemies.sort((first, second) => second.depth - first.depth);

    for (const enemy of enemies) {
        const screenX = Math.floor(screenWidth / 2 + enemy.lateral / enemy.depth
            * (screenWidth / (2 * Math.tan(fieldOfView / 2))));
        const depth = Math.max(1.7, enemy.depth);
        const baseSpriteHeight = Math.min(screenHeight * 0.68, focalLength * 0.62 / depth);
        const attackProgress = enemy.attackTime > 0
            ? 1 - enemy.attackTime / 0.48
            : 0;
        const attackSwing = enemy.attackTime > 0
            ? Math.sin(Math.max(0, Math.min(1, attackProgress)) * Math.PI)
            : 0;
        const lungeScale = 1 + attackSwing * 0.12;
        const spriteHeight = baseSpriteHeight * lungeScale;
        const spriteWidth = spriteHeight * (80 / 96);
        const left = Math.floor(screenX - spriteWidth / 2);
        const spriteBottom = horizon + focalLength * cameraHeight / depth;
        const top = spriteBottom - spriteHeight - attackSwing * 3;
        const sprite = demonSprites[enemy.variant];
        const spriteBob = Math.sin(timestamp * 0.004 + enemy.index * 1.7)
            * Math.min(2, baseSpriteHeight * 0.025);

        context.fillStyle = "rgba(0,0,0,0.45)";
        context.beginPath();
        context.ellipse(screenX, spriteBottom - 1, spriteWidth * 0.4, Math.max(2, spriteHeight * 0.055), 0, 0, Math.PI * 2);
        context.fill();

        for (let column = Math.max(0, left); column < Math.min(screenWidth, left + spriteWidth); column += 1) {
            if (enemy.depth >= wallDepth[column]) {
                continue;
            }

            const sourceX = ((column - left) / spriteWidth) * sprite.width;
            context.save();
            if (enemy.hitTime > 0) {
                context.filter = "brightness(1.7) sepia(0.85) saturate(5)";
            }
            context.drawImage(
                sprite,
                sourceX, 0, Math.max(1, sprite.width / spriteWidth), sprite.height,
                column, top + spriteBob, 1, spriteHeight
            );
            context.restore();
        }

        if (enemy.health < enemy.maxHealth) {
            const barWidth = Math.max(8, spriteWidth * 0.72);
            const barLeft = screenX - barWidth / 2;
            const barTop = Math.max(2, top + spriteBob - 5);
            context.fillStyle = "rgba(12,9,8,0.8)";
            context.fillRect(barLeft - 1, barTop - 1, barWidth + 2, 4);
            context.fillStyle = "#6b2019";
            context.fillRect(barLeft, barTop, barWidth, 2);
            context.fillStyle = enemy.hitTime > 0 ? "#fff0cd" : "#c84c35";
            context.fillRect(barLeft, barTop, barWidth * enemy.health / enemy.maxHealth, 2);
        }

        if (enemy.attackTime > 0) {
            context.save();
            context.beginPath();
            for (let column = Math.max(0, left); column < Math.min(screenWidth, left + spriteWidth); column += 1) {
                if (enemy.depth < wallDepth[column]) {
                    context.rect(column, top + spriteBob, 1, spriteHeight);
                }
            }
            context.clip();
            context.translate(left, top + spriteBob);
            context.scale(spriteWidth / 80, spriteHeight / 96);

            if (enemy.variant === 3) {
                const charge = 0.35 + attackSwing * 0.65;
                const glow = context.createRadialGradient(40, 46, 1, 40, 46, 15 + attackSwing * 9);
                glow.addColorStop(0, `rgba(255,230,255,${charge})`);
                glow.addColorStop(0.25, `rgba(221,119,255,${charge * 0.9})`);
                glow.addColorStop(1, "rgba(178,79,255,0)");
                context.fillStyle = glow;
                context.beginPath();
                context.arc(40, 46, 15 + attackSwing * 9, 0, Math.PI * 2);
                context.fill();
                context.strokeStyle = `rgba(232,174,255,${charge})`;
                context.lineWidth = 1.5;
                context.beginPath();
                context.arc(40, 46, 5 + attackSwing * 5, -0.5, Math.PI * 1.55);
                context.stroke();
            } else {
                const reach = 0.18 + attackSwing * 0.82;
                const leftWristX = 15 - reach * 9;
                const leftWristY = 62 - reach * 15;
                const rightWristX = 65 + reach * 9;
                const rightWristY = 62 - reach * 15;

                context.lineCap = "round";
                context.lineJoin = "round";
                context.strokeStyle = "#2c211d";
                context.lineWidth = 10;
                context.beginPath();
                context.moveTo(22, 61);
                context.lineTo(18 - reach * 5, 65 - reach * 8);
                context.lineTo(leftWristX, leftWristY);
                context.moveTo(58, 61);
                context.lineTo(62 + reach * 5, 65 - reach * 8);
                context.lineTo(rightWristX, rightWristY);
                context.stroke();
                context.strokeStyle = "#79503a";
                context.lineWidth = 6;
                context.stroke();
                context.strokeStyle = "rgba(190,139,92,0.68)";
                context.lineWidth = 1.5;
                context.beginPath();
                context.moveTo(20, 61);
                context.lineTo(17 - reach * 5, 64 - reach * 8);
                context.lineTo(leftWristX, leftWristY);
                context.moveTo(60, 61);
                context.lineTo(63 + reach * 5, 64 - reach * 8);
                context.lineTo(rightWristX, rightWristY);
                context.stroke();
                context.strokeStyle = "#d0b790";
                context.lineWidth = 1.4;
                context.beginPath();
                context.moveTo(leftWristX, leftWristY);
                context.lineTo(leftWristX - 3, leftWristY - 5);
                context.moveTo(leftWristX, leftWristY);
                context.lineTo(leftWristX + 1, leftWristY - 6);
                context.moveTo(rightWristX, rightWristY);
                context.lineTo(rightWristX + 3, rightWristY - 5);
                context.moveTo(rightWristX, rightWristY);
                context.lineTo(rightWristX - 1, rightWristY - 6);
                context.stroke();

                if (attackProgress > 0.2 && attackProgress < 0.78) {
                    context.globalAlpha = Math.sin((attackProgress - 0.2) / 0.58 * Math.PI) * 0.62;
                    context.strokeStyle = "#e9c29b";
                    context.lineWidth = 2.2;
                    context.beginPath();
                    context.moveTo(19, 57);
                    context.quadraticCurveTo(40, 75, 62, 55);
                    context.stroke();
                }
            }
            context.restore();
        }
    }
}

function drawEnemyProjectiles(playerX, playerY, playerAngle) {
    const directionX = Math.cos(playerAngle);
    const directionY = Math.sin(playerAngle);

    for (let index = 0; index < game._game_get_enemy_count(); index += 1) {
        if (!game._game_get_enemy_projectile_active(index)) {
            continue;
        }

        const projectileX = game._game_get_enemy_projectile_x(index);
        const projectileY = game._game_get_enemy_projectile_y(index);
        const differenceX = projectileX - playerX;
        const differenceY = projectileY - playerY;
        const depth = differenceX * directionX + differenceY * directionY;
        if (depth <= 0.1) {
            continue;
        }

        const lateral = -differenceX * directionY + differenceY * directionX;
        const screenX = Math.floor(screenWidth / 2 + lateral / depth * focalLength);
        if (screenX < 0 || screenX >= screenWidth || depth >= wallDepth[screenX]) {
            continue;
        }

        const groundY = horizon + focalLength * cameraHeight / depth;
        const screenY = groundY - focalLength * 0.3 / depth;
        const radius = Math.max(2, Math.min(9, focalLength * 0.065 / depth));
        const glow = context.createRadialGradient(screenX, screenY, 1, screenX, screenY, radius * 2.3);
        glow.addColorStop(0, "rgba(255,238,255,0.95)");
        glow.addColorStop(0.25, "rgba(231,126,255,0.9)");
        glow.addColorStop(0.58, "rgba(170,58,255,0.62)");
        glow.addColorStop(1, "rgba(137,37,255,0)");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(screenX, screenY, radius * 2.3, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#f4d8ff";
        context.fillRect(screenX - radius * 0.45, screenY - radius * 0.45, radius * 0.9, radius * 0.9);
    }
}

function animate(timestamp) {
    const frameDelta = lastAnimationTimestamp === 0
        ? 0
        : Math.min((timestamp - lastAnimationTimestamp) / 1000, 0.1);
    lastAnimationTimestamp = timestamp;
    painFlash = Math.max(0, painFlash - frameDelta * 2.4);
    damageShake = Math.max(0, damageShake - frameDelta * 3);
    weaponRecoil = Math.max(0, weaponRecoil - frameDelta * 4.5);
    muzzleFlash = Math.max(0, muzzleFlash - frameDelta);
    reloadAnimation = Math.max(0, reloadAnimation - frameDelta / reloadDuration);
    if (reloadPending && reloadAnimation <= 0) {
        reloadPending = false;
        if (game) {
            const ammoBeforeReload = game._game_get_ammo();
            game._game_reload();
            if (game._game_get_ammo() > ammoBeforeReload) {
                playGameSound("reloadDone");
            }
            updateHud();
        }
    }
    updateDeathAnimations(frameDelta);

    const isMoving = running && (keys.has("w") || keys.has("a") || keys.has("s") || keys.has("d"));
    syncFootstepAudio(isMoving);

    if (running) {
        const deltaTime = Math.min((timestamp - previousTime) / 1000, 0.1);
        const healthBeforeUpdate = game._game_get_health();
        previousTime = timestamp;
        game._game_move(
            Number(keys.has("w")) - Number(keys.has("s")),
            Number(keys.has("d")) - Number(keys.has("a")),
            deltaTime
        );
        game._game_update(deltaTime);
        updateEnemySounds();
        const pickupsCollected = game._game_get_health_pickups_collected();
        if (pickupsCollected > lastHealthPickupsCollected) {
            playGameSound("heal");
            lastHealthPickupsCollected = pickupsCollected;
        }
        if (isMoving && !footstepsBuffer) {
            footstepTimer -= deltaTime;
            if (footstepTimer <= 0) {
                playGameSound("footstep");
                footstepTimer = 0.42;
            }
        } else {
            footstepTimer = 0;
        }
        if (game._game_get_health() < healthBeforeUpdate) {
            const damageTaken = healthBeforeUpdate - game._game_get_health();
            playGameSound("damage");
            painFlash = Math.min(0.55, painFlash + 0.24 + damageTaken * 0.018);
            damageShake = Math.min(1, damageShake + 0.35 + damageTaken * 0.045);
        }
        renderWorld(timestamp);
        updateHud();

        if (game._game_get_health() <= 0) {
            running = false;
            syncFootstepAudio(false);
            stopAmbientSound();
            playGameSound("gameOver");
            document.exitPointerLock?.();
            showOverlay("YOU WERE OVERWHELMED", "You ain't tuff Bruh",
                `You eliminated ${game._game_get_kills()} demons across ${game._game_get_level()} levels.`,
                "PLAY AGAIN");
            gameFinished = true;
        } else if (game._game_get_level_kills() >= game._game_get_enemy_count()) {
            running = false;
            syncFootstepAudio(false);
            stopAmbientSound();
            document.exitPointerLock?.();
            levelComplete = true;
            const level = game._game_get_level();
            if (level >= game._game_get_level_count()) {
                playGameSound("victory");
                showOverlay("ALL LEVELS CLEARED", "You da real mogger bruh",
                    `You defeated all ${game._game_get_kills()} demons. The arena is yours.`,
                    "PLAY AGAIN");
                gameFinished = true;
                levelComplete = false;
            } else {
                playGameSound("level");
                showOverlay(`LEVEL ${level} CLEARED`, levelNames[level - 1],
                    `Next: ${levelNames[level]}. Recover 18 health and collect 8 reserve shells.`,
                    "NEXT LEVEL");
            }
        }
    } else {
        renderWorld(timestamp);
    }

    requestAnimationFrame(animate);
}

async function startGame() {
    if (!game) {
        return;
    }
    initializeAudio();
    playGameSound("ui");

    if (gameFinished || game._game_get_health() <= 0) {
        game._game_init();
        lastHealthPickupsCollected = game._game_get_health_pickups_collected();
        resetEnemyAudioState();
        reloadAnimation = 0;
        reloadPending = false;
        gameFinished = false;
        levelComplete = false;
        painFlash = 0;
        damageShake = 0;
        weaponRecoil = 0;
        muzzleFlash = 0;
        deathAnimations.length = 0;
        updateHud();
    } else if (levelComplete) {
        if (!game._game_advance_level()) {
            console.error("Could not advance HELLBREAK to the next level.");
            return;
        }
        lastHealthPickupsCollected = game._game_get_health_pickups_collected();
        resetEnemyAudioState();
        levelComplete = false;
        updateHud();
    }

    keys.clear();
    mouseLookFallback = false;
    fallbackLastMouseX = null;
    running = true;
    startAmbientSound();
    previousTime = performance.now();
    overlay.hidden = true;
    canvas.focus();

    if (document.pointerLockElement !== canvas && typeof canvas.requestPointerLock === "function") {
        try {
            await canvas.requestPointerLock();
        } catch {
            mouseLookFallback = true;
            statusMessage.textContent = "Pointer lock unavailable. Move the mouse to look; click to fire.";
            statusMessage.hidden = false;
            window.setTimeout(() => {
                statusMessage.hidden = true;
            }, 4000);
        }
    } else if (document.pointerLockElement !== canvas) {
        mouseLookFallback = true;
        statusMessage.textContent = "Pointer lock unavailable. Move the mouse to look; click to fire.";
        statusMessage.hidden = false;
        window.setTimeout(() => {
            statusMessage.hidden = true;
        }, 4000);
    }
}

startButton.addEventListener("click", () => {
    void startGame();
});

canvas.addEventListener("click", () => {
    if (running && document.pointerLockElement !== canvas) {
        fireWeapon();
    }
});

canvas.addEventListener("mousedown", (event) => {
    if (running && event.button === 0 && document.pointerLockElement === canvas) {
        fireWeapon();
    }
});

document.addEventListener("mousemove", (event) => {
    if (running && document.pointerLockElement === canvas) {
        game._game_rotate(event.movementX * 0.0025);
    } else if (running && mouseLookFallback) {
        if (fallbackLastMouseX !== null) {
            game._game_rotate((event.clientX - fallbackLastMouseX) * 0.0025);
        }
        fallbackLastMouseX = event.clientX;
    }
});

document.addEventListener("pointerlockchange", () => {
    if (running && document.pointerLockElement !== canvas && !mouseLookFallback) {
        running = false;
        syncFootstepAudio(false);
        stopAmbientSound();
        keys.clear();
        showOverlay("RUN PAUSED", "HELLBREAK",
            "Click resume to return to the arena.", "RESUME");
    }
});

document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === "escape" && running) {
        event.preventDefault();
        running = false;
        syncFootstepAudio(false);
        stopAmbientSound();
        playGameSound("ui");
        keys.clear();
        document.exitPointerLock?.();
        showOverlay("RUN PAUSED", "HELLBREAK",
            "Click resume to return to the arena.", "RESUME");
        return;
    }

    if (!running || !["w", "a", "s", "d", " ", "r"].includes(key)) {
        return;
    }

    event.preventDefault();
    if (key === " " && !event.repeat) {
        fireWeapon();
    } else if (key === "r" && !event.repeat) {
        if (reloadAnimation > 0) {
            return;
        }
        if (game._game_get_ammo() < 12 && game._game_get_reserve_ammo() > 0 && game._game_get_health() > 0) {
            reloadAnimation = 1;
            reloadPending = true;
            playGameSound("reload");
        }
        updateHud();
    } else {
        keys.add(key);
    }
});

document.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
});

window.addEventListener("blur", () => {
    keys.clear();
    syncFootstepAudio(false);
});

try {
    game = await createHellbreakModule();
    game._game_init();
    gameFinished = false;
    levelComplete = false;
    updateHud();
    statusMessage.hidden = true;
    showOverlay("ENTER THE ARENA", "HELLBREAK",
        "Three named levels. Four demon roles. Clear each wave to advance.", "START GAME");
    requestAnimationFrame(animate);
} catch (error) {
    console.error("Could not initialize the HELLBREAK WebAssembly module:", error);
    statusMessage.textContent = "Could not load game.wasm. Build the project with Emscripten and reload.";
    statusMessage.hidden = false;
    startButton.disabled = true;
    showOverlay("ENGINE ERROR", "WASM NOT FOUND",
        "Build the C game with Emscripten, then reload this page.", "ENGINE UNAVAILABLE");
    requestAnimationFrame(() => {
        context.fillStyle = "#201715";
        context.fillRect(0, 0, screenWidth, screenHeight);
    });
}
