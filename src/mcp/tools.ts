import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCatalogTools } from './tools/catalog';
import { registerResourceTools } from './tools/resource';
import { registerAnalysisTools } from './tools/analysis';
import { registerDomainTools } from './tools/domain';

export function registerCkanTools(server: McpServer) {
  registerCatalogTools(server);
  registerResourceTools(server);
  registerAnalysisTools(server);
  registerDomainTools(server);
}
