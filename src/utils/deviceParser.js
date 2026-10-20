/**
 * Lightweight User-Agent parser for device, browser, and bot detection.
 * @param {string|undefined} userAgent
 * @returns {{ device: string, browser: string, isBot: boolean }}
 */
export function parseUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    return { device: 'unknown', browser: 'Unknown', isBot: false };
  }

  const ua = userAgent.toLowerCase();

  // Bot detection
  const isBot = /bot|crawler|spider|crawling|slurp|duckduckbot|baiduspider|yandexbot|sogou|exabot|facebot|ia_archiver|curl|wget|python|postman/i.test(ua);

  // Device detection
  let device = 'desktop';
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    device = 'tablet';
  } else if (/mobile|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini/i.test(ua)) {
    device = 'mobile';
  }

  // Browser detection
  let browser = 'Other';
  if (/edg/i.test(ua)) {
    browser = 'Edge';
  } else if (/opr|opera/i.test(ua)) {
    browser = 'Opera';
  } else if (/chrome|crios/i.test(ua)) {
    browser = 'Chrome';
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'Firefox';
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    browser = 'Safari';
  }

  return { device, browser, isBot };
}
