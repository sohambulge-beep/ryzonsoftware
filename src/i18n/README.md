# Languages in TapTrack

The app is written in English. Each other language is a dictionary file in `src/i18n/locales/<code>/`.

- `locales/hi/*.ts` is Hindi, `locales/mr/*.ts` is Marathi. Every `.ts` file in a language folder is loaded automatically.
- A line looks like this:  `"Save Expense": "खर्च सहेजें",`
- A changing value uses a gap:  `{n}` any text,  `{#n}` a number,  `{$n}` an amount.
  Example:  `"Last {#n} days": "पिछले {n} दिन",`
- Text that has no line stays in English. Numbers, amounts and names are never changed.

## Adding a new language (for example Gujarati)
1. Make the folder `src/i18n/locales/gu/` and put a file in it, for example `core.ts`, with the same layout as `locales/hi/core.ts`.
2. That is all. Gujarati stops saying "Coming soon" and becomes selectable.

## Finding what is not translated yet
1. Open the app with `?i18n=debug` at the end of the link and choose the language.
2. Open a screen. A small "Copy missing" button appears at the bottom left.
3. Press it and paste the list into a new dictionary file. Names of beers, customers and suppliers in that list are data, ignore them.
Use `?i18n=off` to hide the button again.
