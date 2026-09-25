/**
 * Read CHANGELOG.md (Keep a Changelog 1.1.0). Used by the release workflow to
 * publish a version's section as its release notes.
 */

/** The body of the `## [version]` section, without its heading, or null. */
export function changelogSection(changelog: string, version: string): string | null {
    const lines = changelog.replace(/\r\n?/g, '\n').split('\n');
    const heading = new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`);
    const start = lines.findIndex(l => heading.test(l));
    if (start < 0) return null;
    let end = lines.findIndex((l, i) => i > start && (/^## \[/.test(l) || /^\[[^\]]+\]:\s/.test(l)));
    if (end < 0) end = lines.length;
    const body = lines.slice(start + 1, end).join('\n').trim();
    return body.length > 0 ? body : null;
}

/** Every released version, newest first (excludes Unreleased). */
export function releasedVersions(changelog: string): string[] {
    return [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+[^\]]*)\]/gm)].map(m => m[1]);
}
