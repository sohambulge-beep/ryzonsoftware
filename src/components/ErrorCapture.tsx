import { Component, useEffect, type ReactNode } from 'react';
import { installErrorCapture } from '@/lib/errorLog';

class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Inner() {
  useEffect(() => installErrorCapture(), []);
  return null;
}

/** Starts the error recorder once when the app opens. It shows nothing. */
export default function ErrorCapture() {
  return (
    <Guard>
      <Inner />
    </Guard>
  );
}
