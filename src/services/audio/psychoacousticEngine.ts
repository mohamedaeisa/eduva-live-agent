
import { DashboardState } from '../../components/dashboard/types';

class PsychoacousticEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private lfos: OscillatorNode[] = [];
  private noiseNode: AudioBufferSourceNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private isMuted: boolean = false;
  private currentState: DashboardState = 'IDLE';

  constructor() {}

  public init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContextClass();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.gain.value = 0.03; // Ultra-soft default volume floor
  }

  public toggleMute(mute: boolean) {
    this.isMuted = mute;
    if (this.masterGain) {
        const now = this.ctx?.currentTime || 0;
        this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.03, now, 0.8);
    }
    if (!mute && this.ctx?.state === 'suspended') {
        this.ctx.resume();
    }
  }

  private stopNodes() {
    const now = this.ctx?.currentTime || 0;
    this.oscillators.forEach(o => {
        try { 
          o.stop(now + 0.2); 
          o.disconnect(); 
        } catch(e){}
    });
    this.lfos.forEach(l => {
        try { l.stop(now + 0.2); l.disconnect(); } catch(e){}
    });
    if (this.noiseNode) {
        try { this.noiseNode.stop(now + 0.2); this.noiseNode.disconnect(); } catch(e){}
    }
    if (this.filterNode) {
        this.filterNode.disconnect();
    }
    this.oscillators = [];
    this.lfos = [];
    this.noiseNode = null;
    this.filterNode = null;
  }

  public transition(state: DashboardState) {
    if (!this.ctx || this.isMuted) return;
    if (this.currentState === state) return;
    this.currentState = state;

    this.stopNodes();
    
    switch (state) {
        case 'IDLE':
        case 'PRIMED':
            // THETA DRIFT: Deep, very soft harmonic layers
            this.playBinauralDrone(174, 178); 
            break;
        case 'FLOW':
            // FOCUS WIND: Lo-fi filtered white noise simulating soft air
            this.playOrganicFocus();
            break;
        case 'FRICTION':
            // GROUNDING: Low-passed brown noise (Earth-like rumble)
            this.playWarmRumble();
            break;
        case 'RECOVERY':
            // OASIS: Simulated soft rain drops
            this.playSoftRain();
            break;
    }
  }

  private playBinauralDrone(freqL: number, freqR: number) {
    if (!this.ctx || !this.masterGain) return;
    
    const oscL = this.ctx.createOscillator();
    const oscR = this.ctx.createOscillator();
    const panL = this.ctx.createStereoPanner();
    const panR = this.ctx.createStereoPanner();

    oscL.type = 'sine';
    oscR.type = 'sine';
    oscL.frequency.value = freqL;
    oscR.frequency.value = freqR;
    
    panL.pan.value = -0.8;
    panR.pan.value = 0.8;

    oscL.connect(panL).connect(this.masterGain);
    oscR.connect(panR).connect(this.masterGain);

    oscL.start();
    oscR.start();
    this.oscillators.push(oscL, oscR);
  }

  private playOrganicFocus() {
    if (!this.ctx || !this.masterGain) return;
    // Harmonic 'Om' sound using very low frequencies and slow pulsing
    this.playBinauralDrone(110, 110.5);
    this.createNoiseLayer('white', 600, 0.015); // Very thin, soft air sound
  }

  private playWarmRumble() {
    if (!this.ctx || !this.masterGain) return;
    this.createNoiseLayer('brown', 180, 0.04); // Grounding, non-distractive bass
  }

  private playSoftRain() {
    if (!this.ctx || !this.masterGain) return;
    this.createNoiseLayer('white', 950, 0.01); // High-pitched but very soft 'shhh'
  }

  private createNoiseLayer(type: 'white' | 'brown', filterFreq: number, intensity: number = 0.05) {
    if (!this.ctx || !this.masterGain) return;
    
    const bufferSize = 4 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    
    if (type === 'white') {
        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * intensity;
        }
    } else {
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.015 * white)) / 1.015;
            lastOut = output[i];
            output[i] *= 4.5 * intensity; 
        }
    }

    this.noiseNode = this.ctx.createBufferSource();
    this.noiseNode.buffer = buffer;
    this.noiseNode.loop = true;
    
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = filterFreq;
    this.filterNode.Q.value = 0.5;

    this.noiseNode.connect(this.filterNode).connect(this.masterGain);
    this.noiseNode.start();
  }
}

export const psychoacousticEngine = new PsychoacousticEngine();
