# Testing Hooks Locally and Common Failure Modes

## Local Dummy Server Patterns

### netcat approach

```bash
while true; do
  echo -e "HTTP/1.1 200 OK

"
done | nc -l 4820
```

### Node.js approach (recommended)

```js
require('http').createServer((req, res) => {
  let data = '';
  req.on('data', c => data += c);
  req.on('end', () => {
    console.log(req.method, req.url, data);
    res.end('{"ok":true}');
  });
}).listen(4820);
```

1. Add hook pointing to `http://localhost:4820/test`
2. Start Claude Code session, let it end
3. See POST in server log

## Common Failures

### Hook doesn't fire
- Check `.claude/settings.json` syntax (JSON errors silent-fail)
- Check `jq '.hooks' .claude/settings.json` parses
- Restart Claude Code session after editing settings.json

### Hook fires but Orch doesn't receive
- Curl error -- run the command manually in shell, see error
- Token wrong -- 401 response
- Project ID wrong -- 403/404
- Port wrong or daemon not running -- connection refused

### SessionEnd payload empty
- Claude Code may not always populate `$CLAUDE_SESSION_ID` at SessionEnd
- Capture at SessionStart and persist via a temp file if needed

### Hooks block Claude Code
- Missing `&` on async hooks -> Claude waits for curl to complete
- Remove `--max-time` for truly async hooks
- Sync hooks (SessionEnd): keep server response < 500ms

## Manual Hook Testing

Run the hook command directly from shell to diagnose:

```bash
# Set test values
export CLAUDE_SESSION_ID="test-session-123"
export ORCH_TOKEN="your-token-here"

# Run the hook command manually
curl -sS -X POST http://localhost:3737/projects/myproject/hooks/session-start   -H "Authorization: Bearer $ORCH_TOKEN"   -H "Content-Type: application/json"   -d '{"session_id":"test-session-123","ts":"2026-01-01T00:00:00Z"}'
```

## Verifying Hook Registration

```bash
# Check hooks are present in settings
jq '.hooks | keys' .claude/settings.json

# Verify hook count per type
jq '.hooks.SessionStart | length' .claude/settings.json
```
