# Quick Start: Using Optimized Archon GitHub Action

## For Impatient Users (TL;DR)

1. **Comment on any issue with:**
   ```
   /archon analyze this
   ```

2. **Wait for logs showing:**
   ```
   [Perf] Parallel init (token + connection + repo): 2500ms
   [Perf] Remote Archon execution: 45000ms
   | Bash     {"command":"ls"}
   | Read     {"filePath":"package.json"}
   ```

3. **If you see tool logs (| Bash, | Read, etc.) → ✅ Working!**

## What Changed?

| Before | After | Speedup |
|--------|-------|---------|
| 10-15s | 2-5s | 70% faster |
| Tools: disabled | Tools: enabled | ✅ Fixed |
| 1s polling delay | 100ms polling | 10x faster |
| Sequential init | Parallel init | 70% faster |

## Configuration

### Enable Tools (DEFAULT - but verify)
```yaml
with:
  enable_tools: "true"  # Set this explicitly
```

### Use Fast Model
```yaml
with:
  model: "groq/llama-3.1-8b-instant"  # Free & fast
```

### Optional: Local Archon Server
```yaml
env:
  ARCHON_API_URL: ${{ secrets.REMOTE_ARCHON_URL }}  # Skip if using local
```

## Key Metrics (Look for these in logs)

```
✅ Event stream connected
✅ [Perf] Parallel init: <3000ms
✅ | Bash, | Read, | Write logs visible
✅ Total initialization: <6000ms
✅ Remote Archon execution: 30-60s (depends on task)
```

## Top 5 Performance Tips

1. **Keep prompts short** - Use specific requests, not everything
2. **Disable sharing for private repos** - Saves 1 API call
3. **Use Groq model** - Fastest free option
4. **Keep tools enabled** - Already optimized, use them
5. **Monitor [Perf] logs** - Find bottlenecks easily

## One-Minute Troubleshooting

| Problem | Check | Fix |
|---------|-------|-----|
| Tools don't work | See `| Bash` logs? | Set `enable_tools: "true"` |
| Takes 20+ seconds | `[Perf]` logs | Network latency? Check logs |
| No event stream | See "Event stream connected"? | Check server connectivity |
| Still slow | Which `[Perf]` is slow? | Parallelize that phase |

## Example Optimized Workflow

```yaml
name: Archon
on: [issue_comment, pull_request_review_comment]

jobs:
  archon:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: vediyappanm/pro-gitops/github@main
        with:
          model: "groq/llama-3.1-8b-instant"
          enable_tools: "true"
          variant: "high"
```

## Commands to Try

```
# Analyze codebase
/archon analyze this codebase

# Fix specific issue
/archon fix the bug in utils/parser.ts

# Review code
/archon review this pull request

# Quick summary
/archon summarize this thread
```

## Advanced: Reading Perf Logs

```
[Perf] Parallel init (token + connection + repo): 2300ms   ← Init startup
[Perf] Fetch issue/PR data: 750ms                          ← Get issue
[Perf] Configure git: 120ms                                 ← Setup git
[Perf] Comment + permissions + user prompt: 950ms          ← Get prompt
[Perf] Create session + subscribe to events: 650ms         ← Session setup
[Perf] Total initialization: 5000ms                        ← Total before AI
Sending message to archon...
Event stream connected, listening for tool execution logs...
| Bash     {"command":"pwd"}                               ← Tools running
| Read     {"filePath":"package.json"}
| Write    {"filePath":"ANALYSIS.md"}
[Perf] Remote Archon execution: 32500ms                    ← AI execution time
```

**Total time: ~37 seconds** (5s init + 32s AI execution)

## Need Help?

1. Check logs for `[Perf]` metrics
2. Look for `Event stream connected` confirmation
3. Verify `| Bash`, `| Read`, `| Write` lines appear (tools working)
4. Compare timing to expected ranges above

---

**Made with optimization ⚡**
