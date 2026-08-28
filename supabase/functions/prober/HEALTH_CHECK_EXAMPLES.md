# Example health-check endpoints

Part of Phase 11 — Extensibility & Open-Source Readiness (PRD §5.10, issue `#67`). Minimal,
copy-pasteable health-check endpoints for common stacks — each one satisfies
[`HEALTH_CHECK_CONTRACT.md`](./HEALTH_CHECK_CONTRACT.md) as-is: a fast `200 OK` response with a
JSON body shaped to demonstrate Phase 9's `expected_json_path`/`expected_json_value` assertion
(`$.status` → `"ok"`), so you can see exactly what to pair with which project settings.

(Co-located with the code/contract it accompanies, not under `docs/` — same reasoning as
[`HEALTH_CHECK_CONTRACT.md`](./HEALTH_CHECK_CONTRACT.md)'s own top comment: this is public
integration documentation, not internal planning material.)

Every snippet below was actually run and verified with `curl` before being written down here —
none of this is pseudocode. Each returns:

```
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok"}
```

Paired with these project settings, every one of them classifies as `up`:

| Field | Value |
| --- | --- |
| `check_type` | `http` |
| `method` | `GET` |
| `expected_status` | `200` |
| `expected_json_path` | `$.status` |
| `expected_json_value` | `ok` |

## Express

```js
// server.js
const express = require("express");

const app = express();

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Health check endpoint listening on http://localhost:${port}/health`);
});
```

Run it:

```bash
npm install express
node server.js
curl -i http://localhost:3000/health
```

## FastAPI

```python
# main.py
from fastapi import FastAPI

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}
```

Run it:

```bash
pip install fastapi uvicorn
uvicorn main:app --port 8000
curl -i http://localhost:8000/health
```

## Next.js (App Router route handler)

```ts
// app/api/health/route.ts
export async function GET() {
  return Response.json({ status: "ok" });
}
```

Run it as part of your app's own dev server (no extra setup — this is a normal route handler):

```bash
npm run dev
curl -i http://localhost:3000/api/health
```

## Registering the endpoint with Upkeep

Once one of the above is live and reachable from Upkeep's prober, add it as a project (dashboard
"Add project", or `POST /api/projects/register` — see the root [README](../../../README.md)) with
`health_url` pointing at its `/health` path and `check_type` set to `http` (the default). If you
want to exercise the JSON assertion instead of relying on status code alone, set
`expected_json_path` to `$.status` and `expected_json_value` to `ok` — see
[`HEALTH_CHECK_CONTRACT.md`](./HEALTH_CHECK_CONTRACT.md#json-path-value-assertion-expected_json_path--expected_json_value)
for the full assertion syntax, and its own
["Configuring these fields today"](./HEALTH_CHECK_CONTRACT.md#configuring-these-fields-today)
section for how to set it before a dedicated UI exists.
