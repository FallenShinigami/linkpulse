import { nanoid } from 'nanoid';
import { getDatabase } from '../db/database.js';
import {
  validateDestinationUrl,
  validateCustomAlias,
  validateExpiresAt,
  validateClickLimit
} from '../utils/urlValidator.js';
import { parseUserAgent } from '../utils/deviceParser.js';

export class LinkService {
  /**
   * Create a new short link.
   */
  static createLink({ url, customAlias, expiresAt, clickLimit }) {
    const db = getDatabase();

    // 1. Validate destination URL
    const urlCheck = validateDestinationUrl(url);
    if (!urlCheck.valid) {
      const err = new Error(urlCheck.error);
      err.statusCode = 400;
      throw err;
    }

    // 2. Validate custom alias if provided
    const aliasCheck = validateCustomAlias(customAlias);
    if (!aliasCheck.valid) {
      const err = new Error(aliasCheck.error);
      err.statusCode = 400;
      throw err;
    }

    // 3. Validate expiration date
    const expiryCheck = validateExpiresAt(expiresAt);
    if (!expiryCheck.valid) {
      const err = new Error(expiryCheck.error);
      err.statusCode = 400;
      throw err;
    }

    // 4. Validate click limit
    const limitCheck = validateClickLimit(clickLimit);
    if (!limitCheck.valid) {
      const err = new Error(limitCheck.error);
      err.statusCode = 400;
      throw err;
    }

    const checkExistingStmt = db.prepare('SELECT id FROM links WHERE short_code = ?');

    let finalShortCode = null;
    let finalCustomAlias = null;

    if (aliasCheck.sanitizedAlias) {
      // Check for duplicate alias
      const existing = checkExistingStmt.get(aliasCheck.sanitizedAlias);
      if (existing) {
        const err = new Error(`Custom alias "${aliasCheck.sanitizedAlias}" is already in use`);
        err.statusCode = 409;
        throw err;
      }
      finalShortCode = aliasCheck.sanitizedAlias;
      finalCustomAlias = aliasCheck.sanitizedAlias;
    } else {
      // Auto-generate code with collision retry
      let attempts = 0;
      while (attempts < 5) {
        const candidate = nanoid(6);
        const existing = checkExistingStmt.get(candidate);
        if (!existing) {
          finalShortCode = candidate;
          break;
        }
        attempts++;
      }
      if (!finalShortCode) {
        const err = new Error('Could not generate a unique short code, please try again');
        err.statusCode = 500;
        throw err;
      }
    }

    const now = new Date().toISOString();
    const insertStmt = db.prepare(`
      INSERT INTO links (
        short_code,
        original_url,
        custom_alias,
        is_active,
        expires_at,
        click_limit,
        click_count,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?)
    `);

    insertStmt.run(
      finalShortCode,
      urlCheck.sanitizedUrl,
      finalCustomAlias,
      expiryCheck.sanitizedExpiresAt,
      limitCheck.sanitizedLimit,
      now,
      now
    );

    return this.getLinkByCode(finalShortCode);
  }

  /**
   * Fetch link by short code.
   */
  static getLinkByCode(shortCode) {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM links WHERE short_code = ?');
    const row = stmt.get(shortCode);
    if (!row) return null;

    return this._formatLink(row);
  }

  /**
   * Fetch all links.
   */
  static getAllLinks() {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM links ORDER BY id DESC').all();
    return rows.map(r => this._formatLink(r));
  }

  /**
   * Atomically evaluate redirection rules and record click event.
   */
  static evaluateAndRecordRedirect(shortCode, { referrer, userAgent }) {
    const db = getDatabase();

    // Use IMMEDIATE transaction to lock for write and prevent concurrency races on click_limit
    db.exec('BEGIN IMMEDIATE TRANSACTION;');

    try {
      const stmt = db.prepare('SELECT * FROM links WHERE short_code = ?');
      const link = stmt.get(shortCode);

      if (!link) {
        db.exec('COMMIT;');
        return { status: 'not_found' };
      }

      // Rule 1: Check active status
      if (link.is_active !== 1) {
        db.exec('COMMIT;');
        return { status: 'disabled', link: this._formatLink(link) };
      }

      // Rule 2: Check expiration
      if (link.expires_at) {
        const expiryTime = new Date(link.expires_at).getTime();
        if (Date.now() >= expiryTime) {
          db.exec('COMMIT;');
          return { status: 'expired', link: this._formatLink(link) };
        }
      }

      // Rule 3: Check click limit
      if (link.click_limit !== null && link.click_limit !== undefined) {
        if (link.click_count >= link.click_limit) {
          db.exec('COMMIT;');
          return { status: 'limit_reached', link: this._formatLink(link) };
        }
      }

      // Increment click count
      const now = new Date().toISOString();
      db.prepare('UPDATE links SET click_count = click_count + 1, updated_at = ? WHERE id = ?').run(now, link.id);

      // Record click event
      const parsedUa = parseUserAgent(userAgent);
      db.prepare(`
        INSERT INTO clicks (
          link_id,
          short_code,
          timestamp,
          referrer,
          user_agent,
          device,
          browser,
          is_bot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        link.id,
        shortCode,
        now,
        referrer || null,
        userAgent || null,
        parsedUa.device,
        parsedUa.browser,
        parsedUa.isBot ? 1 : 0
      );

      db.exec('COMMIT;');

      return {
        status: 'ok',
        destinationUrl: link.original_url,
        link: this.getLinkByCode(shortCode)
      };
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Get link metadata and aggregated analytics.
   */
  static getLinkAnalytics(shortCode) {
    const db = getDatabase();
    const link = this.getLinkByCode(shortCode);
    if (!link) return null;

    const clicksStmt = db.prepare('SELECT * FROM clicks WHERE short_code = ? ORDER BY id DESC');
    const clicks = clicksStmt.all(shortCode);

    const deviceCounts = {};
    const browserCounts = {};
    const referrerCounts = {};
    let botCount = 0;

    for (const c of clicks) {
      if (c.is_bot) botCount++;

      const dev = c.device || 'unknown';
      deviceCounts[dev] = (deviceCounts[dev] || 0) + 1;

      const br = c.browser || 'Other';
      browserCounts[br] = (browserCounts[br] || 0) + 1;

      const ref = c.referrer ? new URL(c.referrer, 'http://localhost').hostname : 'Direct / None';
      referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
    }

    return {
      link,
      summary: {
        totalClicks: link.clickCount,
        recordedEvents: clicks.length,
        botClicks: botCount,
        humanClicks: clicks.length - botCount
      },
      breakdowns: {
        devices: deviceCounts,
        browsers: browserCounts,
        referrers: referrerCounts
      },
      recentClicks: clicks.slice(0, 50).map(c => ({
        id: c.id,
        timestamp: c.timestamp,
        referrer: c.referrer,
        device: c.device,
        browser: c.browser,
        isBot: Boolean(c.is_bot)
      }))
    };
  }

  /**
   * Toggle link active status.
   */
  static toggleLinkActive(shortCode, isActive) {
    const db = getDatabase();
    const link = this.getLinkByCode(shortCode);
    if (!link) return null;

    const activeVal = isActive ? 1 : 0;
    const now = new Date().toISOString();
    db.prepare('UPDATE links SET is_active = ?, updated_at = ? WHERE short_code = ?').run(activeVal, now, shortCode);

    return this.getLinkByCode(shortCode);
  }

  static _formatLink(row) {
    const isExpired = row.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : false;
    const isExhausted = row.click_limit ? row.click_count >= row.click_limit : false;

    let computedStatus = 'active';
    if (row.is_active === 0) {
      computedStatus = 'disabled';
    } else if (isExpired) {
      computedStatus = 'expired';
    } else if (isExhausted) {
      computedStatus = 'limit_reached';
    }

    return {
      id: row.id,
      shortCode: row.short_code,
      originalUrl: row.original_url,
      customAlias: row.custom_alias,
      isActive: Boolean(row.is_active),
      expiresAt: row.expires_at,
      clickLimit: row.click_limit,
      clickCount: row.click_count,
      status: computedStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
