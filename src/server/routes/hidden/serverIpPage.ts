import type { FastifyInstance } from 'fastify';
import {
  buildHiddenServerIpPageResponse,
  getHiddenServerIpPagePath,
} from '../../services/serverIpPage.js';

export { getHiddenServerIpPagePath } from '../../services/serverIpPage.js';

export async function hiddenServerIpPageRoutes(app: FastifyInstance) {
  const hiddenPath = getHiddenServerIpPagePath();
  if (!hiddenPath) return;

  app.get(hiddenPath, async (_request, reply) => {
    const response = await buildHiddenServerIpPageResponse();
    reply.code(response.statusCode);
    reply.type('text/html; charset=utf-8');
    reply.header('Cache-Control', 'no-store');
    return response.html;
  });
}
