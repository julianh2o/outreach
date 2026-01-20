import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import apiRouter from './index';

describe('API Router', () => {
  const app = express();
  app.use('/api', apiRouter);

  it('returns 404 for undefined routes', async () => {
    const response = await request(app).get('/api/undefined-route');
    expect(response.status).toBe(404);
  });
});
