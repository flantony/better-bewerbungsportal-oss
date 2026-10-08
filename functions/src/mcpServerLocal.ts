import { initDevApp } from "./lib/devApp";
import { mcpApp } from "./mcp/server";

initDevApp();

const port = Number(process.env.PORT ?? 8090);
mcpApp.listen(port, () => {
  console.log(`MCP dev server listening on http://localhost:${port}/mcp`);
});
