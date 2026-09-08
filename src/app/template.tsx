export default function Template({ children }: { children: React.ReactNode }) {
  /* re-mounts on every navigation → the .page-enter animation in globals.css
   * fades/lifts each page in (Apple-settings feel); no exit animation needed */
  return <div className="page-enter">{children}</div>;
}
