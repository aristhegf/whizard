# Adding questions

Quiz questions live in `packages/content/src/questions/`, one JSON file per category. They ship with the app, and the test suite checks every one on every push. This guide is the standard for every new batch.

## Format

```json
{
  "id": "geography-061",
  "category": "geography",
  "topic": "Rivers",
  "difficulty": "medium",
  "prompt": "Which river flows through Cairo?",
  "choices": ["The Nile", "The Congo", "The Niger", "The Zambezi"],
  "explanation": "Cairo sits on the banks of the Nile, near where it splits into the delta."
}
```

- **`id`:** the category id plus the next number in that file, zero-padded (`geography-061`). Never reuse or renumber an id.
- **`choices`:** exactly four. **The first is the correct answer.** The game shuffles them for every room.
- **`difficulty`:** `easy` (most adults know it), `medium` (someone who enjoys the subject knows it), `hard` (a real fan might still miss it).
- **`explanation`:** one plain sentence saying why the answer is right. Players see it in the end-of-game review.
- **`reference`:** Bible questions only. The verse that contains the answer, such as `"Genesis 6:13-14"`.
- **Limits:** prompt at most 120 characters, each choice at most 40, explanation at most 160.

## Rules for every question

- **Certain, not likely.** Only add a question if the answer is definitely right. If in doubt, write a different one.
- **Exactly one right answer.** The three wrong choices are plausible, of the same type as the answer (all people, all places, all years) and clearly wrong on reflection. No "all of the above" and no joke answers.
- **No giveaways.** The answer must not appear in the prompt.
- **No repeats.** Don't ask a fact that's already in the file, even in different words, or one another category asks. Each fact belongs to one category.
- **Built to last.** Avoid anything that goes out of date or is disputed. The notes for each category say what that means there.
- **Spread out.** Cover many topics in the category, not the same famous facts again.

## Category notes

| Category          | Cover                                                                                                                                                             | Avoid                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bible             | Stories, people, places and teachings across both Testaments, roughly 60/40 Old to New. Every question has a verse reference                                      | Anything that depends on the translation (KJV, NIV and ESV wording or numbers differ), anything denominational or disputed, details found only in tradition |
| Geography         | Capitals, countries, rivers, lakes, mountains, deserts, oceans, islands, borders, landmarks, map knowledge, with a fair share of Africa and Nigeria               | Population figures or rankings, "largest city" claims, disputed territories or capitals, recently renamed places                                            |
| History           | Ancient civilisations, empires, world wars, revolutions, explorers, inventions, independence movements, the Cold War, African and Nigerian history                | Contested interpretations, disputed numbers such as death tolls, anything after 2020, anything still politically contested                                  |
| Science           | Physics, chemistry, biology, the human body, earth science, space, famous scientists and discoveries, units                                                       | Facts that change with new discoveries (numbers of moons, "largest known" objects), figures where sources disagree                                          |
| Animals           | Mammals, birds, reptiles, fish, insects, sea life, animal groups and young, habitats, diets, firmly established record-holders, African wildlife                  | Exact lifespans, speeds or weights where sources disagree, popular myths, conservation status                                                               |
| Football          | World Cup and continental competition history, legendary players and nationalities, famous clubs and their cities or stadiums, the rules, Nigerian football       | Anything current: champions, managers, a player's current club, records that could still be broken, anything after early 2024                               |
| Movies            | Famous films and directors, iconic characters and actors, animation, franchises, Best Picture history, film firsts, Nollywood                                     | Box-office rankings, "latest" films, uncertain or commonly misquoted lines, anything after 2023                                                             |
| Music             | Artists, bands, songs and albums, instruments, music terms, classical composers, genres, African and Nigerian music from Afrobeat to gospel                       | Chart positions, streaming numbers, "most awarded" claims, disputed songwriting credits, anything after 2023                                                |
| Nigerian culture  | Languages and peoples, states and capitals, food, festivals, attire, national symbols, landmarks, literature, Nollywood, music, history                           | Current office holders, population figures, contested ethnic or religious claims, politically sensitive topics                                              |
| General knowledge | Classic quiz trivia: language, numbers, everyday science, inventions, art, literature, flags described in words, food origins, sports rules, mythology            | Records, rankings, prices, office holders, "firsts" that historians argue over                                                                              |
| Pop culture       | TV shows and characters, cartoons, video games and consoles, toys and brands, superheroes, internet history, reality TV history, African and Nigerian pop culture | Current owners or CEOs, relationships, follower counts, "most popular" claims, anything after 2023                                                          |

## How a batch is added

1. **Write** the new questions at the end of the category's file, following the rules above.
2. **Fact-check independently.** Someone who didn't write the batch reviews every question as a skeptic: is the answer definitely right, is any wrong choice also defensible, is the wording ambiguous, could it go stale, is the level right? They fix or replace anything that fails. The first 600 questions changed 28 times at this step, so it's worth it.
3. **Test** with `pnpm test`. The suite rejects bad shapes, repeated choices, giveaways, near-duplicates and missing Bible references, repeats of a fact another category asks, and makes sure every level of every category still has at least 60 questions.
4. **Ship** through a normal commit. The deploy runs only when every check passes.

## Fixing or adding one question from the admin page

For a quick fix, or a single new question, admins can use **Content** at `/admin/content` instead. It runs the same checks, and the change reaches new games within a minute, with no deploy. The edit lives in the database on top of these files, so for anything lasting, copy it into the category's file through a pull request (with a fact-check as above) and then press **Undo my edits**. The **Questions** page shows which questions players get wrong most and which look easier or harder than their level, which is a good place to find what to fix.
