import { Connection, Client } from "@temporalio/client";

export async function createTemporalClient(
  address?: string,
): Promise<Client> {
  const connection = await Connection.connect({
    address: address ?? "localhost:7233",
  });
  return new Client({ connection });
}

export const TASK_QUEUE = "colorgirl";
