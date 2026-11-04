export type RenderTask = () => Promise<void>;
export type RenderQueue = (index: number, task: RenderTask) => () => void;

export function createRenderQueue(focus: () => number): RenderQueue {
  const waiting = new Map<RenderTask, number>();
  let running = false;
  let scheduled = false;

  const runNext = () => {
    scheduled = false;
    const task = running ? null : nearestTask(waiting, focus());
    if (!task) {
      return;
    }
    waiting.delete(task);
    running = true;
    task()
      .catch(() => {})
      .finally(() => {
        running = false;
        runNext();
      });
  };

  return (index, task) => {
    waiting.set(task, index);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(runNext);
    }
    return () => {
      waiting.delete(task);
    };
  };
}

export function nearestTask<T>(waiting: Map<T, number>, focus: number) {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const [task, index] of waiting) {
    const distance = Math.abs(index - focus);
    if (distance < bestDistance) {
      best = task;
      bestDistance = distance;
    }
  }
  return best;
}
