 bun run --cwd packages/opencode src/index.ts web --port 4096


bun run dev:web
bun run --cwd packages/app build
bun run --cwd packages/desktop tauri build

git config http.postBuffer 524288000; git config http.version HTTP/1.1; git push -u origin main

bun run --cwd packages/opencode build --single


















cloudflared tunnel --url http://localhost:3000




