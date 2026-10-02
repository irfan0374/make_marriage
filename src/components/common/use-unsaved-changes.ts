'use client';

import { useEffect } from 'react';

const MESSAGE = 'You have unsaved changes. Leave this page without saving them?';
const GUARD = '__unsavedChangesGuard';

/**
 * Ask before leaving a page with unsaved changes: links inside the app (including the logo and
 * menu items), the browser's Back button, and closing or reloading the tab. Pass `false` while
 * saving, so the redirect after a successful save isn't questioned.
 */
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;

    // Closing the tab, reloading, or going to another site: the browser shows its own prompt.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    // Links in the app. Runs in the capture phase, before Next.js handles the click.
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return; // Opening in a new tab or window keeps this page.
      }
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return; // Handled by beforeunload.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      if (!window.confirm(MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    // The Back button: an extra history entry for this page means Back lands here first, where
    // we can ask. Leaving goes back once more; staying restores the entry. Next.js's own state is
    // copied so its router treats the entry as this page, and marked so it's added only once
    // however often the form becomes dirty again.
    const pushGuard = () =>
      window.history.pushState(
        { ...window.history.state, [GUARD]: true },
        '',
        window.location.href,
      );
    if (!window.history.state?.[GUARD]) pushGuard();
    const onPopState = () => {
      if (window.confirm(MESSAGE)) {
        window.removeEventListener('popstate', onPopState);
        window.history.back();
      } else {
        pushGuard();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, [dirty]);
}
