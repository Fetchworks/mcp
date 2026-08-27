import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server.js";

const TOKEN = "test-token";

const okItem = {
  videoId: "jNQXAC9IVRw",
  url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  status: "ok",
  language: "en",
  text: "All right, so here we are",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
let client: Client;

beforeEach(async () => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const server = createServer({ token: TOKEN, pollIntervalMs: 1 });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterEach(async () => {
  await client.close();
  vi.unstubAllGlobals();
});

function firstText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as { type: string; text: string }[];
  return content[0]!.text;
}

describe("tool registration", () => {
  it("exposes the three transcript tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_channel_transcripts",
      "get_youtube_transcript",
      "search_youtube_transcripts",
    ]);
  });
});

describe("get_youtube_transcript", () => {
  it("calls the sync endpoint and returns the items as JSON text", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([okItem]));

    const result = await client.callTool({
      name: "get_youtube_transcript",
      arguments: { videos: ["jNQXAC9IVRw"], languages: ["en", "de"] },
    });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(firstText(result))).toEqual([okItem]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `https://api.apify.com/v2/acts/fetchworks~youtube-transcript-scraper/run-sync-get-dataset-items?token=${TOKEN}&clean=true`,
    );
    expect(JSON.parse(init.body)).toEqual({
      videoUrls: ["jNQXAC9IVRw"],
      languages: ["en", "de"],
      outputFormats: ["text"],
    });
  });

  it("returns isError with the API message on HTTP failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "bad token" } }, 401));

    const result = await client.callTool({
      name: "get_youtube_transcript",
      arguments: { videos: ["jNQXAC9IVRw"] },
    });

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("bad token");
  });
});

describe("get_channel_transcripts", () => {
  it("defaults to 10 videos and stays on the sync endpoint", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([okItem]));

    const result = await client.callTool({
      name: "get_channel_transcripts",
      arguments: { channel: "@3blue1brown" },
    });

    expect(result.isError).toBeFalsy();
    expect(String(fetchMock.mock.calls[0]![0])).toContain("run-sync-get-dataset-items");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      channelUrls: ["@3blue1brown"],
      maxVideosPerChannel: 10,
      outputFormats: ["text"],
    });
  });

  it("switches to async run + poll when maxVideos is large", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { id: "run-1", status: "READY", defaultDatasetId: "ds-1" } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: "run-1", status: "SUCCEEDED", defaultDatasetId: "ds-1" } }))
      .mockResolvedValueOnce(jsonResponse([okItem]));

    const result = await client.callTool({
      name: "get_channel_transcripts",
      arguments: { channel: "@3blue1brown", maxVideos: 100 },
    });

    expect(result.isError).toBeFalsy();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain("/v2/acts/fetchworks~youtube-transcript-scraper/runs?");
    expect(urls[2]).toContain("/v2/datasets/ds-1/items?");
    expect(JSON.parse(firstText(result))).toEqual([okItem]);
  });
});

describe("search_youtube_transcripts", () => {
  it("defaults to 5 results with the requested output formats", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([okItem]));

    const result = await client.callTool({
      name: "search_youtube_transcripts",
      arguments: { query: "neural networks explained", outputFormats: ["segments", "text"] },
    });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      searchQueries: ["neural networks explained"],
      maxSearchResults: 5,
      outputFormats: ["segments", "text"],
    });
  });
});
