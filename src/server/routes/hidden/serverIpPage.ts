import type { FastifyInstance } from 'fastify';
import {
  buildHiddenServerIpPageResponse,
  getHiddenServerIpPagePath,
  getHiddenServerIpPageRoutePattern,
  matchesHiddenServerIpRouteToken,
} from '../../services/serverIpPage.js';

export { getHiddenServerIpPagePath } from '../../services/serverIpPage.js';

export async function hiddenServerIpPageRoutes(app: FastifyInstance) {
  const hiddenPath = getHiddenServerIpPagePath();
  if (!hiddenPath) return;

  app.get<{ Params: { '*': string } }>(getHiddenServerIpPageRoutePattern(), async (request, reply) => {
    if (!matchesHiddenServerIpRouteToken(request.params['*'] || '')) {
      return reply.code(404).send({ error: 'Not found' });
    }

    const response = await buildHiddenServerIpPageResponse();
    reply.code(response.statusCode);
    reply.type('text/html; charset=utf-8');
    reply.header('Cache-Control', 'no-store');
    return response.html;
  });
}
