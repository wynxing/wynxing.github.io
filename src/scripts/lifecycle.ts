/** Each replaced page gets fresh listeners; navigation releases the old page. */
export function onPage(
  init: (signal: AbortSignal, cleanup: (fn: () => void) => void) => void,
) {
  let controller: AbortController | undefined;
  let disposers: (() => void)[] = [];
  const dispose = () => {
    controller?.abort();
    for (const fn of disposers) fn();
    disposers = [];
  };
  document.addEventListener("astro:before-swap", dispose);
  document.addEventListener("astro:page-load", () => {
    dispose();
    controller = new AbortController();
    init(controller.signal, (fn) => disposers.push(fn));
  });
}
