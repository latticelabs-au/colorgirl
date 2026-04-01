import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities/index.js";
import { TASK_QUEUE } from "./client.js";

export async function runWorker(address?: string): Promise<void> {
  const connection = await NativeConnection.connect({
    address: address ?? "localhost:7233",
  });

  const worker = await Worker.create({
    workflowsPath: new URL("./workflows/scrape-workflow.js", import.meta.url)
      .pathname,
    activities,
    taskQueue: TASK_QUEUE,
    connection,
  });
  await worker.run();
}

// Run directly if this module is the entry point
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("worker.js") ||
    process.argv[1].endsWith("worker.ts"));

if (isMain) {
  runWorker().catch(console.error);
}
