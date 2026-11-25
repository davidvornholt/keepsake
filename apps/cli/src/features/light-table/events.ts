/** How often a page that is open is told what changed, in milliseconds. */
const pollEvery = 1000;
/** Every so many times it is told something in any case. */
const pingEvery = 15;

const toBytes = (text: string) => new TextEncoder().encode(text);

/** Tells a page what changes, as server-sent events, until it is closed. */
export const eventsOf = (
  changed: () => Promise<unknown>,
  signal: AbortSignal,
): Response => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let before = '';
      let quiet = 0;
      const tell = async () => {
        const now = await changed().then(JSON.stringify, () => before);
        if (signal.aborted) {
          return;
        }
        quiet += 1;
        if (now !== before) {
          before = now;
          quiet = 0;
          controller.enqueue(toBytes(`event: changed\ndata: ${now}\n\n`));
        } else if (quiet % pingEvery === 0) {
          controller.enqueue(toBytes(': still here\n\n'));
        }
        timer = setTimeout(tell, pollEvery);
      };
      return tell();
    },
    cancel() {
      clearTimeout(timer);
    },
  });
  signal.addEventListener('abort', () => clearTimeout(timer));
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      // A proxy passes everything on right away.
      'x-accel-buffering': 'no',
    },
  });
};
