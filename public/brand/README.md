# Rockwood web identity

Source: Rockwood-Identity-Kit-2026-10-15 supplied by the owner.

- `rockwood-development.svg`: unchanged `01-Development/Vector/rockwood-development-horizontal-primary.svg`.
- `rockwood-cam-v2.svg`: camera emblem from the owner's October 15 WhatsApp reference, paired with the approved joined ROCKWOODCam wordmark. Cam and the camera are oxblood. `rockwood-cam.svg` is retained only for historical references.
- `favicon.ico`: unchanged `03-Icons-and-Social/favicon.ico`.

Use transparent vectors on light surfaces. Do not apply filters or blend modes. The Cam name stays on one baseline, with Cam in oxblood. Palette: cream #F3F0E8, oxblood #6B2438, black #252321, stone #898680. Stone is decorative; secondary text uses a darker accessible tone.

Shared UI tokens and office styling live in app/brand.css; Cam-specific styling is scoped in app/cam/cam.css. Inter and EB Garamond are self-hosted in app/fonts with their OFL licenses. Existing raster files are retained for historical compatibility but are no longer displayed by the interface.

## Saved apps and link previews

`cam/v2` contains the camera SVG, opaque cream iPhone icon (180px), Android icons (192/512px), dedicated maskable icon, favicon and 1200×630 sharing image. `development/v1` contains the separate office identity. All marks and wordmarks are vector paths; no external fonts or image references are required by the SVGs.

`app/cam/layout.tsx` overrides the root icon, manifest, app name, description and Open Graph/Twitter image. Its manifest has `/cam` as its stable ID, start URL and scope. The office manifest uses `/workspace`. This keeps saving Cam from installing the office entry point. All branding files are public; private visit/report content is never included in sharing metadata. No service worker or offline cache is added.

The current Cam entry URL is `https://rockwood-projects.vercel.app/cam`; the old `rockwood-walkthrough.vercel.app` root redirects there. Existing iPhone shortcuts and previously sent link previews can retain cached branding. After the release, use Safari's Share → Add to Home Screen on the Cam URL to add a fresh shortcut. Verify the new shortcut before removing the old one; do not clear site data or remove pending recordings.

Run `node scripts/verify-branding.mjs http://127.0.0.1:8792` against a running build, then against the deployed origin. It only fetches public pages/assets and does not submit data or sign in.
