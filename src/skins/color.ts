/**
 * Colour arithmetic for skins: parsing, mixing and deriving the light and
 * dark shades a piece is drawn with. Pure, so it runs in tests and tools.
 */

export interface Rgb { r: number; g: number; b: number }

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Whether `value` is a #RGB or #RRGGBB colour. */
export function isHexColor(value: unknown): value is string {
    return typeof value === 'string' && HEX.test(value);
}

export function parseHex(hex: string): Rgb {
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
    const part = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

/** `a` moved `t` of the way toward `b` (0 is `a`, 1 is `b`). */
export function mix(a: string, b: string, t: number): string {
    const x = parseHex(a), y = parseHex(b);
    return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** `color` with an alpha, as a CSS rgba() string. */
export function rgba(color: string, alpha: number): string {
    const { r, g, b } = parseHex(color);
    return `rgba(${r},${g},${b},${alpha})`;
}

/** The lit shade of a piece colour, when a skin gives only the base. */
export const lightOf = (base: string) => mix(base, '#FFFFFF', 0.55);

/** The shadow shade of a piece colour, when a skin gives only the base. */
export const darkOf = (base: string) => mix(base, '#000000', 0.45);

/** Relative luminance (WCAG), 0 black to 1 white. */
export function luminance(color: string): number {
    const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const { r, g, b } = parseHex(color);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
