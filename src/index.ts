#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    console.error(
      "APIFY_TOKEN is not set. Get a free token at https://console.apify.com/settings/integrations " +
        "and pass it via the APIFY_TOKEN environment variable.",
    );
    process.exit(1);
  }

  const server = createServer({ token });
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
