export function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="sn-aurora sn-aurora-a" />
      <div className="sn-aurora sn-aurora-b" />
      <div className="sn-aurora sn-aurora-c" />
      <div className="sn-stars" />
      <div className="sn-stars sn-stars-slow" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-background to-transparent" />
    </div>
  );
}
