import { config } from '../config/index.js';

/**
 * Avatars are stored as data URIs (at most ~100 KB) but never sent inline.
 * Responses carry a URL instead, versioned by when the avatar last changed,
 * so the image itself is fetched once and then cached for good.
 *
 * Inlining them made /users/all and /users/search 3-4 MB responses for a
 * page of 20-25 players.
 */

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** The public URL of a user's avatar, or undefined when they have none. */
export function avatarUrl(userId: number, updatedAt: Date | null | undefined): string | undefined {
  if (!updatedAt) return undefined;
  return `${config.publicUrl}/api/users/${userId}/avatar?v=${updatedAt.getTime().toString(36)}`;
}

/** Decode a stored avatar. Only the image types uploads accept are served. */
export function decodeAvatar(dataUri: string): { mime: string; bytes: Buffer } | null {
  const match = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUri);
  if (!match || !ALLOWED.has(match[1])) return null;
  return { mime: match[1], bytes: Buffer.from(match[2], 'base64') };
}
