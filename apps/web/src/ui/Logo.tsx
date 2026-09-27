/** The crowned W. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      className={className ? `logo-mark ${className}` : "logo-mark"}
      src="/art/logo-mark.webp"
      alt=""
      width={256}
      height={256}
    />
  );
}
