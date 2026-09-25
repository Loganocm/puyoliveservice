---
title: Legal and IP
description: Trademark, artwork provenance, licensing and privacy — what blocks a commercial future and how to clear it.
sidebar:
  order: 9
---

Findings: `LEG-01` to `LEG-03` in the [register](/review/findings/). This page
is an engineering assessment, not legal advice; the actions marked for the
owner need a qualified opinion before money is involved.

## The name

"Puyo Puyo" is a registered trademark of SEGA, who publish the series today. The
game mechanic itself (matching four, chains, garbage) is not protectable, and
the genre has many independent games. The risk is in names and art that
suggest an association that does not exist. "Puyo Live" and the domain
`puyo.live` lean on the mark.

**Owner action:** decide between keeping the name non-commercially, which is
lower risk but not zero, or a rebrand before any monetization, marketing push
or store listing. A distinct name also makes a stronger brand; see
[visual identity](/design/visual-identity/).

## The art

`src/resources/puyo.png` and `puyosprites.png` follow the layout of fan
"skins" whose art derives from the official games, and their origin is not
recorded (LEG-01). **They are replaced in 0.3.0** by an original, procedurally
drawn set (see [visual identity](/design/visual-identity/)). After this release
they are no longer shipped, but they remain in git history.

The menu backgrounds' file names match Pixabay's naming pattern
(`author-title-id.jpg`). The Pixabay Content License permits free commercial
use without attribution, but the source of each file should still be recorded.
The music's provenance is unknown (LEG-02).

**Owner action:** confirm the origin and licence of the header logo and the
three music tracks, and record every third-party asset in an `ASSETS.md` with
its source and licence.

## The code licence

The README said MIT, but there was no `LICENSE` file (LEG-02). Without one, the
code is legally all rights reserved, whatever the README says. Choosing a
licence is the owner's decision:

- **MIT** lets anyone reuse the code, including in a competing game.
- **AGPL-3.0** keeps the code open, including for hosted modified versions.
- **Proprietary** (no open licence) keeps the most control and suits a
  commercial product.

Whatever is chosen, it covers code only; art and audio need their own terms.

## Privacy

The API stores IP addresses in login logs with no enforced retention, and there
is no self-service data export or account deletion (LEG-03). The privacy page
(`public/legal.html`) should state the retention period and the job that
enforces it. Deletion and export are required under GDPR for EU players, and a
game that is attractive to under-13s must also consider COPPA. Designing for
that now is much cheaper than retrofitting it.
