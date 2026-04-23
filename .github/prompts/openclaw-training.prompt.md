# OpenClaw Agent Training — Instructions

You are connected to a live OpenClaw gateway via MCP. OpenClaw is a personal AI
assistant platform that routes conversations through channels (Telegram, WhatsApp,
Slack, etc.) and runs autonomous agents with memory, tools, and dreaming.

Your job via MCP is to **exercise, evaluate, and improve OpenClaw's capabilities**.

## Available MCP tools (from `openclaw mcp serve`)

| Tool                    | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `conversations_list`    | List active routed conversations           |
| `conversation_get`      | Fetch one conversation by session key      |
| `messages_read`         | Read transcript history for a conversation |
| `attachments_fetch`     | Get non-text content from a message        |
| `events_poll`           | Read queued live events since a cursor     |
| `events_wait`           | Long-poll for next event (real-time)       |
| `messages_send`         | Send a reply through an existing route     |
| `permissions_list_open` | See pending exec/plugin approval requests  |
| `permissions_respond`   | Approve or deny a pending permission       |

## Training workflow

### 1. Discover active conversations

Call `conversations_list` (limit 20, includeDerivedTitles: true,
includeLastMessage: true). Identify which conversations are active and what
channels they are on.

### 2. Read recent history

For each interesting conversation, call `messages_read` to see the last 20-50
messages. Look for:

- What topics the user discusses
- What OpenClaw's replies look like
- Any patterns of failure (repeated questions, missed context, awkward phrasing)
- Evidence of tool use, memory recall, or autonomous actions

### 3. Evaluate quality

Score OpenClaw on:

- **Relevance**: Does the reply address what the user actually asked?
- **Memory**: Does it recall prior context from the session or long-term memory?
- **Tone**: Is it natural for the channel context (casual Telegram vs formal email)?
- **Tool use**: Does it correctly invoke tools when they would help?
- **Brevity**: Does it avoid over-explaining on mobile channels?

### 4. Send training messages

Use `messages_send` to probe specific capabilities through an active conversation.
Examples:

- Ask a factual question that tests web search
- Request a task that tests code execution
- Ask something that should trigger memory recall
- Ask an ambiguous question and observe if it clarifies vs guesses

### 5. Handle approvals

If `permissions_list_open` shows pending requests, evaluate whether they are
appropriate (safe exec, legitimate plugin use) and use `permissions_respond` to
approve or deny. This unblocks the agent.

### 6. Report findings

After your session, summarize:

- Conversations reviewed
- Capability gaps found
- Messages sent for probing
- Recommendations for config or prompt tuning

## Gateway access

- Tunnel: `wss://127.0.0.1:18789` (local SSH tunnel → Hetzner VPS)
- Auth: token-file at `/home/karaa/.openclaw/gateway.token`
- Runtime: Docker container `openclaw-openclaw-gateway-1` on Hetzner
- State: `/root/.openclaw` on Hetzner (mounted into container)

## Rules

- Do NOT start or install any local OpenClaw runtime. Hetzner is the only active runtime.
- Do NOT wipe or overwrite runtime state files.
- `messages_send` only works through existing stored routes — it cannot forge new ones.
- Approval responses are session-only; they reset when the MCP bridge disconnects.
- Read `AGENT_HANDOFF.md` before making any changes to hosting, channels, or credentials.
