import { createElement, lazy, Suspense, useState } from "react";
import type { ComponentType } from "react";

/**
 * A screen loaded on demand that never suspends anything but itself.
 *
 * `React.lazy` suspends the first time it renders, even when its module was
 * fetched long before, and a suspension hides everything up to the nearest
 * `<Suspense>`. With one boundary around the whole app, opening a screen for
 * the first time hid the menu for a moment and cut off any exit animation in
 * progress: the account dropdown stayed open behind the profile for good.
 *
 * So each screen renders its module directly once `preload()` has finished
 * (the app preloads every screen when the browser is idle), and otherwise
 * suspends inside its own boundary.
 */
export interface LazyScreen<P> {
  (props: P): ReturnType<typeof createElement>;
  preload(): Promise<void>;
}

export function lazyScreen<M, P extends object>(
  load: () => Promise<M>,
  pick: (module: M) => ComponentType<P>,
): LazyScreen<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  const fetch = () => (pending ??= load().then((m) => (loaded = pick(m))));
  const Lazy = lazy(() => fetch().then((component) => ({ default: component })));

  function Screen(props: P) {
    // Chosen once per mount: switching paths later would remount the screen
    // and lose its state.
    const [direct] = useState(() => loaded);
    return direct
      ? createElement(direct, props)
      : createElement(Suspense, { fallback: null }, createElement(Lazy as unknown as ComponentType<P>, props));
  }
  Screen.preload = () =>
    fetch().then(
      () => undefined,
      () => {
        // A failed preload is retried on first render.
        pending = null;
      },
    );
  return Screen;
}
