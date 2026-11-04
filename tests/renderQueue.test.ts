import { describe, expect, it } from "vitest";
import { createRenderQueue, nearestTask } from "../src/lib/renderQueue";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("nearestTask", () => {
  it("picks the task closest to the focus, the earliest on a tie", () => {
    const waiting = new Map([
      ["a", 0],
      ["b", 9],
      ["c", 11],
      ["d", 4],
    ]);
    expect(nearestTask(waiting, 10)).toBe("b");
    expect(nearestTask(waiting, 3)).toBe("d");
    expect(nearestTask(new Map(), 3)).toBeNull();
  });
});

describe("createRenderQueue", () => {
  it("runs one task at a time, nearest to the focus first, even when queued top-down", async () => {
    const order: number[] = [];
    let focus = 5;
    const queue = createRenderQueue(() => focus);
    for (const index of [0, 1, 2, 3, 4, 5, 6, 7]) {
      queue(index, async () => {
        order.push(index);
        await settle();
      });
    }
    focus = 1;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(order).toEqual([1, 0, 2, 3, 4, 5, 6, 7]);
  });

  it("reads the focus again before each task", async () => {
    const order: number[] = [];
    let focus = 0;
    const queue = createRenderQueue(() => focus);
    for (const index of [0, 1, 8, 9]) {
      queue(index, async () => {
        order.push(index);
        focus = 9;
        await settle();
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(order).toEqual([0, 9, 8, 1]);
  });

  it("skips removed tasks and keeps going after a failure", async () => {
    const order: number[] = [];
    const queue = createRenderQueue(() => 0);
    queue(0, async () => {
      order.push(0);
      throw new Error("render failed");
    });
    const remove = queue(1, async () => {
      order.push(1);
    });
    queue(2, async () => {
      order.push(2);
    });
    remove();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual([0, 2]);
  });
});
