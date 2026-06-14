import { Router } from 'express';
import { z } from 'zod';
import { getStackAnalysis } from '@/modules/stack/stack.service';
import { createRouteHandler, getUserIdFromRequest, sendFailure, sendSuccess } from '@/utils/http';

const stackAnalysisQuerySchema = z.object({
  months: z.enum(['6', '12', '24']).optional()
});

export const stackRouter = Router();

stackRouter.get(
  '/stack-analysis',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);
    const query = stackAnalysisQuerySchema.parse(request.query);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    sendSuccess(
      response,
      getStackAnalysis(userId, query.months ? (Number(query.months) as 6 | 12 | 24) : 12)
    );
  })
);
