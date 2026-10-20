import { LinkService } from '../services/linkService.js';

export class LinkController {
  /**
   * POST /api/links
   */
  static createLink(req, res, next) {
    try {
      const { url, customAlias, expiresAt, clickLimit } = req.body || {};
      const link = LinkService.createLink({ url, customAlias, expiresAt, clickLimit });

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      res.status(201).json({
        ...link,
        shortUrl: `${baseUrl}/${link.shortCode}`
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/links
   */
  static getAllLinks(req, res, next) {
    try {
      const links = LinkService.getAllLinks();
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const formatted = links.map(l => ({
        ...l,
        shortUrl: `${baseUrl}/${l.shortCode}`
      }));
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).json(formatted);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/links/:shortCode/analytics
   */
  static getLinkAnalytics(req, res, next) {
    try {
      const { shortCode } = req.params;
      const analytics = LinkService.getLinkAnalytics(shortCode);

      if (!analytics) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Short link "${shortCode}" was not found`
        });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).json({
        ...analytics,
        link: {
          ...analytics.link,
          shortUrl: `${baseUrl}/${analytics.link.shortCode}`
        }
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/links/:shortCode/toggle
   */
  static toggleLinkStatus(req, res, next) {
    try {
      const { shortCode } = req.params;
      const { isActive } = req.body || {};

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'isActive must be a boolean (true or false)'
        });
      }

      const updated = LinkService.toggleLinkActive(shortCode, isActive);
      if (!updated) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Short link "${shortCode}" was not found`
        });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      res.status(200).json({
        ...updated,
        shortUrl: `${baseUrl}/${updated.shortCode}`
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /:shortCode (Redirect handler)
   */
  static handleRedirect(req, res, next) {
    try {
      const { shortCode } = req.params;

      const result = LinkService.evaluateAndRecordRedirect(shortCode, {
        referrer: req.get('referer'),
        userAgent: req.get('user-agent')
      });

      if (result.status === 'not_found') {
        return res.status(404).json({
          error: 'Not Found',
          message: `Short link "${shortCode}" does not exist`
        });
      }

      if (result.status === 'disabled') {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Short link "${shortCode}" is currently disabled`,
          reason: 'disabled'
        });
      }

      if (result.status === 'expired') {
        return res.status(410).json({
          error: 'Gone',
          message: `Short link "${shortCode}" has expired`,
          reason: 'expired'
        });
      }

      if (result.status === 'limit_reached') {
        return res.status(410).json({
          error: 'Gone',
          message: `Short link "${shortCode}" has reached its maximum click limit`,
          reason: 'limit_reached'
        });
      }

      if (result.status === 'ok') {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.redirect(302, result.destinationUrl);
      }

      res.status(500).json({ error: 'InternalServerError', message: 'Unable to process redirect' });
    } catch (err) {
      next(err);
    }
  }
}
