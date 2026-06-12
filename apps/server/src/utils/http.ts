import type { Request, RequestHandler, Response } from 'express';

export interface ApiSuccess<T> {
  success: true;
  code: 200;
  message: '操作成功';
  data: T;
}

export interface ApiFailure {
  success: false;
  code: string;
  message: string;
  data: null;
}

/* 统一成功响应格式。 */
export function sendSuccess<T>(response: Response, data: T): Response<ApiSuccess<T>> {
  return response.json({
    success: true,
    code: 200,
    message: '操作成功',
    data
  });
}

/* 统一失败响应格式。 */
export function sendFailure(
  response: Response,
  statusCode: number,
  code: string,
  message: string
): Response<ApiFailure> {
  return response.status(statusCode).json({
    success: false,
    code,
    message,
    data: null
  });
}

/* 统一读取请求中的 userId，满足所有接口必须携带 userId 的约束。 */
export function getUserIdFromRequest(request: Request): string | null {
  const queryUserId = typeof request.query.userId === 'string' ? request.query.userId : null;
  const bodyUserId =
    typeof request.body === 'object' &&
    request.body !== null &&
    'userId' in request.body &&
    typeof request.body.userId === 'string'
      ? request.body.userId
      : null;

  return queryUserId ?? bodyUserId;
}

/* 包装异步路由，统一进入 Express 错误中间件。 */
export function createRouteHandler(
  handler: (request: Request, response: Response) => Promise<void> | void
): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response)).catch(next);
  };
}

