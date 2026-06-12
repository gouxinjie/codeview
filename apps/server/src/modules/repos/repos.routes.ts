import { Router } from 'express';
import { z } from 'zod';
import { createRouteHandler, getUserIdFromRequest, sendFailure, sendSuccess } from '@/utils/http';
import {
  getRepositories,
  getRepositoryActivity,
  getRepositoryDetail,
  getRepositoryHeatmap,
  getRepositoryRecentCommits,
  getRepositoryStack,
  getRepositoryTraffic
} from '@/modules/repos/repos.service';

const activityQuerySchema = z.object({
  granularity: z.enum(['day', 'week', 'month']).default('day')
});

export const reposRouter = Router();

reposRouter.get(
  '/repos',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    const search = typeof request.query.search === 'string' ? request.query.search : undefined;
    const language = typeof request.query.language === 'string' ? request.query.language : undefined;
    const stackTag = typeof request.query.stackTag === 'string' ? request.query.stackTag : undefined;
    const sortBy =
      typeof request.query.sortBy === 'string' && request.query.sortBy === 'updated'
        ? 'updated'
        : 'activity';

    sendSuccess(
      response,
      getRepositories({
        userId,
        search,
        language,
        stackTag,
        sortBy
      })
    );
  })
);

reposRouter.get(
  '/repos/:id',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);
    const repoId = Number(request.params.id);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    if (!Number.isInteger(repoId) || repoId <= 0) {
      sendFailure(response, 400, 'INVALID_REPO_ID', '仓库 ID 不合法');
      return;
    }

    sendSuccess(response, getRepositoryDetail(userId, repoId));
  })
);

reposRouter.get(
  '/repos/:id/activity',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);
    const repoId = Number(request.params.id);
    const query = activityQuerySchema.parse(request.query);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    if (!Number.isInteger(repoId) || repoId <= 0) {
      sendFailure(response, 400, 'INVALID_REPO_ID', '仓库 ID 不合法');
      return;
    }

    sendSuccess(response, getRepositoryActivity(userId, repoId, query.granularity));
  })
);

reposRouter.get(
  '/repos/:id/heatmap',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);
    const repoId = Number(request.params.id);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    if (!Number.isInteger(repoId) || repoId <= 0) {
      sendFailure(response, 400, 'INVALID_REPO_ID', '仓库 ID 不合法');
      return;
    }

    sendSuccess(response, getRepositoryHeatmap(userId, repoId));
  })
);

reposRouter.get(
  '/repos/:id/commits/recent',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);
    const repoId = Number(request.params.id);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    if (!Number.isInteger(repoId) || repoId <= 0) {
      sendFailure(response, 400, 'INVALID_REPO_ID', '仓库 ID 不合法');
      return;
    }

    sendSuccess(response, getRepositoryRecentCommits(userId, repoId));
  })
);

reposRouter.get(
  '/repos/:id/stack',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);
    const repoId = Number(request.params.id);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    if (!Number.isInteger(repoId) || repoId <= 0) {
      sendFailure(response, 400, 'INVALID_REPO_ID', '仓库 ID 不合法');
      return;
    }

    sendSuccess(response, getRepositoryStack(userId, repoId));
  })
);

reposRouter.get(
  '/repos/:id/traffic',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);
    const repoId = Number(request.params.id);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    if (!Number.isInteger(repoId) || repoId <= 0) {
      sendFailure(response, 400, 'INVALID_REPO_ID', '仓库 ID 不合法');
      return;
    }

    sendSuccess(response, getRepositoryTraffic(userId, repoId));
  })
);
