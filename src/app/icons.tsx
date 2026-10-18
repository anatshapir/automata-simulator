export const Logo = () => (
  <svg width="32" height="32" viewBox="0 0 34 34" aria-hidden="true">
    <circle cx="11" cy="17" r="8" fill="none" stroke="#172033" stroke-width="2" />
    <circle cx="25" cy="17" r="6" fill="none" stroke="#2C5BD4" stroke-width="2" />
    <circle cx="25" cy="17" r="3" fill="none" stroke="#2C5BD4" stroke-width="1.5" />
  </svg>
);
export const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5" width="8" height="6" rx="1.5" fill="currentColor" /><path d="M4 5V3.5a2 2 0 014 0V5" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
);
export const IconUndo = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4L2 7.5 6 11" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M2.5 7.5H10a4 4 0 010 8H8" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
);
export const IconRedo = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 4l4 3.5-4 3.5" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M13.5 7.5H6a4 4 0 000 8h2" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
);
/** Tape order is left to right: "back" points left, "forward" points right. */
export const IconBack = ({ c = "currentColor" }: { c?: string }) => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M11 3L5 8l6 5z" fill={c} /></svg>;
export const IconFwd = ({ c = "currentColor" }: { c?: string }) => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l6 5-6 5z" fill={c} /></svg>;
export const IconPlay = () => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z" fill="currentColor" /></svg>;
export const IconPause = () => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h3v12H4zM9 2h3v12H9z" fill="currentColor" /></svg>;
