 bun run --cwd packages/opencode src/index.ts web --port 4096


bun run dev:web
bun run --cwd packages/app build
bun run --cwd packages/desktop tauri build

git config http.postBuffer 524288000; git config http.version HTTP/1.1; git push -u origin main

bun run --cwd packages/opencode build --single
























npx localtunnel --port 3000 --subdomain archon-pro-vedi






The Trigger: A user installs archon-pro and comments on an issue.
The API: Receives the webhook and says "Okay, I need to run the Archon Agent for this repo."
The Dispatcher: Instead of making the user manually add a .yml file, the API will go into their repo and trigger it automatically.