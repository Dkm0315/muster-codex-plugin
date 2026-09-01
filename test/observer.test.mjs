import assert from "node:assert/strict";
import test from "node:test";
import { createTaskObserver } from "../companion/observer.mjs";

test("baselines old edits and commands, then exposes only newly observed work", () => {
  const observe = createTaskObserver();
  const initial = observe("thread-1", [{ path: "old.ts", signature: "1:10" }], [{ id: "old-command", status: "complete" }]);
  assert.equal(initial.latestObservedPath, null);
  assert.equal(initial.visibleActivity.size, 0);

  const unchanged = observe("thread-1", [{ path: "old.ts", signature: "1:10" }], [{ id: "old-command", status: "complete" }]);
  assert.equal(unchanged.latestObservedPath, null);
  assert.equal(unchanged.visibleActivity.size, 0);

  const live = observe("thread-1", [{ path: "old.ts", signature: "2:11" }], [
    { id: "old-command", status: "complete" },
    { id: "new-command", status: "running" },
  ]);
  assert.equal(live.latestObservedPath, "old.ts");
  assert.deepEqual([...live.visibleActivity.keys()], ["new-command"]);
});
