# MovieDeck 🎬

![MovieDeck Preview](assets/images/banner.png)

A personal project where I experimented with glassmorphism UI design. I wanted to build a movie streaming interface that rivals the big players like Netflix, Prime Video, and Apple TV—but feels even smoother.

[**Check it out**](https://moviedeck.xyz)

---

## What is this?

I built MovieDeck because most movie apps feel clunky. I wanted something that gives you everything in one place—trailers, reviews, cast details, and recommendations—without jumping through hoops.

It's a Single Page Application (SPA) that pulls data from the TMDB API. No backend, just pure frontend magic.

### Key Features
- **Glassmorphism Design:** A modern, translucent UI that feels premium.
- **Unified Experience:** Watch trailers, read reviews, and check cast details all in one modal.
- **Smart Discovery:** "More Like This" recommendations just like the major streaming platforms.
- **Instant Search:** Find movies, TV shows, or actors instantly.
- **My List:** Save your favorites to watch later (uses local storage).
- **Responsive:** Optimized for mobile, tablet, and desktop.

---

## Sneak Peek

Here's a look at the library interface:

![Library Preview](assets/images/hero-image.png)



## Challenges

Building MovieDeck involved overcoming a few interesting technical hurdles:
- **Managing API Rate Limits & Concurrency:** Balancing rapid content loading for multiple categories while respecting the TMDB API rate limits. This required careful promise resolution and deferring non-critical fetches.
- **Performance with Glassmorphism:** CSS backdrop filters can be heavy on mobile GPUs. A major challenge was optimizing the glassmorphic modal backgrounds and navbar to ensure they render smoothly across budget devices without dropping frames.
- **Graceful Fallbacks:** Handling irregular data from the API (such as missing posters, missing trailers, or incomplete metadata) without breaking the visual grid or user experience.
- **Z-Index Management:** Structuring the floating UI elements, pop-out posters, video player overlays, and dynamic modals to ensure perfect stacking orders and avoid overlaps.

---

## Future Enhancements

While MovieDeck is fully functional, here are some ideas for future growth:
- **User Authentication:** Introduce account creation so users can sync their "My List" across multiple devices instead of relying solely on local storage.
- **Next.js Transition:** Migrate the SPA into a framework like Next.js for server-side rendering (SSR) and vastly improved SEO capabilities.
- **Enhanced Video Player:** Build out a more robust, fully customized wrapper around the video embeds to unify the playback experience.
- **Advanced Filtering:** Allow deeper catalog exploration with filters for specific actors, directors, or granular user ratings.

---

## Credits

- Data provided by [The Movie DB](https://www.themoviedb.org/)
- Icons by FontAwesome
- Inspired by the best parts of Netflix, Disney+, and Apple TV interfaces.

---

_Built by Harshil._
