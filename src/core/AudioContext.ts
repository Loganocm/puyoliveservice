/**
 * Shared Web Audio API AudioContext for the entire application.
 * 
 * Routing all audio (BGM + SFX) through a single AudioContext ensures
 * the browser treats it as "tab audio", which is reliably captured by
 * Discord screen share, OBS, and other capture tools — even when
 * sharing the entire screen rather than a specific tab.
 * 
 * Without this, `new Audio()` elements are detached from the Web Audio
 * graph and some capture tools silently skip them.
 */

let _ctx: AudioContext | null = null;

/**
 * Returns the shared AudioContext, creating it on first call.
 * Must be called after a user gesture (click/keypress) due to browser autoplay policy.
 */
export function getAudioContext(): AudioContext {
    if (!_ctx) {
        _ctx = new AudioContext();
    }
    // Resume if suspended (browsers suspend until user gesture)
    if (_ctx.state === 'suspended') {
        _ctx.resume().catch(() => {});
    }
    return _ctx;
}

/**
 * Connects an HTMLAudioElement to the shared AudioContext so its output
 * flows through the Web Audio graph (and is capturable by screen share).
 * 
 * IMPORTANT: Once connected, the element's `volume` property still works
 * but the audio ONLY outputs through the AudioContext destination.
 * This is the desired behavior — it ensures capture tools see the audio.
 * 
 * Returns the MediaElementAudioSourceNode for optional further processing.
 */
export function connectToContext(audio: HTMLAudioElement): MediaElementAudioSourceNode {
    const ctx = getAudioContext();
    const source = ctx.createMediaElementSource(audio);
    source.connect(ctx.destination);
    return source;
}
