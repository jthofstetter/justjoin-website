# JustJoin – Website

The website for **JustJoin**: see what's going on near you and just join in.

The page walks through the app from start to finish:

- **Idea**: why plans fall apart over who's coming
- **How it works**: Discover, Join, Coordinate, Start your own. A phone shows the real app screens, which play through as you scroll.
- **QuickJoin**: a hex map to try out, and the hex that splits into seven shards
- **More**, **Safety**, **FAQ** and the **Waitlist**

## Viewing

**Double-click:** Just open `index.html`. The script is already built (`assets/js/app.js`), so you need neither a build step nor an internet connection. Tested in Chromium (Chrome, Edge).

**With a local server (for development):**

```bash
npm run dev
```

Then open `http://localhost:5173`. Changes in `src/js` are rebuilt right away; reload the page to see them.

You don't need `npm install`, because the site has no dependencies. All you need is Node.js 18 or newer.

**Testing on your phone:** Your computer and phone need to be on the same Wi-Fi. Start the server for your network, then open `http://<your computer's IP>:5173` on the phone.

```powershell
$env:HOST="0.0.0.0"; npm run dev
```

## Building and publishing

```bash
npm run build
```

This rebuilds `assets/js/app.js` from `src/js`. To publish, you only need these files:

```
index.html
assets/
```

The site is published with GitHub Pages from the `main` branch of this repository: every push to `main` updates https://jthofstetter.github.io/justjoin-website/ after a minute or two. `.nojekyll` tells Pages to serve the files as they are. You can also upload `index.html` and `assets/` to any other web host. `src/`, `build.mjs` and `package.json` aren't needed online.

## Structure

```
index.html              content and structure of all sections, icons as an SVG sprite
assets/css/main.css     styling (colours, type, layout, responsive)
assets/js/app.js        built script (don't edit by hand)
assets/fonts/           self-hosted fonts + license
assets/icons/           license for the Material Icons
assets/img/             images from the app, favicon, app icon, share image, fallback image of the city
build.mjs               bundler and dev server, plain Node without packages
src/js/main.js          entry point: loading, city, sections, intro
src/js/core/            animation, scroll handling, helpers
src/js/city/            the glowing hex city (WebGL2)
  hexgrid.js            geometry of the hex grid
  mat.js                camera maths
  HexCity.js            renderer, lights, people, camera moves, labels
src/js/sections/        one file per section (loader, hero, idea, tour, QuickJoin, shards, FAQ, waitlist)
src/js/ui/              navigation, menu, magnetic buttons
```

## Design

- **Concept:** "The city lights up where something is happening." A dark city of hexes where single hexes start to glow as soon as people are up to something there. The image comes straight from QuickJoin. At the end, your own hex lights up once you've signed up.
- **Colours** as in the app (in `main.css` under `:root`):
  - surfaces `#131313`, `#1B1B1B`, `#2A2A2A`, `#353535`
  - text `#E2E2E2` and `#C6C6C6`
  - bone `#F6F4F1` and slate `#2D3542` from the app icon
  - green `#46D17A`, only for "live" and "online"
- **Type:** Inter Display (Black Italic) for the big wordmark, Inter Display and Inter for everything else. Self-hosted in `assets/fonts`, with no connection to Google (GDPR).
- **Phone screens:** The app interface is rebuilt in HTML and CSS rather than shown as screenshots, so it stays sharp at any size. The images inside are the app's fallback images.
- **No libraries.** Animations, scroll handling and the 3D city are written from scratch. The page loads nothing from third-party servers.
- **Icons:** [Material Icons](https://fonts.google.com/icons) as in the app (Apache 2.0, license in `assets/icons`).

## What you still need to set up

1. **Connect the waitlist.**
   - Add a target to the form in `index.html`: `<form class="form" data-form data-endpoint="https://…">`. That can be Formspree, Getform, Brevo or your own backend.
   - The form sends `email`, `city` and `platform` (`ios` or `android`) as a regular form POST.
   - Without `data-endpoint`, **nothing is saved**; the page then only shows the confirmation.
2. **Links.** Instagram, TikTok, legal notice, privacy policy and contact are placeholders. You'll find them via `data-todo` in `index.html`.
3. **Legal notice and privacy policy.** If you run the site from Germany or Austria, both are required (Impressum and Datenschutzerklärung), even for an English page. The privacy policy also needs to cover what happens to the waitlist email addresses.
4. **Share image.** `og:image` and `og:url` point to the GitHub Page (`https://jthofstetter.github.io/justjoin-website/`). Change them if you move to your own domain.
5. **Check the content.** The copy is based on the app, but check that everything still holds before launch:
   - In QuickJoin, others only see the hex, not your exact position ("No exact location" and the matching FAQ answer)
   - private activities only for invited friends, private profile
   - age range and limited spots per activity
   - push notifications even when the app is closed
   - deleting your account under "Account & Privacy"
   - memories: public gallery, private collection, photos only from people who were there
   - Classic and Red themes, app in English and German
   - The website always says **hex**. In some places the app also says "cell" (e.g. "Leave cell", "QuickJoin cell"). If you want one word everywhere, change one of them.

   Names, places in Vienna, times and participant counts are examples.

## Accessibility and tech

- "Reduce motion" in the system settings turns off the pinned scroll sequences and continuous motion. The tour can then be stepped through by clicking. All content stays reachable.
- Without WebGL2, the page shows a still image instead of the 3D city; everything else works as usual.
- On phones and weaker graphics, the city renders fewer hexes at a lower resolution. When it's off screen, it pauses.
- Keyboard: visible focus, skip link, menu closes with Esc, and the QuickJoin map works with Tab and Enter.
- Without JavaScript, all text stays readable.
