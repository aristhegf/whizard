# Game card art prompts

The pictures in `apps/web/public/art/cards/<game-id>.webp` are full scenes for the image area at the top of each game card. They star Whiz and his crew. This file keeps everything needed to remake one or add a new game in the same style.

The art in `apps/web/public/art/games/` is separate. Countdowns, the lobby, share images and the Welcome page use it, so leave it alone.

## The idea

Whizard is the genius, the guru, the smart one everybody wants to be. Everybody claims to be the Whizard, and the games test who really is the Whizard in a friend group. So every scene shows friends as equals:

- Whiz appears only as one of the players, never as a host, teacher, judge or detective.
- The gold crown and cape stand for the Whizard title everyone wants. Friends wear homemade versions, or a crown hovers over the "winner".

## Cast

The references are the files in `apps/web/public/art/mascot/`.

- **Whiz:** purple, gold crown with pink gems, a cape and a W on his chest (`hero.webp`).
- **The crew** (`crew.webp`): a green block buddy, an orange block buddy, a blue buddy with headphones, two small yellow blob twins and a dark-purple round buddy.

## How the images were made

- **Model:** `gemini-3-pro-image` ("Nano Banana Pro") at 16:9, 1K, through the `banana` skill. Each image was planned and approved before the paid call.
- **References:**
  1. A screenshot of the Card Lab game grid, as a **style** reference only.
  2. `mascot/hero.webp`, as a **character** reference for Whiz.
  3. `mascot/crew.webp`, as a **character** reference for the crew.

  The two mascot files were flattened onto white as PNG first.

- **Post-processing:** a 1.43:1 crop of the 16:9 original, scaled to 640×448 and saved as WebP at quality 92 (27–50 KB each). Impostor is cropped slightly left of centre so the line-up keeps Whiz and the suspect. The 16:9 originals were handed over for animation in Google Flow and aren't stored in the repo.
- **Animation:** none in the repo. The plan is short loops made in Google Flow from these stills. The still should stay as the poster image, with the video loaded only when the card is on screen, muted, and not played for people who prefer reduced motion.

## Prompt template

Fill the `{...}` fields from the table below. The palette and the "what players do" line come from each game's entry in `apps/web/src/catalog.ts`.

```text
Create the image artwork for a Whizard party game card, starring the Whizard characters.

STORY: Whizard is the genius, the guru, the smart one everybody wants to be. Everybody claims to be the Whizard, and these games test who really is the Whizard in a friend group. All characters are friends and equals; Whiz is only ever one of the players, never a host, teacher, judge or detective. The gold crown and cape stand for the Whizard title everyone wants.

GAME NAME: {name}
WHAT PLAYERS DO: {does}
MOOD: {mood}
CORE IDEA: {core}
SCENE WITH THE WHIZARD CAST: {scene}
PALETTE: {palette}

References: the first image is the Whizard game-card screenshot, a style reference only. The other images show the Whizard characters: Whiz, the purple mascot with a gold crown, a cape and a W on his chest, and his crew (a green block buddy, an orange block buddy, a blue buddy with headphones, two small yellow blob twins and a dark-purple round buddy). Keep Whiz and any crew members used exactly on-model: same shapes, colours, faces and outfits.

Make a new illustration in the same family: bright, friendly, polished, playful 3D toy-like artwork; bold, readable shapes; rich but balanced colour; soft lighting; subtle depth; and a warm, simple background with a gentle horizon or abstract landscape. Give the game its own distinctive palette while keeping the Whizard look consistent.

One strong central moment that communicates the game's core idea at a glance, even when the card is small, with only a few supporting details. Compact, memorable composition with clear separation from the background. Fill the frame edge to edge, but keep every character and key prop inside the central 70 percent of the width so a centre crop keeps them. Characters in lively, clear poses, as if caught mid-action in a short animation.

Output: one finished 16:9 illustration for the image area at the top of a digital game card. No words, letters or numbers anywhere (the W on Whiz's chest, and any homemade W the scene asks for, are the only exceptions), no logos, watermark, card border, card mockup, UI or blank white studio background. Do not copy the game icons from the screenshot. Avoid excessive empty space, tiny details, clutter, realistic photography and elements unrelated to the game.
```

## Per-game fields

### Quiz (`quiz`)

- **What players do:** Everyone answers the same multiple-choice trivia questions against a countdown; quick, correct answers score the most.
- **Mood:** competitive, upbeat
- **Core idea:** a lively game-show trivia face-off
- **Scene:** Whiz and the green block buddy face off on either side of a big game-show buzzer podium with four plain glowing coloured answer pads; Whiz is mid-slam on the buzzer, the buddy reaching a split second late; a chunky stopwatch with a blank face and no digits hovers above.
- **Palette:** warm orange and deep plum

### Jigsaw (`jigsaw`)

- **What players do:** Players race to drag scattered jigsaw pieces back into place to rebuild a picture.
- **Mood:** satisfying, racing
- **Core idea:** chunky pieces snapping together to complete a picture
- **Scene:** The orange block buddy and the green block buddy race side by side to finish a big tabletop jigsaw puzzle whose picture is a portrait of Whiz with his crown; the orange buddy clicks the last chunky piece into place while the green buddy reaches for it a moment too late. Everyone is in the central 70 percent of the width.
- **Palette:** amber yellow and royal purple

### Word Rush (`word-rush`)

- **What players do:** Players unscramble jumbled letter tiles and fill in missing letters to make words as fast as they can.
- **Mood:** frantic, clever
- **Core idea:** tiles tumbling and snapping into a row at speed
- **Scene:** The orange block buddy and the green block buddy race neck and neck in the middle of the frame, both large and close to the viewer, grabbing plain blank rounded tiles (no markings) out of the air and slamming them into a neat row on a glowing board in front of them; the orange buddy wears an oversized homemade Whizard cape flapping behind it. Light swoosh trails and a small hourglass on the board. Nothing in the foreground blocks the view: no large blurry objects near the camera, no tiles close to the lens. Everyone inside the central 70 percent of the width. Whiz is exactly on-model as in the reference: a smooth, round purple head with no hair, no tuft, no ears and no horns, gold crown with pink gems, cape, W on his chest. The crew are smooth and on-model too.
- **Palette:** electric violet and deep indigo

### Memory (`memory`)

- **What players do:** Players flip cards two at a time to find matching pairs, remembering where each picture was.
- **Mood:** cozy, clever
- **Core idea:** two flipped cards revealing a matching pair
- **Scene:** Whiz and the two yellow blob twins sit around a small grid of face-down cards as fellow players; one twin triumphantly flips up the second card of a matching pair, both showing the same simple cherry picture, while Whiz gasps in surprise and the other twin cheers. Everyone is in the central 70 percent of the width.
- **Palette:** emerald teal and deep sea blue

### Logic (`logic`)

- **What players do:** Players work through a grid puzzle using clues and careful deduction until every cell is solved.
- **Mood:** clever, calm
- **Core idea:** cracking a grid puzzle with clear thinking
- **Scene:** The dark-purple round buddy, wearing a too-big homemade gold Whizard crown that slips over one eye, frowns in deep concentration over a chunky tile grid marked with ticks and crosses, one paw tapping its chin; a bright lightbulb glows on above its head as it cracks the puzzle. Everyone is in the central 70 percent of the width.
- **Palette:** sky blue and midnight navy

### Connections (`connections`)

- **What players do:** Players sort sixteen tiles into four hidden groups that share something in common.
- **Mood:** clever, satisfying
- **Core idea:** scattered tiles snapping into four colour-coded groups
- **Scene:** The friends (the green block buddy, the orange block buddy, the blue headphones buddy and Whiz) each carry plain rounded tiles in their own colour and happily sort them into four tidy colour groups on the ground, glowing threads linking tiles of the same colour. Everyone is in the central 70 percent of the width.
- **Palette:** orchid purple with four bright group colours

### Reaction (`reaction`)

- **What players do:** Players wait for the signal and tap as fast as they can; the quickest finger wins the round.
- **Mood:** frantic, competitive
- **Core idea:** a lightning-fast tap the instant the signal fires
- **Scene:** Whiz and the blue headphones buddy stand side by side at two big arcade push-buttons, both slamming down with their fists at the exact moment a chunky starting light above them flips to green; a small yellow lightning bolt crackles between their buttons. Both characters fill most of the frame height, inside the central 70 percent of the width. Whiz is exactly on-model as in the reference: a smooth, round purple head with no hair, no tuft, no ears and no horns, gold crown with pink gems, cape, W on his chest. The crew are smooth and on-model too.
- **Palette:** electric blue and bright yellow

### Spot It (`spot-it`)

- **What players do:** Players scan a group of near-identical items to spot the odd one out before time runs out.
- **Mood:** sharp-eyed, playful
- **Core idea:** one different item hiding among many identical ones
- **Scene:** A tidy field of about twelve identical, fairly large yellow toy rubber ducks sits in the foreground; exactly one duck is a different colour (blue). Behind them, the friends (Whiz, the orange block buddy and the yellow twins) peek over eagerly, and the green block buddy holds a big magnifying glass over the blue duck and points at it triumphantly. Clean, uncluttered, everyone inside the central 70 percent of the width. Whiz is exactly on-model as in the reference: a smooth, round purple head with no hair, no tuft, no ears and no horns, gold crown with pink gems, cape, W on his chest. The crew are smooth and on-model too.
- **Palette:** fresh lime green and deep teal

### Most Likely To (`most-likely-to`)

- **What players do:** The group votes on who among them is most likely to do something silly, then everyone sees the results.
- **Mood:** hilarious, social
- **Core idea:** the whole group pointing at one surprised friend
- **Scene:** The friends sit in a cosy circle on the grass at sunset: Whiz, the green block buddy, the blue headphones buddy and the yellow twins all point, laughing, at the orange block buddy, who blushes and grins with surprise as a glowing gold Whizard crown hovers just above its head. Everyone is in the central 70 percent of the width.
- **Palette:** coral red and deep berry

### How Well Do You Know Me? (`how-well`)

- **What players do:** One player answers questions about themselves and the others guess their answers to see who really knows them.
- **Mood:** warm, cozy, playful
- **Core idea:** two friends perfectly in sync
- **Scene:** Whiz and the blue headphones buddy, best friends, sit close together in the centre of the frame and go for an excited high-five; directly above their heads, close together and well inside the frame, each has a small thought bubble showing the same simple picture of a pizza slice. Both thought bubbles and both characters sit inside the central 60 percent of the width, with clear space around the bubbles. Whiz is exactly on-model as in the reference: a smooth, round purple head with no hair, no tuft, no ears and no horns, gold crown with pink gems, cape, W on his chest. The crew are smooth and on-model too.
- **Palette:** lavender purple and rose pink

### Impostor (`impostor`)

- **What players do:** One secret impostor hides among the players; everyone discusses clues and votes to find them before it is too late.
- **Mood:** suspenseful but playful
- **Core idea:** one sneaky impostor hiding in a line-up of identical friends
- **Scene:** The crew stand shoulder to shoulder in a line-up, and every one of them wears a homemade Whizard costume: a paper or cardboard gold crown and a little cape, all proudly claiming to be the Whizard. The real Whiz stands among them in the line-up as an equal, looking smug. One fake, the dark-purple round buddy in the middle, is obviously sweating, its cardboard crown slipping askew and a hand-cut W taped to its chest, eyes darting sideways. A soft spotlight falls on the line-up. Everyone is in the central 70 percent of the width.
- **Palette:** indigo violet and deep blue

## Notes

- Quiz was made in an earlier round. Its prompt had the same template without the STORY paragraph. It already shows Whiz as a contestant, not a host, so it was kept.
- Reaction, Spot It, Word Rush and How Well were redone in a second round. That round added a line to each scene that keeps Whiz on-model: a smooth round head with no hair, tufts, ears or horns. Word Rush also needed its view cleared, and How Well its thought bubbles kept inside the crop.
- Word Rush's 16:9 original came back with dark bars down both sides. Its card picture is cropped from the middle, from x 226 to 1150, so the bars don't show. The W on the orange buddy's homemade cape reads as an M from behind.
- Small leftover differences: the blue headphones buddy has a little tuft in Reaction and How Well.
- Rules every picture follows: no words, letters or numbers (the W on Whiz, or a homemade W, is the only exception), no logos, UI or card frame, and Whiz is never a host.
