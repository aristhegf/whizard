/*
 * From Uiverse.io by KSAplay - https://uiverse.io/KSAplay/strong-donkey-70
 * MIT License, Copyright (c) KSAplay (Kenny)
 *
 * The landscape from the "Minimalist Weather Card - Daytime": a sunset sky, the sun, hills by the
 * sea with their reflections, and trees in front. Whizard's game cards use it as the picture,
 * with the sky in the game's colour and the game's art rising from behind the hills.
 */

/** The tree from the original card, as one shape to draw in each tree's colour. */
const TREE =
  "M32,0C18.148,0,12,23.188,12,32c0,9.656,6.883,17.734,16,19.594V60c0,2.211,1.789,4,4,4s4-1.789,4-4v-8.406 C45.117,49.734,52,41.656,52,32C52,22.891,46.051,0,32,0z";

function Tree({ className, color }: { className: string; color: string }) {
  return (
    <div className={className}>
      <svg viewBox="0 0 64 64" fill={color} aria-hidden="true">
        <path d={TREE} />
      </svg>
    </div>
  );
}

/** The scene, with `art` (the game's picture) rising from behind the front hills. */
export function CardLandscape({ art }: { art: string }) {
  return (
    <section className="wx-landscape" aria-hidden="true">
      <div className="wx-sky" />
      <div className="wx-sun" />
      <div className="wx-hill-1" />
      <div className="wx-hill-2" />
      <div className="wx-ocean">
        <div className="wx-reflection" />
        <div className="wx-reflection" />
        <div className="wx-reflection" />
        <div className="wx-reflection" />
        <div className="wx-reflection" />
        <div className="wx-shadow-hill-1" />
        <div className="wx-shadow-hill-2" />
      </div>
      <img className="wx-art" src={art} alt="" width={310} height={320} />
      <div className="wx-hill-3" />
      <div className="wx-hill-4" />
      <Tree className="wx-tree-1" color="var(--wx-tree)" />
      <Tree className="wx-tree-2" color="var(--wx-tree)" />
      <Tree className="wx-tree-3" color="var(--wx-tree-far)" />
      <div className="wx-filter" />
    </section>
  );
}
