// ============================================
// iOS UTILITIES
// ============================================

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let wakeLock = null;

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            document.getElementById('wakeLockIndicator').classList.add('active');
            wakeLock.addEventListener('release', () => {
                document.getElementById('wakeLockIndicator').classList.remove('active');
            });
        }
    } catch (err) {
        console.log('Wake Lock not available:', err);
    }
}

async function releaseWakeLock() {
    if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
    }
}

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && window.session?.isRunning) {
        await requestWakeLock();
    }
});

// ============================================
// FREQUENCY CALCULATIONS
// ============================================

const FREQ_432 = {
    D2: 72.08, A2: 108.00, D3: 144.16, E3: 162.04,
    'F#3': 181.63, G3: 192.43, A3: 216.00, B3: 243.07,
    D4: 288.33, A4: 432.00
};

const FREQ_440 = {
    D2: 73.42, A2: 110.00, D3: 146.83, E3: 164.81,
    'F#3': 185.00, G3: 196.00, A3: 220.00, B3: 246.94,
    D4: 293.66, A4: 440.00
};

const PRESETS = {
    free: { 
        name: 'Free Play', 
        isFreeMode: true,
        left: { note: 'D3', freq: 'D3' }, 
        right: { note: 'A3', freq: 'A3' } 
    },
    grounding: { name: 'Grounding', left: { note: 'D3', freq: 'D3' }, right: { note: 'A3', freq: 'A3' } },
    openHeart: { name: 'Open Heart', left: { note: 'D3', freq: 'D3' }, right: { note: 'F#3', freq: 'F#3' } },
    expansive: { name: 'Expansive', left: { note: 'A2', freq: 'A2' }, right: { note: 'E3', freq: 'E3' } },
    deepRoot: { name: 'Deep Root', left: { note: 'D2', freq: 'D2' }, right: { note: 'D3', freq: 'D3' } },
    celestial: { name: 'Celestial', left: { note: 'D3', freq: 'D3' }, right: { note: 'B3', freq: 'B3' } },
    sacredFourth: { name: 'Sacred Fourth', left: { note: 'D3', freq: 'D3' }, right: { note: 'G3', freq: 'G3' } },
    overtone: {
        name: 'Overtone Journey',
        sequence: [
            { left: 'D2', right: 'D3' },
            { left: 'D3', right: 'A3' },
            { left: 'A3', right: 'D4' },
            { left: 'D3', right: 'A3' },
            { left: 'D2', right: 'D3' }
        ]
    }
};

// Note mapping for interval buttons (display name -> frequency key)
const NOTE_MAP = {
    'D2': 'D2', 'A2': 'A2', 'D3': 'D3', 'E3': 'E3',
    'F#3': 'F#3', 'G3': 'G3', 'A3': 'A3', 'B3': 'B3',
    'D4': 'D4', 'A4': 'A4'
};

// Phase definitions with percentages
const PHASES = [
    { name: 'Settling', icon: '🌱', guidance: 'Begin softly, invite presence', start: 0, end: 0.2 },
    { name: 'Deepening', icon: '🌊', guidance: 'Build resonance gradually', start: 0.2, end: 0.4 },
    { name: 'Peak', icon: '✨', guidance: 'Full expression, hold space', start: 0.4, end: 0.7 },
    { name: 'Softening', icon: '🍃', guidance: 'Gently reduce intensity', start: 0.7, end: 0.9 },
    { name: 'Return', icon: '🏠', guidance: 'Ground the journey home', start: 0.9, end: 1.0 }
];

// ============================================
// AUDIO ENGINE
// ============================================

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.leftGain = null;
        this.rightGain = null;
        this.leftOsc = null;
        this.rightOsc = null;
        this.leftPanner = null;
        this.rightPanner = null;
        this.isPlaying = false;
        this.isUnlocked = false;
        this.detuneActive = false;
        this.detuneInterval = null;
        this.targetMasterVolume = 0.8;
    }

    async init() {
        if (this.ctx) return true;
        
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            
            if (this.ctx.state === 'suspended') {
                await this.ctx.resume();
            }
            
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
            this.masterGain.gain.value = 0;

            this.leftPanner = this.ctx.createStereoPanner();
            this.leftPanner.pan.value = -1;
            this.leftPanner.connect(this.masterGain);

            this.rightPanner = this.ctx.createStereoPanner();
            this.rightPanner.pan.value = 1;
            this.rightPanner.connect(this.masterGain);

            this.leftGain = this.ctx.createGain();
            this.leftGain.connect(this.leftPanner);
            this.leftGain.gain.value = 0.7;

            this.rightGain = this.ctx.createGain();
            this.rightGain.connect(this.rightPanner);
            this.rightGain.gain.value = 0.7;

            // iOS silent buffer unlock
            const silentBuffer = this.ctx.createBuffer(1, 1, 22050);
            const source = this.ctx.createBufferSource();
            source.buffer = silentBuffer;
            source.connect(this.ctx.destination);
            source.start(0);
            
            this.isUnlocked = true;
            return true;
        } catch (err) {
            console.error('Audio init failed:', err);
            return false;
        }
    }

    async ensureContext() {
        if (!this.ctx) await this.init();
        if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
    }

    async start(leftFreq, rightFreq, fadeTime = 3) {
        await this.ensureContext();
        if (!this.ctx) return;

        this.stopOscillators();

        this.leftOsc = this.ctx.createOscillator();
        this.leftOsc.type = 'sine';
        this.leftOsc.frequency.value = leftFreq;
        this.leftOsc.connect(this.leftGain);

        this.rightOsc = this.ctx.createOscillator();
        this.rightOsc.type = 'sine';
        this.rightOsc.frequency.value = rightFreq;
        this.rightOsc.connect(this.rightGain);

        this.leftOsc.start();
        this.rightOsc.start();

        const now = this.ctx.currentTime;
        this.masterGain.gain.setValueAtTime(0, now);
        this.masterGain.gain.linearRampToValueAtTime(this.targetMasterVolume, now + fadeTime);

        this.isPlaying = true;

        if (this.detuneActive) this.startDetune();
    }

    stopOscillators() {
        if (this.leftOsc) { try { this.leftOsc.stop(); } catch(e) {} this.leftOsc = null; }
        if (this.rightOsc) { try { this.rightOsc.stop(); } catch(e) {} this.rightOsc = null; }
    }

    stop(fadeTime = 3) {
        if (!this.isPlaying || !this.ctx) return;
        this.stopDetune();

        const now = this.ctx.currentTime;
        const currentGain = this.masterGain.gain.value;
        this.masterGain.gain.setValueAtTime(currentGain, now);
        this.masterGain.gain.linearRampToValueAtTime(0, now + fadeTime);

        setTimeout(() => {
            this.stopOscillators();
            this.isPlaying = false;
        }, fadeTime * 1000 + 100);
    }

    async setFrequencies(leftFreq, rightFreq, transitionTime = 2) {
        // If not playing but we have a context, try to resume it
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
        
        // If still not playing or no oscillators, restart the audio
        if (!this.isPlaying || !this.leftOsc || !this.rightOsc) {
            await this.start(leftFreq, rightFreq, transitionTime);
            return;
        }
        
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        
        if (this.leftOsc) {
            this.leftOsc.frequency.setValueAtTime(this.leftOsc.frequency.value, now);
            this.leftOsc.frequency.linearRampToValueAtTime(leftFreq, now + transitionTime);
        }
        if (this.rightOsc) {
            this.rightOsc.frequency.setValueAtTime(this.rightOsc.frequency.value, now);
            this.rightOsc.frequency.linearRampToValueAtTime(rightFreq, now + transitionTime);
        }
    }

    setMasterVolume(value) {
        this.targetMasterVolume = value;
        if (!this.masterGain || !this.ctx) return;
        this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
    }

    setLeftVolume(value) {
        if (!this.leftGain || !this.ctx) return;
        this.leftGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
    }

    setRightVolume(value) {
        if (!this.rightGain || !this.ctx) return;
        this.rightGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.1);
    }

    setDetune(active) {
        this.detuneActive = active;
        if (active && this.isPlaying) this.startDetune();
        else this.stopDetune();
    }

    startDetune() {
        if (this.detuneInterval) return;
        this.detuneInterval = setInterval(() => {
            if (!this.leftOsc || !this.rightOsc || !this.ctx) return;
            const leftDetune = (Math.random() - 0.5) * 3;
            const rightDetune = (Math.random() - 0.5) * 3;
            this.leftOsc.detune.setTargetAtTime(leftDetune, this.ctx.currentTime, 0.5);
            this.rightOsc.detune.setTargetAtTime(rightDetune, this.ctx.currentTime, 0.5);
        }, 2000);
    }

    stopDetune() {
        if (this.detuneInterval) { clearInterval(this.detuneInterval); this.detuneInterval = null; }
        if (this.leftOsc && this.ctx) this.leftOsc.detune.setTargetAtTime(0, this.ctx.currentTime, 0.3);
        if (this.rightOsc && this.ctx) this.rightOsc.detune.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    }

    // Set stereo pan position (-1 to 1)
    setPan(pan) {
        if (!this.ctx || !this.leftPanner || !this.rightPanner) return;
        const now = this.ctx.currentTime;
        // Shift both panners together to create movement
        const leftPan = Math.max(-1, Math.min(0, -1 + pan * 0.5 + 0.5));
        const rightPan = Math.min(1, Math.max(0, 1 + pan * 0.5 - 0.5));
        this.leftPanner.pan.setTargetAtTime(leftPan, now, 0.1);
        this.rightPanner.pan.setTargetAtTime(rightPan, now, 0.1);
    }

    // Reset pan to default stereo position
    resetPan() {
        if (!this.ctx || !this.leftPanner || !this.rightPanner) return;
        const now = this.ctx.currentTime;
        this.leftPanner.pan.setTargetAtTime(-1, now, 0.3);
        this.rightPanner.pan.setTargetAtTime(1, now, 0.3);
    }

    // Get current master gain for pulse effect
    getCurrentMasterGain() {
        return this.masterGain ? this.masterGain.gain.value : 0;
    }

    // Momentary pulse on volume
    pulseVolume(intensity = 0.15) {
        if (!this.ctx || !this.masterGain || !this.isPlaying) return;
        const now = this.ctx.currentTime;
        const currentGain = this.targetMasterVolume;
        const pulseGain = Math.min(1, currentGain * (1 + intensity));
        
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(currentGain, now);
        this.masterGain.gain.linearRampToValueAtTime(pulseGain, now + 0.1);
        this.masterGain.gain.linearRampToValueAtTime(currentGain, now + 0.4);
    }
}

// ============================================
// LIVE EFFECTS CONTROLLER
// ============================================

class LiveEffectsController {
    constructor(audioEngine) {
        this.audio = audioEngine;
        
        // Effect states
        this.pulseActive = false;
        this.pulseInterval = null;
        this.pulseBPM = 60;
        
        this.panDriftActive = false;
        this.panDriftInterval = null;
        this.panDriftSpeed = 8;
        this.panPosition = 0;
        this.panDirection = 1;
        
        this.breathActive = false;
        this.breathInterval = null;
        this.breathCycle = 8;
        this.breathPhase = 0;
        
        this.swellActive = false;
        this.swellInterval = null;
        this.swellPeriod = 30;
        this.swellPhase = 0;
        this.baseVolume = 0.8;
        
        this.initElements();
        this.initEventListeners();
    }

    initElements() {
        // Pulse effect
        this.pulseToggle = document.getElementById('pulseToggle');
        this.pulseRateSlider = document.getElementById('pulseRateSlider');
        this.pulseRateValue = document.getElementById('pulseRateValue');
        this.pulseVisualizer = document.getElementById('pulseVisualizer');
        this.pulseCard = document.getElementById('pulseEffectCard');
        
        // Pan drift effect
        this.panDriftToggle = document.getElementById('panDriftToggle');
        this.panDriftSpeedSlider = document.getElementById('panDriftSpeedSlider');
        this.panDriftSpeedValue = document.getElementById('panDriftSpeedValue');
        this.panDot = document.getElementById('panDot');
        this.panCard = document.getElementById('panDriftCard');
        
        // Breath guide
        this.breathToggle = document.getElementById('breathToggle');
        this.breathCycleSlider = document.getElementById('breathCycleSlider');
        this.breathCycleValue = document.getElementById('breathCycleValue');
        this.breathRing = document.getElementById('breathRing');
        this.breathText = document.getElementById('breathText');
        this.breathCard = document.getElementById('breathPacerCard');
        
        // Volume swell
        this.swellToggle = document.getElementById('swellToggle');
        this.swellPeriodSlider = document.getElementById('swellPeriodSlider');
        this.swellPeriodValue = document.getElementById('swellPeriodValue');
        this.swellBar = document.getElementById('swellBar');
        this.swellCard = document.getElementById('swellCard');
    }

    initEventListeners() {
        // Pulse effect
        this.pulseToggle?.addEventListener('click', () => this.togglePulse());
        this.pulseRateSlider?.addEventListener('input', () => {
            this.pulseBPM = parseInt(this.pulseRateSlider.value);
            this.pulseRateValue.textContent = this.pulseBPM;
            if (this.pulseActive) {
                this.stopPulse();
                this.startPulse();
            }
        });
        
        // Pan drift effect
        this.panDriftToggle?.addEventListener('click', () => this.togglePanDrift());
        this.panDriftSpeedSlider?.addEventListener('input', () => {
            this.panDriftSpeed = parseInt(this.panDriftSpeedSlider.value);
            this.panDriftSpeedValue.textContent = this.panDriftSpeed + 's';
        });
        
        // Breath guide
        this.breathToggle?.addEventListener('click', () => this.toggleBreath());
        this.breathCycleSlider?.addEventListener('input', () => {
            this.breathCycle = parseInt(this.breathCycleSlider.value);
            this.breathCycleValue.textContent = this.breathCycle + 's';
            if (this.breathActive) {
                this.updateBreathAnimation();
            }
        });
        
        // Volume swell
        this.swellToggle?.addEventListener('click', () => this.toggleSwell());
        this.swellPeriodSlider?.addEventListener('input', () => {
            this.swellPeriod = parseInt(this.swellPeriodSlider.value);
            this.swellPeriodValue.textContent = this.swellPeriod + 's';
        });
    }

    // ========== PULSE EFFECT ==========
    togglePulse() {
        if (this.pulseActive) {
            this.stopPulse();
        } else {
            this.startPulse();
        }
    }

    startPulse() {
        this.pulseActive = true;
        this.pulseToggle.textContent = 'On';
        this.pulseToggle.classList.add('active');
        this.pulseCard.classList.add('active');
        this.pulseVisualizer.classList.add('active');
        
        const intervalMs = (60 / this.pulseBPM) * 1000;
        this.pulseVisualizer.style.animationDuration = (intervalMs / 1000) + 's';
        
        this.pulseInterval = setInterval(() => {
            this.audio.pulseVolume(0.12);
        }, intervalMs);
    }

    stopPulse() {
        this.pulseActive = false;
        this.pulseToggle.textContent = 'Off';
        this.pulseToggle.classList.remove('active');
        this.pulseCard.classList.remove('active');
        this.pulseVisualizer.classList.remove('active');
        
        if (this.pulseInterval) {
            clearInterval(this.pulseInterval);
            this.pulseInterval = null;
        }
    }

    // ========== PAN DRIFT EFFECT ==========
    togglePanDrift() {
        if (this.panDriftActive) {
            this.stopPanDrift();
        } else {
            this.startPanDrift();
        }
    }

    startPanDrift() {
        this.panDriftActive = true;
        this.panDriftToggle.textContent = 'On';
        this.panDriftToggle.classList.add('active');
        this.panCard.classList.add('active');
        
        this.panPosition = 0;
        this.panDirection = 1;
        
        this.panDriftInterval = setInterval(() => {
            // Calculate pan step based on speed
            const step = 2 / (this.panDriftSpeed * 20); // Full sweep in panDriftSpeed seconds
            
            this.panPosition += step * this.panDirection;
            
            if (this.panPosition >= 1) {
                this.panPosition = 1;
                this.panDirection = -1;
            } else if (this.panPosition <= -1) {
                this.panPosition = -1;
                this.panDirection = 1;
            }
            
            this.audio.setPan(this.panPosition);
            
            // Update visualizer
            const dotPercent = (this.panPosition + 1) / 2 * 100;
            this.panDot.style.left = dotPercent + '%';
        }, 50);
    }

    stopPanDrift() {
        this.panDriftActive = false;
        this.panDriftToggle.textContent = 'Off';
        this.panDriftToggle.classList.remove('active');
        this.panCard.classList.remove('active');
        
        if (this.panDriftInterval) {
            clearInterval(this.panDriftInterval);
            this.panDriftInterval = null;
        }
        
        this.audio.resetPan();
        this.panDot.style.left = '50%';
    }

    // ========== BREATH GUIDE ==========
    toggleBreath() {
        if (this.breathActive) {
            this.stopBreath();
        } else {
            this.startBreath();
        }
    }

    startBreath() {
        this.breathActive = true;
        this.breathToggle.textContent = 'On';
        this.breathToggle.classList.add('active');
        this.breathCard.classList.add('active');
        this.breathRing.classList.add('active');
        
        this.breathPhase = 0;
        this.updateBreathAnimation();
        
        this.breathInterval = setInterval(() => {
            const halfCycle = this.breathCycle / 2;
            this.breathPhase += 0.1;
            
            if (this.breathPhase >= this.breathCycle) {
                this.breathPhase = 0;
            }
            
            if (this.breathPhase < halfCycle) {
                this.breathText.textContent = 'Inhale';
                this.breathText.className = 'breath-text inhale';
            } else {
                this.breathText.textContent = 'Exhale';
                this.breathText.className = 'breath-text exhale';
            }
        }, 100);
    }

    updateBreathAnimation() {
        this.breathRing.style.animationDuration = this.breathCycle + 's';
    }

    stopBreath() {
        this.breathActive = false;
        this.breathToggle.textContent = 'Off';
        this.breathToggle.classList.remove('active');
        this.breathCard.classList.remove('active');
        this.breathRing.classList.remove('active');
        this.breathText.textContent = 'Inhale';
        this.breathText.className = 'breath-text';
        
        if (this.breathInterval) {
            clearInterval(this.breathInterval);
            this.breathInterval = null;
        }
    }

    // ========== VOLUME SWELL ==========
    toggleSwell() {
        if (this.swellActive) {
            this.stopSwell();
        } else {
            this.startSwell();
        }
    }

    startSwell() {
        this.swellActive = true;
        this.swellToggle.textContent = 'On';
        this.swellToggle.classList.add('active');
        this.swellCard.classList.add('active');
        
        this.swellPhase = 0;
        this.baseVolume = this.audio.targetMasterVolume;
        
        this.swellInterval = setInterval(() => {
            this.swellPhase += 0.1;
            if (this.swellPhase >= this.swellPeriod) {
                this.swellPhase = 0;
            }
            
            // Sinusoidal swell between 70% and 100% of base volume
            const progress = this.swellPhase / this.swellPeriod;
            const swell = Math.sin(progress * Math.PI * 2);
            const multiplier = 0.85 + swell * 0.15; // 70% to 100%
            
            if (this.audio.isPlaying) {
                this.audio.setMasterVolume(this.baseVolume * multiplier);
            }
            
            // Update visualizer
            const barWidth = 35 + (swell + 1) / 2 * 65; // 35% to 100%
            this.swellBar.style.width = barWidth + '%';
        }, 100);
    }

    stopSwell() {
        this.swellActive = false;
        this.swellToggle.textContent = 'Off';
        this.swellToggle.classList.remove('active');
        this.swellCard.classList.remove('active');
        this.swellBar.style.width = '50%';
        
        if (this.swellInterval) {
            clearInterval(this.swellInterval);
            this.swellInterval = null;
        }
        
        // Restore base volume
        if (this.audio.isPlaying) {
            this.audio.setMasterVolume(this.baseVolume);
        }
    }

    // Stop all effects
    stopAll() {
        this.stopPulse();
        this.stopPanDrift();
        this.stopBreath();
        this.stopSwell();
    }
}

// ============================================
// TUNER ENGINE
// ============================================

class TunerEngine {
    constructor() {
        this.ctx = null;
        this.oscillator = null;
        this.oscillator2 = null; // For interval checks
        this.gainNode = null;
        this.gainNode2 = null;
        this.isPlaying = false;
        this.isDroneMode = false;
        this.isSweeping = false;
        this.sweepInterval = null;
        this.isOctaveCheck = false;
        this.isFifthCheck = false;
        this.octaveTimeout = null;
        this.fifthTimeout = null;
        
        // Pitch detector state
        this.isListening = false;
        this.micStream = null;
        this.analyser = null;
        this.pitchBuffer = new Float32Array(2048);
        this.targetFrequency = null;
        this.targetNoteName = null;
        this.pitchDetectionFrame = null;
        
        // Tuner settings
        this.referencePitch = 432; // 432 or 440
        this.rootNote = 'D'; // Default root note
        this.currentInstrument = 'monochord';
        this.currentFrequency = 0;
        
        // Note semitone offsets from A
        this.noteOffsets = {
            'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4,
            'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2
        };
        
        // D is the default root, so we store the original D offset
        this.defaultRootOffset = -7; // D from A
        
        this.init();
    }
    
    async init() {
        // DOM Elements
        this.section = document.getElementById('tunerSection');
        this.header = document.getElementById('tunerHeader');
        this.content = document.getElementById('tunerContent');
        this.pitchToggle = document.getElementById('tunerPitchToggle');
        this.rootSelect = document.getElementById('tunerRootSelect');
        this.instrumentTabs = document.getElementById('tunerInstrumentTabs');
        this.stringsContainer = document.getElementById('tunerStringsContainer');
        this.freqValue = document.getElementById('tunerFreqValue');
        this.playingIndicator = document.getElementById('tunerPlayingIndicator');
        
        // Instrument layouts
        this.monochordLayout = document.getElementById('tunerMonochord');
        this.tampuraLayout = document.getElementById('tunerTampura');
        this.kotoLayout = document.getElementById('tunerKoto');
        
        // Bonus buttons
        this.droneBtn = document.getElementById('tunerDroneBtn');
        this.sweepBtn = document.getElementById('tunerSweepBtn');
        this.octaveBtn = document.getElementById('tunerOctaveBtn');
        this.fifthBtn = document.getElementById('tunerFifthBtn');
        
        // Pitch detector elements
        this.meterSection = document.getElementById('tunerMeterSection');
        this.micBtn = document.getElementById('tunerMicBtn');
        this.micIcon = document.getElementById('tunerMicIcon');
        this.micText = document.getElementById('tunerMicText');
        this.meterContainer = document.getElementById('tunerMeterContainer');
        this.meterNeedle = document.getElementById('tunerMeterNeedle');
        this.meterCents = document.getElementById('tunerMeterCents');
        this.detectedNote = document.getElementById('tunerDetectedNote');
        this.detectedFreq = document.getElementById('tunerDetectedFreq');
        this.targetNoteEl = document.getElementById('tunerTargetNote');
        this.targetFreqEl = document.getElementById('tunerTargetFreq');
        
        this.bindEvents();
        this.updateAllFrequencies();
    }
    
    bindEvents() {
        // Collapse/expand
        this.header.addEventListener('click', () => this.toggleCollapse());
        
        // Pitch toggle (432/440)
        this.pitchToggle.querySelectorAll('.tuner-pitch-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setReferencePitch(parseInt(btn.dataset.pitch));
            });
        });
        
        // Root note selector
        this.rootSelect.addEventListener('change', () => {
            this.setRootNote(this.rootSelect.value);
        });
        
        // Instrument tabs
        this.instrumentTabs.querySelectorAll('.tuner-instrument-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.setInstrument(tab.dataset.instrument);
            });
        });
        
        // String buttons - use touch events for better mobile experience
        this.stringsContainer.querySelectorAll('.tuner-string-btn').forEach(btn => {
            // Mouse events
            btn.addEventListener('mousedown', (e) => this.handleStringPress(btn, e));
            btn.addEventListener('mouseup', () => this.handleStringRelease(btn));
            btn.addEventListener('mouseleave', () => this.handleStringRelease(btn));
            
            // Touch events
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.handleStringPress(btn, e);
            });
            btn.addEventListener('touchend', () => this.handleStringRelease(btn));
            btn.addEventListener('touchcancel', () => this.handleStringRelease(btn));
        });
        
        // Bonus features
        this.droneBtn.addEventListener('click', () => this.toggleDroneMode());
        this.sweepBtn.addEventListener('click', () => this.toggleSweep());
        this.octaveBtn.addEventListener('click', () => this.toggleOctaveCheck());
        this.fifthBtn.addEventListener('click', () => this.toggleFifthCheck());
        
        // Microphone / pitch detector
        this.micBtn.addEventListener('click', () => this.togglePitchDetector());
        
        // Set target when string button is clicked (for pitch comparison)
        this.stringsContainer.querySelectorAll('.tuner-string-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setTargetFromButton(btn));
        });
    }
    
    toggleCollapse() {
        this.section.classList.toggle('collapsed');
    }
    
    setReferencePitch(pitch) {
        this.referencePitch = pitch;
        
        // Update UI
        this.pitchToggle.querySelectorAll('.tuner-pitch-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.pitch) === pitch);
        });
        
        this.updateAllFrequencies();
    }
    
    setRootNote(note) {
        this.rootNote = note;
        this.updateAllFrequencies();
    }
    
    setInstrument(instrument) {
        this.currentInstrument = instrument;
        
        // Stop any playing sounds
        this.stopTone();
        this.stopSweep();
        
        // Update tabs
        this.instrumentTabs.querySelectorAll('.tuner-instrument-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.instrument === instrument);
        });
        
        // Show correct layout
        this.monochordLayout.style.display = instrument === 'monochord' ? 'flex' : 'none';
        this.tampuraLayout.style.display = instrument === 'tampura' ? 'flex' : 'none';
        this.kotoLayout.style.display = instrument === 'koto' ? 'flex' : 'none';
    }
    
    // Calculate frequency based on reference pitch and root note
    calculateFrequency(noteOffset, octave) {
        // noteOffset: semitones from root note
        // octave: target octave
        
        const a4Freq = this.referencePitch;
        
        // Calculate the transposition from D
        const rootOffset = this.noteOffsets[this.rootNote];
        const transposeSemitones = rootOffset - this.defaultRootOffset;
        
        // D2 in default tuning: A4 reference, D is -7 semitones from A
        // D2 = A4 * 2^((-7 + (2-4)*12) / 12) = A4 * 2^(-31/12)
        
        // For the given note relative to root
        const semitonesFromA4 = (octave - 4) * 12 + noteOffset + transposeSemitones;
        const frequency = a4Freq * Math.pow(2, semitonesFromA4 / 12);
        
        return Math.round(frequency * 100) / 100;
    }
    
    // Get note name with octave based on transposition
    getNoteName(noteOffset, octave) {
        // noteOffset: semitones from A in the original D-based tuning
        // -7 = D, 0 = A, -5 = E, etc.
        
        const rootOffset = this.noteOffsets[this.rootNote];
        const transposeSemitones = rootOffset - this.defaultRootOffset; // How many semitones to shift
        
        // Full chromatic scale starting from C
        const noteNamesFromC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        
        // Convert noteOffset (from A) to semitones from C
        // A is 9 semitones above C
        let semitonesFromC = noteOffset + 9; // -7 + 9 = 2 (D), 0 + 9 = 9 (A)
        
        // Apply transposition
        semitonesFromC += transposeSemitones;
        
        // Calculate octave adjustment
        let adjustedOctave = octave;
        
        // Handle octave wrapping
        while (semitonesFromC < 0) {
            semitonesFromC += 12;
            adjustedOctave--;
        }
        while (semitonesFromC >= 12) {
            semitonesFromC -= 12;
            adjustedOctave++;
        }
        
        const noteName = noteNamesFromC[semitonesFromC];
        return `${noteName}${adjustedOctave}`;
    }
    
    updateAllFrequencies() {
        // Update all string buttons with new frequencies
        this.stringsContainer.querySelectorAll('.tuner-string-btn').forEach(btn => {
            const noteOffset = parseInt(btn.dataset.note);
            const octave = parseInt(btn.dataset.octave);
            
            const freq = this.calculateFrequency(noteOffset, octave);
            const noteName = this.getNoteName(noteOffset, octave);
            
            btn.querySelector('.tuner-string-freq').textContent = `${freq} Hz`;
            btn.querySelector('.tuner-string-note').textContent = noteName;
        });
    }
    
    async ensureAudioContext() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }
    
    async handleStringPress(btn, e) {
        // Stop any active interval checks when pressing a string
        this.stopOctaveCheck();
        this.stopFifthCheck();
        this.stopSweep();
        
        if (this.isDroneMode) {
            // In drone mode, toggle on click
            if (btn.classList.contains('playing')) {
                this.stopTone();
                btn.classList.remove('playing');
            } else {
                // Stop any other playing buttons
                this.stringsContainer.querySelectorAll('.tuner-string-btn.playing').forEach(b => {
                    b.classList.remove('playing');
                });
                
                const noteOffset = parseInt(btn.dataset.note);
                const octave = parseInt(btn.dataset.octave);
                const freq = this.calculateFrequency(noteOffset, octave);
                
                await this.playTone(freq);
                btn.classList.add('playing');
            }
        } else {
            // Normal mode - play while pressed
            const noteOffset = parseInt(btn.dataset.note);
            const octave = parseInt(btn.dataset.octave);
            const freq = this.calculateFrequency(noteOffset, octave);
            
            await this.playTone(freq);
            btn.classList.add('playing');
        }
    }
    
    handleStringRelease(btn) {
        if (!this.isDroneMode && btn.classList.contains('playing')) {
            this.stopTone();
            btn.classList.remove('playing');
        }
    }
    
    async playTone(frequency, fadeIn = 0.1) {
        await this.ensureAudioContext();
        
        // Stop any existing tone
        this.stopTone();
        
        // Create oscillator
        this.oscillator = this.ctx.createOscillator();
        this.oscillator.type = 'sine';
        this.oscillator.frequency.value = frequency;
        
        // Create gain node for smooth fade
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = 0;
        
        // Connect
        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);
        
        // Start with fade in
        this.oscillator.start();
        const now = this.ctx.currentTime;
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(0.4, now + fadeIn);
        
        this.isPlaying = true;
        this.currentFrequency = frequency;
        this.updateFrequencyDisplay(frequency);
        this.playingIndicator.classList.add('active');
    }
    
    async playTwoTones(freq1, freq2, fadeIn = 0.1) {
        await this.ensureAudioContext();
        
        // Stop any existing tones
        this.stopTone();
        
        // Create first oscillator
        this.oscillator = this.ctx.createOscillator();
        this.oscillator.type = 'sine';
        this.oscillator.frequency.value = freq1;
        
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = 0;
        
        this.oscillator.connect(this.gainNode);
        this.gainNode.connect(this.ctx.destination);
        
        // Create second oscillator
        this.oscillator2 = this.ctx.createOscillator();
        this.oscillator2.type = 'sine';
        this.oscillator2.frequency.value = freq2;
        
        this.gainNode2 = this.ctx.createGain();
        this.gainNode2.gain.value = 0;
        
        this.oscillator2.connect(this.gainNode2);
        this.gainNode2.connect(this.ctx.destination);
        
        // Start both with fade in
        this.oscillator.start();
        this.oscillator2.start();
        
        const now = this.ctx.currentTime;
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(0.3, now + fadeIn);
        this.gainNode2.gain.setValueAtTime(0, now);
        this.gainNode2.gain.linearRampToValueAtTime(0.3, now + fadeIn);
        
        this.isPlaying = true;
        this.currentFrequency = freq1;
        this.updateFrequencyDisplay(freq1, freq2);
        this.playingIndicator.classList.add('active');
    }
    
    stopTone(fadeOut = 0.15) {
        if (this.oscillator && this.gainNode && this.ctx) {
            const now = this.ctx.currentTime;
            this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
            this.gainNode.gain.linearRampToValueAtTime(0, now + fadeOut);
            
            const osc = this.oscillator;
            setTimeout(() => {
                try { osc.stop(); } catch(e) {}
            }, fadeOut * 1000 + 50);
            
            this.oscillator = null;
            this.gainNode = null;
        }
        
        if (this.oscillator2 && this.gainNode2 && this.ctx) {
            const now = this.ctx.currentTime;
            this.gainNode2.gain.setValueAtTime(this.gainNode2.gain.value, now);
            this.gainNode2.gain.linearRampToValueAtTime(0, now + fadeOut);
            
            const osc2 = this.oscillator2;
            setTimeout(() => {
                try { osc2.stop(); } catch(e) {}
            }, fadeOut * 1000 + 50);
            
            this.oscillator2 = null;
            this.gainNode2 = null;
        }
        
        this.isPlaying = false;
        this.currentFrequency = 0;
        this.playingIndicator.classList.remove('active');
        this.freqValue.textContent = '—';
    }
    
    updateFrequencyDisplay(freq1, freq2 = null) {
        if (freq2) {
            this.freqValue.textContent = `${freq1.toFixed(2)} + ${freq2.toFixed(2)}`;
        } else {
            this.freqValue.textContent = freq1.toFixed(2);
        }
    }
    
    toggleDroneMode() {
        this.isDroneMode = !this.isDroneMode;
        this.droneBtn.classList.toggle('active', this.isDroneMode);
        
        if (!this.isDroneMode) {
            // Stop any playing tones when exiting drone mode
            this.stopTone();
            this.stringsContainer.querySelectorAll('.tuner-string-btn.playing').forEach(btn => {
                btn.classList.remove('playing');
            });
        }
    }
    
    async toggleSweep() {
        if (this.isSweeping) {
            this.stopSweep();
            return;
        }
        
        // Stop any other active modes
        this.stopOctaveCheck();
        this.stopFifthCheck();
        
        this.isSweeping = true;
        this.sweepBtn.classList.add('active');
        
        // Get current instrument buttons
        let layout;
        switch (this.currentInstrument) {
            case 'monochord': layout = this.monochordLayout; break;
            case 'tampura': layout = this.tampuraLayout; break;
            case 'koto': layout = this.kotoLayout; break;
        }
        
        const buttons = layout.querySelectorAll('.tuner-string-btn');
        let index = 0;
        
        const playNext = async () => {
            if (!this.isSweeping || index >= buttons.length) {
                this.stopSweep();
                return;
            }
            
            const btn = buttons[index];
            const noteOffset = parseInt(btn.dataset.note);
            const octave = parseInt(btn.dataset.octave);
            const freq = this.calculateFrequency(noteOffset, octave);
            
            // Visual feedback
            buttons.forEach(b => b.classList.remove('playing'));
            btn.classList.add('playing');
            
            await this.playTone(freq);
            
            index++;
            this.sweepInterval = setTimeout(playNext, 3000); // 3 seconds per string
        };
        
        playNext();
    }
    
    stopSweep() {
        this.isSweeping = false;
        this.sweepBtn.classList.remove('active');
        
        if (this.sweepInterval) {
            clearTimeout(this.sweepInterval);
            this.sweepInterval = null;
        }
        
        this.stopTone();
        this.stringsContainer.querySelectorAll('.tuner-string-btn.playing').forEach(btn => {
            btn.classList.remove('playing');
        });
    }
    
    async toggleOctaveCheck() {
        // If already playing octave check, stop it
        if (this.isOctaveCheck) {
            this.stopOctaveCheck();
            return;
        }
        
        // Stop any other active modes
        this.stopFifthCheck();
        this.stopSweep();
        
        // Play D2 and D3 together (root octaves)
        const freq1 = this.calculateFrequency(-7, 2); // Root octave 2
        const freq2 = this.calculateFrequency(-7, 3); // Root octave 3
        
        this.isOctaveCheck = true;
        this.octaveBtn.classList.add('active');
        await this.playTwoTones(freq1, freq2);
        
        // Auto-stop after 4 seconds (unless manually stopped first)
        this.octaveTimeout = setTimeout(() => {
            this.stopOctaveCheck();
        }, 4000);
    }
    
    stopOctaveCheck() {
        this.isOctaveCheck = false;
        this.octaveBtn.classList.remove('active');
        
        if (this.octaveTimeout) {
            clearTimeout(this.octaveTimeout);
            this.octaveTimeout = null;
        }
        
        if (this.isPlaying && !this.isFifthCheck && !this.isSweeping && !this.isDroneMode) {
            this.stopTone();
        }
    }
    
    async toggleFifthCheck() {
        // If already playing fifth check, stop it
        if (this.isFifthCheck) {
            this.stopFifthCheck();
            return;
        }
        
        // Stop any other active modes
        this.stopOctaveCheck();
        this.stopSweep();
        
        // Play root (D3) and fifth (A3) together
        const freq1 = this.calculateFrequency(-7, 3); // Root
        const freq2 = this.calculateFrequency(0, 3);  // Fifth (A)
        
        this.isFifthCheck = true;
        this.fifthBtn.classList.add('active');
        await this.playTwoTones(freq1, freq2);
        
        // Auto-stop after 4 seconds (unless manually stopped first)
        this.fifthTimeout = setTimeout(() => {
            this.stopFifthCheck();
        }, 4000);
    }
    
    stopFifthCheck() {
        this.isFifthCheck = false;
        this.fifthBtn.classList.remove('active');
        
        if (this.fifthTimeout) {
            clearTimeout(this.fifthTimeout);
            this.fifthTimeout = null;
        }
        
        if (this.isPlaying && !this.isOctaveCheck && !this.isSweeping && !this.isDroneMode) {
            this.stopTone();
        }
    }
    
    // ========================================
    // PITCH DETECTOR METHODS
    // ========================================
    
    setTargetFromButton(btn) {
        const noteOffset = parseInt(btn.dataset.note);
        const octave = parseInt(btn.dataset.octave);
        const freq = this.calculateFrequency(noteOffset, octave);
        const noteName = this.getNoteName(noteOffset, octave);
        
        this.targetFrequency = freq;
        this.targetNoteName = noteName;
        
        // Update target display
        if (this.targetNoteEl) {
            this.targetNoteEl.textContent = noteName;
            this.targetFreqEl.textContent = `${freq} Hz`;
        }
    }
    
    async togglePitchDetector() {
        if (this.isListening) {
            this.stopPitchDetector();
        } else {
            await this.startPitchDetector();
        }
    }
    
    async startPitchDetector() {
        try {
            // Request microphone access
            this.micStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
            
            // Create audio context if needed
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.ctx.state === 'suspended') {
                await this.ctx.resume();
            }
            
            // Create analyser node
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 4096;
            this.pitchBuffer = new Float32Array(this.analyser.fftSize);
            
            // Connect microphone to analyser
            const source = this.ctx.createMediaStreamSource(this.micStream);
            source.connect(this.analyser);
            
            // Update UI
            this.isListening = true;
            this.micBtn.classList.add('active');
            this.micIcon.textContent = '🔴';
            this.micText.textContent = 'Stop';
            this.meterContainer.classList.add('active');
            
            // Start pitch detection loop
            this.detectPitch();
            
        } catch (err) {
            console.error('Microphone access denied:', err);
            alert('Please allow microphone access to use the pitch detector.');
        }
    }
    
    stopPitchDetector() {
        this.isListening = false;
        
        // Stop microphone stream
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }
        
        // Cancel detection loop
        if (this.pitchDetectionFrame) {
            cancelAnimationFrame(this.pitchDetectionFrame);
            this.pitchDetectionFrame = null;
        }
        
        // Update UI
        this.micBtn.classList.remove('active');
        this.micIcon.textContent = '🎙️';
        this.micText.textContent = 'Listen';
        this.meterContainer.classList.remove('active');
        
        // Reset displays
        this.detectedNote.textContent = '—';
        this.detectedFreq.textContent = '— Hz';
        this.meterCents.textContent = '0 cents';
        this.meterNeedle.style.left = '50%';
        this.meterNeedle.className = 'tuner-meter-needle';
        this.meterCents.className = 'tuner-meter-cents';
    }
    
    detectPitch() {
        if (!this.isListening) return;
        
        // Get audio data
        this.analyser.getFloatTimeDomainData(this.pitchBuffer);
        
        // Detect pitch using autocorrelation
        const frequency = this.autoCorrelate(this.pitchBuffer, this.ctx.sampleRate);
        
        if (frequency > 0) {
            // Valid pitch detected
            this.updatePitchDisplay(frequency);
        }
        
        // Continue detection loop
        this.pitchDetectionFrame = requestAnimationFrame(() => this.detectPitch());
    }
    
    autoCorrelate(buffer, sampleRate) {
        // Check if there's enough signal
        let rms = 0;
        for (let i = 0; i < buffer.length; i++) {
            rms += buffer[i] * buffer[i];
        }
        rms = Math.sqrt(rms / buffer.length);
        
        // If signal is too quiet, return -1
        if (rms < 0.01) return -1;
        
        // Autocorrelation
        const size = buffer.length;
        const correlations = new Float32Array(size);
        
        for (let lag = 0; lag < size; lag++) {
            let sum = 0;
            for (let i = 0; i < size - lag; i++) {
                sum += buffer[i] * buffer[i + lag];
            }
            correlations[lag] = sum;
        }
        
        // Find first zero crossing (start of correlation)
        let start = 0;
        while (correlations[start] > correlations[start + 1] && start < size - 1) {
            start++;
        }
        
        // Find peak in correlation
        let maxVal = -1;
        let maxPos = -1;
        for (let i = start; i < size - 1; i++) {
            if (correlations[i] > maxVal) {
                maxVal = correlations[i];
                maxPos = i;
            }
        }
        
        // Refine using parabolic interpolation
        if (maxPos > 0 && maxPos < size - 1) {
            const y1 = correlations[maxPos - 1];
            const y2 = correlations[maxPos];
            const y3 = correlations[maxPos + 1];
            const adjustment = (y3 - y1) / (2 * (2 * y2 - y1 - y3));
            maxPos += adjustment;
        }
        
        // Convert to frequency
        const frequency = sampleRate / maxPos;
        
        // Validate frequency range (roughly 50Hz to 1500Hz for our instruments)
        if (frequency < 50 || frequency > 1500) return -1;
        
        return frequency;
    }
    
    updatePitchDisplay(frequency) {
        // Find closest note
        const noteInfo = this.frequencyToNote(frequency);
        
        // Update detected note display
        this.detectedNote.textContent = noteInfo.name;
        this.detectedFreq.textContent = `${frequency.toFixed(1)} Hz`;
        
        // Calculate cents deviation from target or closest note
        let targetFreq = this.targetFrequency || noteInfo.frequency;
        let cents = 1200 * Math.log2(frequency / targetFreq);
        
        // Clamp cents to -50 to +50 for display
        const clampedCents = Math.max(-50, Math.min(50, cents));
        
        // Update cents display
        const centsText = cents > 0 ? `+${cents.toFixed(0)} cents` : `${cents.toFixed(0)} cents`;
        this.meterCents.textContent = centsText;
        
        // Update needle position (50% = center, 0% = -50 cents, 100% = +50 cents)
        const needlePosition = 50 + (clampedCents);
        this.meterNeedle.style.left = `${needlePosition}%`;
        
        // Update colors based on how in-tune
        this.meterNeedle.classList.remove('flat', 'sharp', 'in-tune');
        this.meterCents.classList.remove('flat', 'sharp', 'in-tune');
        
        if (Math.abs(cents) <= 5) {
            // In tune (within 5 cents)
            this.meterNeedle.classList.add('in-tune');
            this.meterCents.classList.add('in-tune');
        } else if (cents < 0) {
            // Flat
            this.meterNeedle.classList.add('flat');
            this.meterCents.classList.add('flat');
        } else {
            // Sharp
            this.meterNeedle.classList.add('sharp');
            this.meterCents.classList.add('sharp');
        }
    }
    
    frequencyToNote(frequency) {
        // Calculate semitones from A4
        const a4 = this.referencePitch;
        const semitones = 12 * Math.log2(frequency / a4);
        const roundedSemitones = Math.round(semitones);
        
        // Calculate closest note frequency
        const closestFreq = a4 * Math.pow(2, roundedSemitones / 12);
        
        // Note names
        const noteNames = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
        
        // Calculate note name and octave
        // A4 is semitone 0, so we need to calculate correctly
        let noteIndex = ((roundedSemitones % 12) + 12) % 12;
        let octave = 4 + Math.floor((roundedSemitones + 9) / 12);
        
        // Adjust for notes before C (A, A#, B)
        if (noteIndex <= 2) {
            // A, A#, B are still in the previous octave naming convention
        } else {
            // C and above - octave adjusts differently
            octave = 4 + Math.floor((roundedSemitones + 9) / 12);
        }
        
        // Simpler octave calculation
        octave = Math.floor((roundedSemitones + 57) / 12); // 57 = A4 is MIDI note 69, A0 is 21
        
        const noteName = noteNames[noteIndex];
        
        return {
            name: noteName + octave,
            frequency: parseFloat(closestFreq.toFixed(2)),
            cents: (semitones - roundedSemitones) * 100
        };
    }
}

// ============================================
// SESSION CONTROLLER
// ============================================

class SessionController {
    constructor() {
        this.audio = new AudioEngine();
        this.duration = 600;
        this.remaining = 600;
        this.elapsed = 0;
        this.isRunning = false;
        this.interval = null;
        this.use432 = true;
        this.currentPreset = 'free';
        this.overtoneIndex = 0;
        this.overtoneInterval = null;
        this.audioUnlocked = false;
        
        // Free mode properties
        this.isFreeMode = true;
        this.freeLeftNote = 'D3';
        this.freeRightNote = 'A3';
        this.selectedChannel = 'left'; // 'left', 'right', or 'both'
        this.fadeSpeed = 0.7; // Default fade speed in seconds

        this.initElements();
        this.initEventListeners();
        this.updateDisplay();
        this.updateFrequencyDisplay();
        this.updateTimeline();
        this.updateFreeModeUI();
        
        // Initialize live effects controller
        this.effects = new LiveEffectsController(this.audio);
        
        if (isIOS) {
            this.showAudioUnlock();
        } else {
            this.unlockAudio();
        }
    }

    initElements() {
        this.timerDisplay = document.getElementById('timerDisplay');
        this.timerInfinity = document.getElementById('timerInfinity');
        this.phaseName = document.getElementById('phaseName');
        this.phaseGuidance = document.getElementById('phaseGuidance');
        this.progressRing = document.querySelector('.timer-ring-progress');
        this.breathCircle = document.getElementById('breathCircle');
        
        this.timelineSection = document.querySelector('.timeline-section');
        this.timelineProgress = document.getElementById('timelineProgress');
        this.timelineCurrent = document.getElementById('timelineCurrent');
        this.timelinePhases = document.querySelectorAll('.timeline-phase');
        this.phaseCards = document.querySelectorAll('.phase-card');
        this.totalDuration = document.getElementById('totalDuration');
        
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.resetBtn = document.getElementById('resetBtn');
        
        this.durationSelect = document.getElementById('durationSelect');
        this.presetSelect = document.getElementById('presetSelect');
        
        this.tuningToggle = document.getElementById('tuningToggle');
        this.detuneToggle = document.getElementById('detuneToggle');
        
        this.volumeLeft = document.getElementById('volumeLeft');
        this.volumeRight = document.getElementById('volumeRight');
        this.volumeMaster = document.getElementById('volumeMaster');
        
        this.audioDot = document.getElementById('audioDot');
        this.audioStatusText = document.getElementById('audioStatusText');
        
        this.completionOverlay = document.getElementById('completionOverlay');
        this.audioUnlockOverlay = document.getElementById('audioUnlock');
        this.audioUnlockBtn = document.getElementById('audioUnlockBtn');
        
        // Free mode elements
        this.freeModePanel = document.getElementById('freeModePanel');
        this.intervalButtons = document.querySelectorAll('.interval-btn');
        this.channelButtons = document.querySelectorAll('.channel-btn');
        this.fadeSpeedSlider = document.getElementById('fadeSpeedSlider');
        this.fadeSpeedValue = document.getElementById('fadeSpeedValue');
        
        // Compact header elements (for tablets)
        this.timerCompactDisplay = document.getElementById('timerCompactDisplay');
        this.timerCompactMode = document.getElementById('timerCompactMode');
        this.timerCompactStatus = document.getElementById('timerCompactStatus');
        this.headerAudioDot = document.getElementById('headerAudioDot');
        
        // Header control buttons (for tablets)
        this.headerPresetSelect = document.getElementById('headerPresetSelect');
        this.headerStartBtn = document.getElementById('headerStartBtn');
        this.headerStopBtn = document.getElementById('headerStopBtn');
        this.headerResetBtn = document.getElementById('headerResetBtn');
    }

    showAudioUnlock() {
        this.audioUnlockOverlay.classList.add('visible');
    }

    async unlockAudio() {
        const success = await this.audio.init();
        if (success) {
            this.audioUnlocked = true;
            this.audioUnlockOverlay.classList.remove('visible');
            this.audioStatusText.textContent = 'Ready to begin';
        }
        return success;
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    updateTimeline() {
        // Update total duration display
        this.totalDuration.textContent = this.formatTime(this.duration) + ' total';

        // Update phase times and durations
        PHASES.forEach((phase, i) => {
            const startTime = Math.floor(this.duration * phase.start);
            const endTime = Math.floor(this.duration * phase.end);
            const phaseDuration = endTime - startTime;

            // Update timeline phase markers
            const timelinePhase = this.timelinePhases[i];
            if (timelinePhase) {
                const timeEl = timelinePhase.querySelector('.timeline-phase-time');
                if (timeEl) timeEl.textContent = this.formatTime(startTime);
            }

            // Update phase cards
            const card = this.phaseCards[i];
            if (card) {
                const durationEl = card.querySelector('.phase-card-duration');
                if (durationEl) durationEl.textContent = this.formatTime(phaseDuration);
            }
        });
    }

    initEventListeners() {
        this.audioUnlockBtn.addEventListener('click', async () => await this.unlockAudio());
        this.audioUnlockOverlay.addEventListener('click', async (e) => {
            if (e.target === this.audioUnlockOverlay) await this.unlockAudio();
        });

        this.startBtn.addEventListener('click', () => this.start());
        this.stopBtn.addEventListener('click', () => this.stop());
        this.resetBtn.addEventListener('click', () => this.reset());
        
        // Header buttons (tablets) - mirror main buttons
        if (this.headerStartBtn) {
            this.headerStartBtn.addEventListener('click', () => this.start());
        }
        if (this.headerStopBtn) {
            this.headerStopBtn.addEventListener('click', () => this.stop());
        }
        if (this.headerResetBtn) {
            this.headerResetBtn.addEventListener('click', () => this.reset());
        }
        
        this.durationSelect.addEventListener('change', (e) => {
            this.duration = parseInt(e.target.value);
            this.remaining = this.duration;
            this.updateDisplay();
            this.updateTimeline();
        });
        
        // Preset change handler - shared function
        const handlePresetChange = async (value) => {
            this.currentPreset = value;
            this.isFreeMode = PRESETS[this.currentPreset]?.isFreeMode || false;
            this.updateFreeModeUI();
            this.updateFrequencyDisplay();
            
            // Sync both preset selects
            if (this.presetSelect) this.presetSelect.value = value;
            if (this.headerPresetSelect) this.headerPresetSelect.value = value;
            
            // If in free mode and running, update frequencies immediately
            if (this.isRunning && this.isFreeMode) {
                const freqs = this.getCurrentFrequencies();
                await this.audio.setFrequencies(freqs.left, freqs.right);
            }
        };
        
        this.presetSelect.addEventListener('change', (e) => handlePresetChange(e.target.value));
        
        // Header preset select (tablets)
        if (this.headerPresetSelect) {
            this.headerPresetSelect.addEventListener('change', (e) => handlePresetChange(e.target.value));
        }
        
        // Channel selector buttons
        this.channelButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.channelButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedChannel = btn.dataset.channel;
            });
        });
        
        // Interval buttons
        this.intervalButtons.forEach(btn => {
            btn.addEventListener('click', async () => {
                const note = btn.dataset.note;
                const freqKey = NOTE_MAP[note];
                
                if (this.selectedChannel === 'left' || this.selectedChannel === 'both') {
                    this.freeLeftNote = freqKey;
                }
                if (this.selectedChannel === 'right' || this.selectedChannel === 'both') {
                    this.freeRightNote = freqKey;
                }
                
                this.updateIntervalButtonStates();
                this.updateFrequencyDisplay();
                
                // If running, update audio immediately with current fade speed
                if (this.isRunning) {
                    const freqs = this.getCurrentFrequencies();
                    await this.audio.setFrequencies(freqs.left, freqs.right, this.fadeSpeed);
                }
            });
        });
        
        // Fade speed slider
        if (this.fadeSpeedSlider) {
            const updateFadeSpeed = () => {
                // Slider 0-100 maps to 0.5s - 2s (linear for simplicity)
                // 0 = 0.5s (default), 100 = 2s (slow, meditative)
                const sliderValue = parseInt(this.fadeSpeedSlider.value);
                // Linear interpolation: 0.5 + (sliderValue / 100) * 1.5
                this.fadeSpeed = 0.5 + (sliderValue / 100) * 1.5;
                
                // Display the value
                if (this.fadeSpeedValue) {
                    this.fadeSpeedValue.textContent = this.fadeSpeed.toFixed(1) + 's';
                }
            };
            this.fadeSpeedSlider.addEventListener('input', updateFadeSpeed);
            updateFadeSpeed(); // Initialize display
        }
        
        const handleToggle = (toggle, callback) => {
            const handler = (e) => {
                e.preventDefault();
                toggle.classList.toggle('active');
                callback(toggle.classList.contains('active'));
            };
            toggle.addEventListener('click', handler);
        };

        handleToggle(this.tuningToggle, async (active) => {
            this.use432 = active;
            this.updateFrequencyDisplay();
            this.updateIntervalButtonFrequencies();
            if (this.isRunning) {
                const freqs = this.getCurrentFrequencies();
                await this.audio.setFrequencies(freqs.left, freqs.right);
            }
        });

        handleToggle(this.detuneToggle, (active) => this.audio.setDetune(active));
        
        const volumeHandler = (input, valueEl, setter) => {
            const update = () => {
                valueEl.textContent = input.value + '%';
                setter(input.value / 100);
            };
            input.addEventListener('input', update);
            input.addEventListener('change', update);
        };

        volumeHandler(this.volumeLeft, document.getElementById('volumeLeftValue'), (v) => this.audio.setLeftVolume(v));
        volumeHandler(this.volumeRight, document.getElementById('volumeRightValue'), (v) => this.audio.setRightVolume(v));
        volumeHandler(this.volumeMaster, document.getElementById('volumeMasterValue'), (v) => this.audio.setMasterVolume(v));
        
        document.getElementById('closeCompletionBtn').addEventListener('click', () => {
            this.completionOverlay.classList.remove('visible');
        });

    }

    getFrequencyTable() {
        return this.use432 ? FREQ_432 : FREQ_440;
    }

    getCurrentFrequencies() {
        const freqs = this.getFrequencyTable();
        const preset = PRESETS[this.currentPreset];
        
        // Free mode uses dynamically selected notes
        if (this.isFreeMode) {
            return {
                left: freqs[this.freeLeftNote],
                right: freqs[this.freeRightNote],
                leftNote: this.freeLeftNote,
                rightNote: this.freeRightNote
            };
        }
        
        if (this.currentPreset === 'overtone') {
            const seq = preset.sequence[this.overtoneIndex];
            return { left: freqs[seq.left], right: freqs[seq.right], leftNote: seq.left, rightNote: seq.right };
        }
        
        return {
            left: freqs[preset.left.freq],
            right: freqs[preset.right.freq],
            leftNote: preset.left.note,
            rightNote: preset.right.note
        };
    }
    
    updateFreeModeUI() {
        // Toggle timeline visibility
        if (this.timelineSection) {
            this.timelineSection.style.display = this.isFreeMode ? 'none' : '';
        }
        
        // Toggle free mode panel
        if (this.freeModePanel) {
            this.freeModePanel.classList.toggle('visible', this.isFreeMode);
        }
        
        // Toggle duration selector
        const durationGroup = document.getElementById('durationGroup');
        if (durationGroup) {
            durationGroup.style.display = this.isFreeMode ? 'none' : '';
        }
        
        // Toggle progress ring animation
        if (this.progressRing) {
            this.progressRing.classList.toggle('free-mode', this.isFreeMode);
        }
        
        // Get free mode label element
        const freeModeLabel = document.getElementById('freeModeLabel');
        
        // Update compact header mode for tablets
        if (this.timerCompactMode) {
            this.timerCompactMode.textContent = this.isFreeMode 
                ? '∞ FREE PLAY' 
                : PRESETS[this.currentPreset]?.name || 'Journey';
        }
        if (this.timerCompactDisplay) {
            this.timerCompactDisplay.textContent = this.isFreeMode ? '0:00' : this.formatTime(this.remaining);
        }
        
        // Update timer display for free mode
        if (this.isFreeMode) {
            this.timerDisplay.classList.add('free-mode');
            this.timerDisplay.textContent = '0:00';
            this.timerInfinity.classList.add('visible');
            if (freeModeLabel) freeModeLabel.classList.add('visible');
            this.phaseName.textContent = 'Free Play';
            this.phaseGuidance.textContent = 'Explore the harmonics';
        } else {
            this.timerDisplay.classList.remove('free-mode');
            this.timerInfinity.classList.remove('visible');
            if (freeModeLabel) freeModeLabel.classList.remove('visible');
            this.phaseName.textContent = 'Ready';
            this.phaseGuidance.textContent = 'Set your intention';
            this.updateDisplay();
        }
        
        this.updateIntervalButtonStates();
        this.updateIntervalButtonFrequencies();
    }
    
    updateIntervalButtonStates() {
        this.intervalButtons.forEach(btn => {
            const note = btn.dataset.note;
            const freqKey = NOTE_MAP[note];
            
            btn.classList.remove('active-left', 'active-right', 'active-both');
            
            const isLeft = this.freeLeftNote === freqKey;
            const isRight = this.freeRightNote === freqKey;
            
            if (isLeft && isRight) {
                btn.classList.add('active-both');
            } else if (isLeft) {
                btn.classList.add('active-left');
            } else if (isRight) {
                btn.classList.add('active-right');
            }
        });
    }
    
    updateIntervalButtonFrequencies() {
        const freqs = this.getFrequencyTable();
        this.intervalButtons.forEach(btn => {
            const note = btn.dataset.note;
            const freqKey = NOTE_MAP[note];
            const freqValue = freqs[freqKey];
            const freqEl = btn.querySelector('.interval-btn-freq');
            if (freqEl && freqValue) {
                freqEl.textContent = freqValue.toFixed(2) + ' Hz';
            }
        });
    }

    updateFrequencyDisplay() {
        const { left, right, leftNote, rightNote } = this.getCurrentFrequencies();
        document.getElementById('freqLeftValue').textContent = left.toFixed(2) + ' Hz';
        document.getElementById('freqLeftNote').textContent = leftNote;
        document.getElementById('freqRightValue').textContent = right.toFixed(2) + ' Hz';
        document.getElementById('freqRightNote').textContent = rightNote;
        
        // Calculate and display binaural beat
        const binauralBeat = Math.abs(right - left);
        document.getElementById('binauralBeatValue').textContent = binauralBeat.toFixed(2) + ' Hz';
        
        // Classify the binaural beat frequency
        let beatType = '';
        if (binauralBeat < 4) beatType = 'Delta (Deep Sleep)';
        else if (binauralBeat < 8) beatType = 'Theta (Meditation)';
        else if (binauralBeat < 14) beatType = 'Alpha (Relaxed)';
        else if (binauralBeat < 30) beatType = 'Beta (Alert)';
        else if (binauralBeat < 100) beatType = 'Gamma (Peak)';
        else beatType = 'Interval: ' + this.getIntervalName(left, right);
        
        document.getElementById('binauralBeatNote').textContent = beatType;
    }
    
    getIntervalName(freq1, freq2) {
        const ratio = Math.max(freq1, freq2) / Math.min(freq1, freq2);
        // Common musical intervals
        if (Math.abs(ratio - 1.5) < 0.02) return 'Perfect Fifth';
        if (Math.abs(ratio - 2) < 0.02) return 'Octave';
        if (Math.abs(ratio - 1.33) < 0.02) return 'Perfect Fourth';
        if (Math.abs(ratio - 1.25) < 0.02) return 'Major Third';
        if (Math.abs(ratio - 1.125) < 0.02) return 'Major Second';
        if (Math.abs(ratio - 1.2) < 0.02) return 'Minor Third';
        if (Math.abs(ratio - 1.67) < 0.02) return 'Major Sixth';
        return 'Harmonic';
    }

    async start() {
        if (this.isRunning) return;
        
        if (!this.audioUnlocked) await this.unlockAudio();
        
        const { left, right } = this.getCurrentFrequencies();
        await this.audio.start(left, right);
        await requestWakeLock();
        
        this.isRunning = true;
        this.elapsed = 0;
        this.startBtn.style.display = 'none';
        this.stopBtn.style.display = 'inline-block';
        this.resetBtn.style.display = 'none';
        this.durationSelect.disabled = true;
        
        // Update header buttons (tablets)
        if (this.headerStartBtn) this.headerStartBtn.style.display = 'none';
        if (this.headerStopBtn) this.headerStopBtn.style.display = 'inline-block';
        if (this.headerResetBtn) this.headerResetBtn.style.display = 'none';
        if (this.headerPresetSelect) this.headerPresetSelect.disabled = true;
        
        this.audioDot.classList.add('active');
        this.audioStatusText.textContent = this.isFreeMode ? 'Free play active' : 'Journey in progress';
        this.breathCircle.classList.add('active');
        
        // Update compact header for tablets
        if (this.headerAudioDot) this.headerAudioDot.classList.add('active');
        if (this.timerCompactStatus) {
            this.timerCompactStatus.textContent = this.isFreeMode ? '♪ Playing' : 'In progress';
        }
        
        if (this.isFreeMode) {
            this.phaseName.textContent = '♪ Playing';
            this.phaseGuidance.textContent = 'Tap intervals to change';
        }
        
        if (this.currentPreset === 'overtone') this.startOvertoneSequence();
        
        this.interval = setInterval(() => this.tick(), 1000);
    }

    async stop() {
        if (!this.isRunning) return;
        
        this.audio.stop();
        this.isRunning = false;
        await releaseWakeLock();
        
        clearInterval(this.interval);
        this.interval = null;
        
        if (this.overtoneInterval) {
            clearInterval(this.overtoneInterval);
            this.overtoneInterval = null;
        }
        
        this.startBtn.style.display = 'inline-block';
        this.stopBtn.style.display = 'none';
        this.resetBtn.style.display = 'inline-block';
        
        // Update header buttons (tablets)
        if (this.headerStartBtn) this.headerStartBtn.style.display = 'inline-block';
        if (this.headerStopBtn) this.headerStopBtn.style.display = 'none';
        if (this.headerResetBtn) this.headerResetBtn.style.display = 'inline-block';
        
        this.audioDot.classList.remove('active');
        this.audioStatusText.textContent = this.isFreeMode 
            ? 'Paused • ' + this.formatTime(this.elapsed) + ' played'
            : 'Session ended';
        this.breathCircle.classList.remove('active');
        
        // Update compact header for tablets
        if (this.headerAudioDot) this.headerAudioDot.classList.remove('active');
        if (this.timerCompactStatus) {
            this.timerCompactStatus.textContent = this.isFreeMode 
                ? 'Paused' 
                : 'Ended';
        }
        
        if (this.isFreeMode) {
            this.phaseName.textContent = 'Paused';
            this.phaseGuidance.textContent = 'Tap Begin to continue';
            // Keep showing the elapsed time
            const timeStr = this.formatTime(this.elapsed);
            this.timerDisplay.textContent = timeStr;
            if (this.timerCompactDisplay) this.timerCompactDisplay.textContent = timeStr;
        }
    }

    reset() {
        this.stop();
        this.remaining = this.duration;
        this.elapsed = 0;
        this.overtoneIndex = 0;
        this.durationSelect.disabled = false;
        this.resetBtn.style.display = 'none';
        
        // Update header buttons (tablets)
        if (this.headerResetBtn) this.headerResetBtn.style.display = 'none';
        if (this.headerPresetSelect) this.headerPresetSelect.disabled = false;
        
        this.updateFrequencyDisplay();
        
        if (this.isFreeMode) {
            this.timerDisplay.textContent = '0:00';
            if (this.timerCompactDisplay) this.timerCompactDisplay.textContent = '0:00';
            this.phaseName.textContent = 'Free Play';
            this.phaseGuidance.textContent = 'Explore the harmonics';
        } else {
            this.updateDisplay();
            this.phaseName.textContent = 'Ready';
            this.phaseGuidance.textContent = 'Set your intention';
        }
        this.audioStatusText.textContent = 'Ready to begin';
        if (this.timerCompactStatus) this.timerCompactStatus.textContent = 'Ready to begin';
        
        // Reset timeline
        this.timelineProgress.style.width = '0%';
        this.timelineCurrent.style.left = '0%';
        this.timelinePhases.forEach(p => p.classList.remove('active', 'complete'));
        this.phaseCards.forEach(c => c.classList.remove('active', 'complete'));
        
        this.progressRing.style.strokeDashoffset = 0;
    }

    tick() {
        if (this.isFreeMode) {
            this.elapsed++;
            this.updateFreeDisplay();
        } else {
            this.remaining--;
            this.updateDisplay();
            this.updatePhase();
            
            if (this.remaining <= 0) this.complete();
        }
    }
    
    updateFreeDisplay() {
        // Update the main timer display with elapsed time - big and clear
        const timeStr = this.formatTime(this.elapsed);
        this.timerDisplay.textContent = timeStr;
        
        // Also update compact timer for tablets
        if (this.timerCompactDisplay) {
            this.timerCompactDisplay.textContent = timeStr;
        }
    }

    updateDisplay() {
        const timeStr = this.formatTime(this.remaining);
        this.timerDisplay.textContent = timeStr;
        
        // Also update compact timer for tablets
        if (this.timerCompactDisplay) {
            this.timerCompactDisplay.textContent = timeStr;
        }
        
        const progress = 1 - (this.remaining / this.duration);
        const circumference = 880; // 2 * PI * 140
        this.progressRing.style.strokeDashoffset = circumference * (1 - progress);
        
        // Update timeline progress
        this.timelineProgress.style.width = (progress * 100) + '%';
        this.timelineCurrent.style.left = (progress * 100) + '%';
    }

    updatePhase() {
        const progress = 1 - (this.remaining / this.duration);
        
        for (let i = 0; i < PHASES.length; i++) {
            const phase = PHASES[i];
            const timelinePhase = this.timelinePhases[i];
            const card = this.phaseCards[i];
            
            if (progress >= phase.end) {
                timelinePhase?.classList.remove('active');
                timelinePhase?.classList.add('complete');
                card?.classList.remove('active');
                card?.classList.add('complete');
            } else if (progress >= phase.start) {
                timelinePhase?.classList.add('active');
                timelinePhase?.classList.remove('complete');
                card?.classList.add('active');
                card?.classList.remove('complete');
                
                this.phaseName.textContent = phase.name;
                this.phaseGuidance.textContent = phase.guidance;
            } else {
                timelinePhase?.classList.remove('active', 'complete');
                card?.classList.remove('active', 'complete');
            }
        }
    }

    startOvertoneSequence() {
        const preset = PRESETS.overtone;
        const stepDuration = this.duration / preset.sequence.length;
        
        this.overtoneInterval = setInterval(async () => {
            this.overtoneIndex = (this.overtoneIndex + 1) % preset.sequence.length;
            const { left, right } = this.getCurrentFrequencies();
            await this.audio.setFrequencies(left, right);
            this.updateFrequencyDisplay();
        }, stepDuration * 1000);
    }

    async complete() {
        await this.stop();
        this.completionOverlay.classList.add('visible');
        this.playCompletionChime();
    }

    async playCompletionChime() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') await ctx.resume();
            
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            const freqs = this.getFrequencyTable();
            osc.frequency.value = freqs.D4;
            osc.type = 'sine';
            
            const now = ctx.currentTime;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.5);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 5);
            
            osc.start(now);
            osc.stop(now + 5);
        } catch (err) {
            console.log('Chime failed:', err);
        }
    }
}

// ============================================
// INITIALIZE
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    window.session = new SessionController();
    window.tuner = new TunerEngine();
});
