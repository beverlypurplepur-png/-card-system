import 'reflect-metadata';

import type { INestApplication } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';

// Isolate the new HTTP controller from AFFiNE's production service bootstrap.
vi.mock('../../backend/server/src/core/auth', async () => {
  const { createParamDecorator } = await import('@nestjs/common');
  return {
    CurrentUser: createParamDecorator(
      (_data, context) => context.switchToHttp().getRequest().user
    ),
  };
});
vi.mock('../../backend/server/src/core/permission', async () => {
  const { Module } = await import('@nestjs/common');
  class PermissionModule {}
  Module({})(PermissionModule);
  return { PermissionAccess: class PermissionAccess {}, PermissionModule };
});

import { CardSystemController } from '../../backend/server/src/core/card-system';
import { PermissionAccess } from '../../backend/server/src/core/permission';
import { CardRegistry } from '../src/card-registry';
import { createCardClient } from '../src/client';
import { database } from './database';

let app: INestApplication;
let local: Awaited<ReturnType<typeof database>>;
const assertPermission = vi.fn();
const docPermission = vi.fn(() => ({ assert: assertPermission }));
const permissions = { user: vi.fn(() => ({ doc: docPermission })) };
const ref = {
  workspace_id: 'workspace',
  document_id: 'document',
  frame_id: 'frame',
};

beforeAll(async () => {
  local = await database();
  // Vitest's esbuild does not emit TypeScript decorator metadata.
  Reflect.defineMetadata(
    'design:paramtypes',
    [CardRegistry, PermissionAccess],
    CardSystemController
  );
  const module = await Test.createTestingModule({
    controllers: [CardSystemController],
    providers: [
      { provide: CardRegistry, useValue: local.registry },
      { provide: PermissionAccess, useValue: permissions },
    ],
  }).compile();
  app = module.createNestApplication();
  // The real AFFiNE server installs AuthGuard globally. Use a local principal here.
  app.useGlobalGuards({
    canActivate(context) {
      const req = context.switchToHttp().getRequest();
      if (req.headers.authorization !== 'Bearer local-test')
        throw new UnauthorizedException();
      req.user = { id: 'test-user' };
      return true;
    },
  });
  await app.listen(0, '127.0.0.1');
});
beforeEach(async () => {
  await local.db.exec('TRUNCATE card_system.cards');
  vi.stubEnv('CARD_SYSTEM_ENABLED', 'true');
  vi.clearAllMocks();
  assertPermission.mockResolvedValue(undefined);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await app?.close();
  await local?.db.close();
});

const post = (action: string, body: unknown = ref) =>
  request(app.getHttpServer())
    .post(`/api/card-system/cards/${action}`)
    .set('Authorization', 'Bearer local-test')
    .send(body);

test('HTTP register/delete/restore exposes only CardRecord and preserves identity', async () => {
  const created = await post('register').expect(201);
  expect(docPermission).toHaveBeenCalledWith('workspace', 'document');
  expect(assertPermission).toHaveBeenCalledWith('Doc.Update');
  const removed = await post('delete').expect(201);
  expect(removed.body.deleted_at).not.toBeNull();
  const restored = await post('register').expect(201);
  expect(restored.body.card_id).toBe(created.body.card_id);
  expect(restored.body.deleted_at).toBeNull();
  expect(Object.keys(restored.body).sort()).toEqual(
    [
      'card_id',
      'workspace_id',
      'document_id',
      'frame_id',
      'created_at',
      'updated_at',
      'deleted_at',
    ].sort()
  );
});

test('disabled API performs no registry writes', async () => {
  vi.stubEnv('CARD_SYSTEM_ENABLED', '');
  const status = await request(app.getHttpServer())
    .get('/api/card-system/status')
    .set('Authorization', 'Bearer local-test')
    .expect(200);
  expect(status.body).toEqual({ enabled: false });
  await post('register').expect(503);
  expect(assertPermission).not.toHaveBeenCalled();
  expect(
    (await local.db.query('SELECT * FROM card_system.cards')).rows
  ).toHaveLength(0);
});

test('rejects extra content, malformed references and unauthorized writes', async () => {
  await post('register', { ...ref, geometry: '[0,0,1,1]' }).expect(400);
  await post('register', { ...ref, frame_id: '' }).expect(400);
  await post('register', { ...ref, card_id: crypto.randomUUID() }).expect(400);
  await request(app.getHttpServer())
    .post('/api/card-system/cards/register')
    .send(ref)
    .expect(401);
  assertPermission.mockRejectedValue(new ForbiddenException());
  await post('register').expect(403);
  await post('delete').expect(403);
  expect(
    (await local.db.query('SELECT * FROM card_system.cards')).rows
  ).toHaveLength(0);
});

test('browser client sends only reference fields and reports failed requests', async () => {
  const fetch = vi.fn(
    async (_path: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ ...ref, card_id: 'id' }), { status: 200 })
  );
  const client = createCardClient(fetch);
  await client.registerFrame({ ...ref, content: 'never send' } as typeof ref);
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual(ref);
  expect(fetch.mock.calls[0][1]?.credentials).toBe('include');
  fetch.mockResolvedValueOnce(new Response('', { status: 503 }));
  await expect(client.deleteFrame(ref)).rejects.toThrow('503');
  fetch.mockResolvedValueOnce(new Response('', { status: 404 }));
  expect(await client.isEnabled()).toBe(false);
});
