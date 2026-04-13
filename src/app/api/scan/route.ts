import { startScan, isScanRunning, getScanState, getProgressSince } from '@/lib/scan/scan-manager';

export const dynamic = 'force-dynamic';

// POST /api/scan — start a scan (fire-and-forget)
export async function POST() {
  if (isScanRunning()) {
    return Response.json(
      { running: true, state: getScanState() },
      { status: 409 },
    );
  }

  startScan();

  return Response.json({ started: true }, { status: 202 });
}

// GET /api/scan — SSE stream that observes scan progress
export async function GET() {
  const encoder = new TextEncoder();
  let cursor = 0;
  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      function send(event: string, data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      // If no scan is running, send idle and close immediately
      if (!isScanRunning()) {
        send('idle', { running: false });
        controller.close();
        return;
      }

      // Poll for new events every 300ms
      interval = setInterval(() => {
        try {
          const { events, cursor: newCursor } = getProgressSince(cursor);
          cursor = newCursor;

          for (const ev of events) {
            send(ev.event, ev.data);
          }

          // If scan finished and we've sent all events, close the stream
          if (!isScanRunning() && cursor >= getScanState().progress.length) {
            clearInterval(interval!);
            interval = null;
            controller.close();
          }
        } catch {
          if (interval) clearInterval(interval);
          interval = null;
          controller.close();
        }
      }, 300);
    },

    cancel() {
      // Client disconnected — scan keeps running, just stop this observer
      if (interval) clearInterval(interval);
      interval = null;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
