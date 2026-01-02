/**
 * Development server for AI Components demo
 */

import index from "./index.html";

const server = Bun.serve({
  port: 3000,
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 AI Components demo running at http://localhost:${server.port}`);
