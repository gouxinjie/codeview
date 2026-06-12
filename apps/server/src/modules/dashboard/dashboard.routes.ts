import { Router } from 'express';
import { z } from 'zod';
import { createRouteHandler, getUserIdFromRequest, sendFailure, sendSuccess } from '../../utils/http';
import { getActiveRankings, getInsights, getOverview, getPersonalHeatmap, getStatistics } from './dashboard.service';

export const dashboardRouter = Router();

const statisticsQuerySchema = z.object({
  rangeDays: z.enum(['7', '30', '90']).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

dashboardRouter.get(
  '/overview',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    sendSuccess(response, getOverview(userId));
  })
);

dashboardRouter.get(
  '/heatmap/personal',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    sendSuccess(response, getPersonalHeatmap(userId));
  })
);

dashboardRouter.get(
  '/rankings/active-repos',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    sendSuccess(response, getActiveRankings(userId));
  })
);

dashboardRouter.get(
  '/statistics',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);
    const query = statisticsQuerySchema.parse(request.query);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    sendSuccess(
      response,
      getStatistics(userId, {
        rangeDays: query.rangeDays ? Number(query.rangeDays) as 7 | 30 | 90 : undefined,
        startDate: query.startDate,
        endDate: query.endDate
      })
    );
  })
);

dashboardRouter.get(
  '/insights',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    sendSuccess(response, getInsights(userId));
  })
);
