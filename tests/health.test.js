import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';

describe('Health Check Endpoint (GET /api/health)', () => {
  it('should return 200 OK with status, uptime, and a valid ISO timestamp', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200)
      .expect('Content-Type', /application\/json/);

    assert.strictEqual(response.body.status, 'ok');
    assert.strictEqual(typeof response.body.uptime, 'number');
    assert.ok(response.body.uptime >= 0, 'uptime should be a non-negative number');

    // Validate that timestamp is a valid ISO string without hardcoding timestamps
    assert.strictEqual(typeof response.body.timestamp, 'string');
    const parsedDate = new Date(response.body.timestamp);
    assert.ok(!isNaN(parsedDate.getTime()), 'timestamp should be a valid date');
    assert.strictEqual(parsedDate.toISOString(), response.body.timestamp);
  });
});

describe('404 Not Found Handling', () => {
  it('should return 404 with structured JSON for nonexistent routes', async () => {
    const response = await request(app)
      .get('/api/nonexistent-route')
      .expect(404)
      .expect('Content-Type', /application\/json/);

    assert.strictEqual(response.body.error, 'Not Found');
    assert.ok(response.body.message.includes('/api/nonexistent-route'));
  });
});
