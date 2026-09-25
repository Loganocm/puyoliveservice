import { describe, it, expect } from 'vitest';
import { changelogSection, releasedVersions } from '../../scripts/lib/changelog';

const log = `# Changelog

## [Unreleased]

### Added
- Something new.

## [0.3.0] - 2026-09-25

### Added
- Forums.

### Fixed
- **NET-14**: match results.

## [0.2.0] - 2026-08-25

- Earlier.

[Unreleased]: https://example.com/compare/v0.3.0...HEAD
[0.3.0]: https://example.com/compare/v0.2.0...v0.3.0
`;

describe('changelog', () => {
    it('extracts one version section without its heading', () => {
        expect(changelogSection(log, '0.3.0')).toBe('### Added\n- Forums.\n\n### Fixed\n- **NET-14**: match results.');
    });

    it('stops at the link references after the last section', () => {
        expect(changelogSection(log, '0.2.0')).toBe('- Earlier.');
    });

    it('returns null for a missing or empty version', () => {
        expect(changelogSection(log, '9.9.9')).toBeNull();
        expect(changelogSection('## [1.0.0]\n\n## [0.9.0]\n- x', '1.0.0')).toBeNull();
    });

    it('does not treat dots in the version as wildcards', () => {
        expect(changelogSection('## [0x3y0]\n- nope', '0.3.0')).toBeNull();
    });

    it('lists released versions, newest first', () => {
        expect(releasedVersions(log)).toEqual(['0.3.0', '0.2.0']);
    });
});
