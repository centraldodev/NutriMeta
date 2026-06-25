if (typeof globalThis.DOMException === 'undefined') {
  class ReactNativeDOMException extends Error {
    constructor(message = '', name = 'Error') {
      super(message);
      this.name = name;
    }
  }
  globalThis.DOMException = ReactNativeDOMException as unknown as typeof DOMException;
}

if (typeof globalThis.AbortSignal !== 'undefined' && typeof globalThis.AbortSignal.any !== 'function') {
  globalThis.AbortSignal.any = ((signals: AbortSignal[]) => {
    const controller = new AbortController();
    const abort = (signal: AbortSignal) => {
      if (!controller.signal.aborted) {
        controller.abort(signal.reason);
      }
    };

    signals.forEach((signal) => {
      if (signal.aborted) {
        abort(signal);
        return;
      }
      signal.addEventListener('abort', () => abort(signal), { once: true });
    });

    return controller.signal;
  }) as typeof AbortSignal.any;
}
