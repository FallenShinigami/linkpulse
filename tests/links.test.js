import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { getDatabase, closeDatabase, initDatabase } from '../src/db/database.js';

describe('LinkPulse Core MVP Test Suite', () => {
  before(() => {
    // Ensure database is initialized
    initDatabase();
  });

  after(() => {
    // Clean up
  });

  describe('Link Creation (POST /api/links)', () => {
    it('should create a short URL from a valid HTTPS destination', async () => {
      const res = await request(app)
        .post('/api/links')
        .send({ url: 'https://github.com/FallenShinigami/linkpulse' })
        .expect(201)
        .expect('Content-Type', /application\/json/);

      assert.strictEqual(res.body.originalUrl, 'https://github.com/FallenShinigami/linkpulse');
      assert.strictEqual(typeof res.body.shortCode, 'string');
      assert.ok(res.body.shortCode.length >= 6);
      assert.ok(res.body.shortUrl.includes(res.body.shortCode));
      assert.strictEqual(res.body.clickCount, 0);
      assert.strictEqual(res.body.isActive, true);
    });

    it('should reject invalid or missing URLs with 400 Bad Request', async () => {
      // Missing url
      await request(app)
        .post('/api/links')
        .send({})
        .expect(400);

      // Malformed url
      await request(app)
        .post('/api/links')
        .send({ url: 'not-a-valid-url' })
        .expect(400);

      // Disallowed protocol (javascript:)
      const jsRes = await request(app)
        .post('/api/links')
        .send({ url: 'javascript:alert(1)' })
        .expect(400);

      assert.ok(jsRes.body.message.includes('http:// or https://'));

      // Disallowed protocol (ftp:)
      await request(app)
        .post('/api/links')
        .send({ url: 'ftp://files.example.com' })
        .expect(400);
    });

    it('should support creating links with valid custom aliases', async () => {
      const alias = `my-repo-${Date.now()}`;
      const res = await request(app)
        .post('/api/links')
        .send({
          url: 'https://example.com/target',
          customAlias: alias
        })
        .expect(201);

      assert.strictEqual(res.body.shortCode, alias);
      assert.strictEqual(res.body.customAlias, alias);
    });

    it('should reject duplicate custom aliases with 409 Conflict', async () => {
      const alias = `dup-test-${Date.now()}`;

      // First creation should succeed
      await request(app)
        .post('/api/links')
        .send({ url: 'https://example.com/first', customAlias: alias })
        .expect(201);

      // Second creation with same alias must fail with 409
      const dupRes = await request(app)
        .post('/api/links')
        .send({ url: 'https://example.com/second', customAlias: alias })
        .expect(409);

      assert.ok(dupRes.body.message.includes('already in use'));
    });

    it('should reject reserved system aliases with 400 Bad Request', async () => {
      await request(app)
        .post('/api/links')
        .send({ url: 'https://example.com', customAlias: 'api' })
        .expect(400);

      await request(app)
        .post('/api/links')
        .send({ url: 'https://example.com', customAlias: 'health' })
        .expect(400);

      await request(app)
        .post('/api/links')
        .send({ url: 'https://example.com', customAlias: 'dashboard' })
        .expect(400);
    });

    it('should validate expiration date and click limit inputs', async () => {
      // Past expiry date
      await request(app)
        .post('/api/links')
        .send({
          url: 'https://example.com',
          expiresAt: '2020-01-01T00:00:00.000Z'
        })
        .expect(400);

      // Invalid click limit (zero or negative)
      await request(app)
        .post('/api/links')
        .send({
          url: 'https://example.com',
          clickLimit: 0
        })
        .expect(400);
    });
  });

  describe('Redirection Engine (GET /:shortCode)', () => {
    it('should redirect active links with 302 Found and record clicks', async () => {
      const createRes = await request(app)
        .post('/api/links')
        .send({ url: 'https://example.com/destination-page' })
        .expect(201);

      const { shortCode } = createRes.body;

      // Follow redirect
      const redirectRes = await request(app)
        .get(`/${shortCode}`)
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36')
        .set('Referer', 'https://news.ycombinator.com')
        .expect(302);

      assert.strictEqual(redirectRes.headers.location, 'https://example.com/destination-page');

      // Verify click was tracked
      const analyticsRes = await request(app)
        .get(`/api/links/${shortCode}/analytics`)
        .expect(200);

      assert.strictEqual(analyticsRes.body.summary.totalClicks, 1);
      assert.strictEqual(analyticsRes.body.recentClicks.length, 1);
      assert.strictEqual(analyticsRes.body.recentClicks[0].browser, 'Chrome');
      assert.strictEqual(analyticsRes.body.recentClicks[0].device, 'desktop');
      assert.strictEqual(analyticsRes.body.recentClicks[0].referrer, 'https://news.ycombinator.com');
    });

    it('should return 404 for unknown short codes', async () => {
      await request(app)
        .get('/nonexistent-shortcode-xyz')
        .expect(404);
    });

    it('should prevent redirection and return 403 when a link is disabled', async () => {
      const createRes = await request(app)
        .post('/api/links')
        .send({ url: 'https://example.com/secure' })
        .expect(201);

      const { shortCode } = createRes.body;

      // Disable link
      await request(app)
        .patch(`/api/links/${shortCode}/toggle`)
        .send({ isActive: false })
        .expect(200);

      // Attempt redirect
      const disabledRes = await request(app)
        .get(`/${shortCode}`)
        .expect(403);

      assert.strictEqual(disabledRes.body.reason, 'disabled');
    });

    it('should enforce click limits and block redirection after limit is reached', async () => {
      const createRes = await request(app)
        .post('/api/links')
        .send({
          url: 'https://example.com/limited',
          clickLimit: 2
        })
        .expect(201);

      const { shortCode } = createRes.body;

      // Click 1: Allowed
      await request(app).get(`/${shortCode}`).expect(302);

      // Click 2: Allowed
      await request(app).get(`/${shortCode}`).expect(302);

      // Click 3: Blocked (410 Gone, limit reached)
      const blockedRes = await request(app).get(`/${shortCode}`).expect(410);
      assert.strictEqual(blockedRes.body.reason, 'limit_reached');

      // Analytics should still be intact and accurate
      const analyticsRes = await request(app)
        .get(`/api/links/${shortCode}/analytics`)
        .expect(200);

      assert.strictEqual(analyticsRes.body.summary.totalClicks, 2);
    });

    it('should safely enforce click limits under simultaneous concurrent requests', async () => {
      const createRes = await request(app)
        .post('/api/links')
        .send({
          url: 'https://example.com/concurrent-test',
          clickLimit: 3
        })
        .expect(201);

      const { shortCode } = createRes.body;

      // Fire 10 simultaneous requests
      const promises = Array.from({ length: 10 }, () => request(app).get(`/${shortCode}`));
      const responses = await Promise.all(promises);

      const allowedRedirects = responses.filter(r => r.status === 302);
      const blockedRequests = responses.filter(r => r.status === 410);

      assert.strictEqual(allowedRedirects.length, 3, 'Exactly 3 requests should be allowed');
      assert.strictEqual(blockedRequests.length, 7, 'Remaining 7 requests should be blocked with 410');

      const analyticsRes = await request(app).get(`/api/links/${shortCode}/analytics`).expect(200);
      assert.strictEqual(analyticsRes.body.summary.totalClicks, 3, 'Total recorded clicks must not exceed 3');
      assert.strictEqual(analyticsRes.body.recentClicks.length, 3, 'Recorded events must match the click cap');
    });

    it('should block redirection when a link has expired', async () => {
      const db = getDatabase();
      const code = `exp-${Date.now()}`;

      // Insert link with past expiry date
      const pastDate = new Date(Date.now() - 60000).toISOString();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO links (short_code, original_url, is_active, expires_at, click_count, created_at, updated_at)
        VALUES (?, ?, 1, ?, 0, ?, ?)
      `).run(code, 'https://example.com/expired-target', pastDate, now, now);

      // Attempt redirect
      const expiredRes = await request(app)
        .get(`/${code}`)
        .expect(410);

      assert.strictEqual(expiredRes.body.reason, 'expired');
    });

    it('should increment click count across multiple redirects and reflect in db, analytics, and link list', async () => {
      const createRes = await request(app)
        .post('/api/links')
        .send({ url: 'https://example.com/multi-redirect-target' })
        .expect(201);

      const { shortCode } = createRes.body;
      assert.strictEqual(createRes.body.clickCount, 0);

      // Perform 3 redirects
      for (let i = 0; i < 3; i++) {
        const redRes = await request(app)
          .get(`/${shortCode}`)
          .expect(302);
        assert.strictEqual(redRes.headers.location, 'https://example.com/multi-redirect-target');
        assert.strictEqual(redRes.headers['cache-control'], 'no-cache, no-store, must-revalidate');
      }

      // 1. Verify database count
      const db = getDatabase();
      const dbRow = db.prepare('SELECT * FROM links WHERE short_code = ?').get(shortCode);
      assert.strictEqual(dbRow.click_count, 3, 'Database click_count must be 3');

      const clickRows = db.prepare('SELECT * FROM clicks WHERE short_code = ?').all(shortCode);
      assert.strictEqual(clickRows.length, 3, 'Database clicks table must have 3 records');

      // 2. Verify analytics response
      const analyticsRes = await request(app)
        .get(`/api/links/${shortCode}/analytics`)
        .expect(200);
      assert.strictEqual(analyticsRes.body.summary.totalClicks, 3);
      assert.strictEqual(analyticsRes.body.recentClicks.length, 3);

      // 3. Verify link-list response
      const listRes = await request(app)
        .get('/api/links')
        .expect(200);
      const linkInList = listRes.body.find(l => l.shortCode === shortCode);
      assert.ok(linkInList, 'Link must be present in link list');
      assert.strictEqual(linkInList.clickCount, 3, 'Link list clickCount must be 3');
    });
  });

  describe('Database Persistence Across Restarts', () => {
    it('should persist link and click records across database close and re-open', async () => {
      const uniqueCode = `persist-${Date.now()}`;
      const createRes = await request(app)
        .post('/api/links')
        .send({
          url: 'https://example.com/persist-target',
          customAlias: uniqueCode
        })
        .expect(201);

      // Trigger one click
      await request(app).get(`/${uniqueCode}`).expect(302);

      // Simulate server / database restart
      closeDatabase();
      const newDb = initDatabase();

      // Query from new database connection
      const row = newDb.prepare('SELECT * FROM links WHERE short_code = ?').get(uniqueCode);
      assert.ok(row, 'Link record must exist after database re-open');
      assert.strictEqual(row.click_count, 1, 'Click count must be preserved after database re-open');

      const clickRows = newDb.prepare('SELECT * FROM clicks WHERE short_code = ?').all(uniqueCode);
      assert.strictEqual(clickRows.length, 1, 'Click history must be preserved after database re-open');
    });
  });

  describe('Frontend & Link Listing API', () => {
    it('should serve the dashboard UI at GET /', async () => {
      const res = await request(app)
        .get('/')
        .expect(200)
        .expect('Content-Type', /text\/html/);

      assert.ok(res.text.includes('LinkPulse'));
      assert.ok(res.text.includes('Create a Short Link'));
    });

    it('should serve explicit UI routes at GET /welcome and /dashboard', async () => {
      // 1. Welcome route
      const welcomeRes = await request(app)
        .get('/welcome')
        .expect(200)
        .expect('Content-Type', /text\/html/);
      assert.ok(welcomeRes.text.includes('Get Started'));
      assert.ok(welcomeRes.text.includes('view-welcome'));

      // 2. Dashboard route
      const dashboardRes = await request(app)
        .get('/dashboard')
        .expect(200)
        .expect('Content-Type', /text\/html/);
      assert.ok(dashboardRes.text.includes('view-dashboard'));
      assert.ok(dashboardRes.text.includes('Create a Short Link'));
    });

    it('should list all links at GET /api/links', async () => {
      const res = await request(app)
        .get('/api/links')
        .expect(200)
        .expect('Content-Type', /application\/json/);

      assert.ok(Array.isArray(res.body));
      assert.ok(res.body.length > 0);
      assert.ok(res.body[0].shortUrl);
    });

    it('should reject invalid toggle payloads with 400 Bad Request', async () => {
      await request(app)
        .patch('/api/links/any-code/toggle')
        .send({ isActive: 'not-a-boolean' })
        .expect(400);
    });
  });
});
