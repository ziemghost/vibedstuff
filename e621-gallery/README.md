# e621 pop-out gallery

A Firefox content script that turns any e621 (or e926) post listing into a horizontally
scrollable gallery.

## What it does

- Clicking a post on a listing page opens it in a full-screen gallery instead of navigating.
- Slides sit in one horizontal row with **256px of empty space** between them, so the
  neighbouring posts are visible either side of the one you are looking at.
- Every slide starts as its thumbnail and upgrades to the real media — sample-resolution
  image, gif, or webm/mp4 — for the active post and two either side.
- **← / →** move one post. `Home` / `End` jump to the ends, `0` resets zoom, `Esc` closes.
  Clicking a visible neighbour jumps to it.
- **↑ / ↓** jump the active video forward / back 5 seconds. Short clips wrap round, and a
  paused video stays paused — only the playhead moves. On a still image they do nothing.
- **Wheel** zooms the active post about the cursor. Zooming out stops at the size the post
  loaded at, so the fitted view is the furthest out you can go. Drag to pan once zoomed in.
- The page behind the overlay scrolls so the post you are viewing is where you left off
  when you close.
- Videos autoplay **with sound** when you first reach them, pause when you move away, and
  stay paused if you come back. Pausing one by hand sticks for the same reason.
- Arrowing past the last post loads the next page of results and opens at its first post;
  arrowing left off the first post goes back a page and opens at its last post.
- A **tags** button (or `t`) opens a panel listing the current post's tags grouped by
  category, coloured the way e621 colours them. Each tag has **+** and **−**: `+` adds it to
  the search, `−` adds it negated, and either one reloads the listing with the new filter.
  Clicking the side a tag is already on removes it again. Other search terms, including
  metatags like `order:score`, are kept; the page number is reset. The panel's open/closed
  state is remembered.

## Install

Unsigned add-ons only load temporarily in release Firefox:

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…**
3. Pick `manifest.json` from this folder (or the `.xpi`, which is just a zip of it)

That lasts until Firefox restarts. To keep it permanently, either use
[Firefox Developer Edition / Nightly](https://www.mozilla.org/firefox/developer/) with
`xpinstall.signatures.required` set to `false` in `about:config`, or submit the zip to
[addons.mozilla.org](https://addons.mozilla.org/developers/) for self-distribution signing.

## Where the media urls come from

The listing markup carries them (`data-file-url`, `data-large-file-url`,
`data-preview-file-url`, `data-file-ext`), so the common case costs no extra requests. When
an attribute is missing the script falls back to `/posts/{id}.json` for that one post, which
only needs the post's `data-id` or its `id="post_123"`. If e621 ever renames the attributes,
the API path keeps it working.

Images use the `sample` url rather than the original, which is what "full picture, not
necessarily full resolution" means here. Gifs and videos always use the original file,
because their samples are still frames.

## Notes

- Ctrl/middle/shift-click still open a post in a new tab as normal.
- Audible autoplay can be refused by Firefox's autoplay policy. If that happens the video
  plays muted and a hint appears; unmute it in the player and Firefox will remember the
  choice for the site.
- Only the posts on the current page are in the gallery; page turns are handled by the
  arrow keys as described above.
