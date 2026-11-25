// A recording stand-in for AudioContext, shared by the wide-audio tests.
// Nobody can listen in a test, so it logs structure instead: which nodes
// were made, how they were connected, every scheduled parameter change and
// every start and stop time. It is as strict as a browser where that
// catches real bugs (a ramp to zero, a second start, a stop before start).

export class FakeParam {
    constructor(value = 0) {
        this.value = value;
        this.events = [];
        this.inputs = [];
    }
    _add(kind, value, time) {
        if (!Number.isFinite(value) || !Number.isFinite(time)) throw new TypeError(`${kind}: non-finite value`);
        if (time < 0) throw new RangeError(`${kind}: negative time`);
        this.events.push({ kind, value, time });
        return this;
    }
    setValueAtTime(v, t) { return this._add('set', v, t); }
    linearRampToValueAtTime(v, t) { return this._add('linear', v, t); }
    exponentialRampToValueAtTime(v, t) {
        if (v === 0) throw new RangeError('exponential ramp to zero');
        return this._add('exp', v, t);
    }
    setTargetAtTime(v, t, c) {
        if (!(c >= 0)) throw new RangeError('bad time constant');
        this.last = v;
        return this._add('target', v, t);
    }
    cancelScheduledValues() { return this; }
    // Largest value this parameter is ever asked to reach.
    peak() {
        return this.events.length ? Math.max(...this.events.map((e) => e.value)) : this.value;
    }
}

class FakeNode {
    constructor(ctx, kind) {
        this.ctx = ctx;
        this.kind = kind;
        this.outputs = [];
        this.disconnected = false;
    }
    connect(dest) {
        if (!dest) throw new TypeError('connect to nothing');
        this.outputs.push(dest);
        if (dest instanceof FakeParam) dest.inputs.push(this);
        return dest;
    }
    disconnect() {
        this.disconnected = true;
        this.outputs = [];
    }
}

class FakeSource extends FakeNode {
    constructor(ctx, kind) {
        super(ctx, kind);
        this.startTime = null;
        this.stopTime = null;
        this.onended = null;
    }
    start(t = this.ctx.currentTime) {
        if (this.startTime != null) throw new Error('start called twice');
        if (!Number.isFinite(t) || t < 0) throw new RangeError('bad start time');
        this.startTime = t;
    }
    stop(t = this.ctx.currentTime) {
        if (this.startTime == null) throw new Error('stop before start');
        if (!Number.isFinite(t) || t < 0) throw new RangeError('bad stop time');
        this.stopTime = t;
    }
}

export class FakeAudioContext {
    constructor() {
        this.currentTime = 0;
        this.sampleRate = 8000;
        this.state = 'running';
        this.destination = new FakeNode(this, 'destination');
        this.nodes = [];
        this.resumed = 0;
    }
    _node(kind, Type = FakeNode) {
        const n = new Type(this, kind);
        this.nodes.push(n);
        return n;
    }
    createGain() {
        const n = this._node('gain');
        n.gain = new FakeParam(1);
        return n;
    }
    createOscillator() {
        const n = this._node('oscillator', FakeSource);
        n.type = 'sine';
        n.frequency = new FakeParam(440);
        n.detune = new FakeParam(0);
        return n;
    }
    createBufferSource() {
        const n = this._node('bufferSource', FakeSource);
        n.buffer = null;
        n.loop = false;
        return n;
    }
    createBiquadFilter() {
        const n = this._node('biquad');
        n.type = 'lowpass';
        n.frequency = new FakeParam(350);
        n.Q = new FakeParam(1);
        return n;
    }
    createDelay() {
        const n = this._node('delay');
        n.delayTime = new FakeParam(0);
        return n;
    }
    createWaveShaper() {
        const n = this._node('waveShaper');
        n.curve = null;
        return n;
    }
    createStereoPanner() {
        const n = this._node('panner');
        n.pan = new FakeParam(0);
        return n;
    }
    createBuffer(channels, length, sampleRate) {
        const data = new Float32Array(length);
        return { length, sampleRate, getChannelData: () => data };
    }
    resume() {
        this.resumed++;
        this.state = 'running';
        return Promise.resolve();
    }
    suspend() {
        this.state = 'suspended';
        return Promise.resolve();
    }
    // Everything that makes sound by itself.
    sources() {
        return this.nodes.filter((n) => n instanceof FakeSource);
    }
    count(kind) {
        return this.nodes.filter((n) => n.kind === kind).length;
    }
}

// Most sources sounding at once across the whole log.
export function peakSources(ctx) {
    const marks = [];
    for (const s of ctx.sources()) {
        if (s.startTime == null) continue;
        marks.push([s.startTime, 1], [s.stopTime ?? Infinity, -1]);
    }
    marks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let now = 0;
    let peak = 0;
    for (const [, step] of marks) {
        now += step;
        peak = Math.max(peak, now);
    }
    return peak;
}
