export type ReaderProgressWrite = Readonly<{
  pageIndex: number;
}>;

export type ReaderProgressWriteQueue = Readonly<{
  enqueue: (pageIndex: number) => void;
  whenIdle: () => Promise<void>;
}>;

type ReaderProgressSender = (write: ReaderProgressWrite) => Promise<boolean>;

/**
 * Keep one progress write in flight and collapse queued writes to the newest page.
 * This preserves client write order even when the final lifecycle flush occurs
 * while an earlier request is still pending.
 */
export function createReaderProgressWriteQueue(
  send: ReaderProgressSender,
): ReaderProgressWriteQueue {
  let pendingPage: number | null = null;
  let lastCompletedPage: number | null = null;
  let draining: Promise<void> | null = null;

  const drain = async () => {
    while (pendingPage != null) {
      const pageIndex = pendingPage;
      pendingPage = null;
      if (pageIndex === lastCompletedPage) continue;

      let completed = false;
      try {
        completed = await send({ pageIndex });
      } catch {
        completed = false;
      }
      if (completed) lastCompletedPage = pageIndex;
    }
  };

  const startDrain = () => {
    if (draining) return;
    draining = drain().finally(() => {
      draining = null;
      if (pendingPage != null) startDrain();
    });
  };

  return {
    enqueue(pageIndex) {
      if (!Number.isInteger(pageIndex) || pageIndex < 0) return;
      if (pendingPage == null && draining == null && pageIndex === lastCompletedPage) return;
      pendingPage = pageIndex;
      startDrain();
    },
    whenIdle() {
      return draining ?? Promise.resolve();
    },
  };
}
