import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerCkanTools } from './mcp/tools';
import { serverInfo } from './config';

async function bootstrap() {
  const server = new McpServer(serverInfo, {
    instructions:
      'İBB acik verileri icin metadata odakli dataset kesfi, resource capability analizi ve sehir servisi araclari saglar.',
    capabilities: {
      tools: {},
    },
  });

  registerCkanTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGINT', async () => {
    await transport.close();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('[bootstrap] MCP sunucusu başlatılamadı:', err);
  process.exit(1);
});
