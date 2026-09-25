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
 * Route an HTMLAudioElement through the shared AudioContext (so capture tools
 * hear it) via a gain node, and return the gain node.
 *
 * Set volume and fades on the returned gain, not on `audio.volume`: once an
 * element feeds the Web Audio graph, browsers disagree about whether its own
 * volume still applies, so it is left at 1.
 */
export function routeElement(audio: HTMLAudioElement): GainNode {
    const ctx = getAudioContext();
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    source.connect(gain).connect(ctx.destination);
    return gain;
}
