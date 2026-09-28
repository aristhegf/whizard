import { Loader } from "@/components/motion/loader";

/** Bouncing dots (a BeUI loader) while something loads. */
export function Loading({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={`loading ${className ?? ""}`}>
      <Loader variant="dots" size={30} label={label} />
    </div>
  );
}
