// State
let allLinks = [];
let activeFilter = 'all';
let searchQuery = '';
let lastFocusedElement = null;
let currentPage = 1;
let pageSize = 10;

// DOM Elements
const createForm = document.getElementById('create-link-form');
const destinationInput = document.getElementById('destination-url');
const customAliasInput = document.getElementById('custom-alias');
const clickLimitInput = document.getElementById('click-limit');
const expiresAtInput = document.getElementById('expires-at');
const errorBanner = document.getElementById('form-error-banner');
const successBanner = document.getElementById('form-success-banner');
const submitBtn = document.getElementById('submit-btn');
const linksTbody = document.getElementById('links-tbody');
const refreshBtn = document.getElementById('refresh-links-btn');
const toggleAdvancedBtn = document.getElementById('toggle-advanced-btn');
const advancedOptionsGrid = document.getElementById('advanced-options-grid');
const searchInput = document.getElementById('search-links-input');
const filterButtons = document.querySelectorAll('.filter-btn');

// Pagination Elements
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageSizeSelect = document.getElementById('page-size-select');
const paginationInfo = document.getElementById('pagination-info');
const pageNumberDisplay = document.getElementById('page-number-display');

// Metrics Elements
const metricTotalLinks = document.getElementById('metric-total-links');
const metricTotalClicks = document.getElementById('metric-total-clicks');
const metricActiveLinks = document.getElementById('metric-active-links');

// Modal Elements
const modal = document.getElementById('analytics-modal');
const modalTitle = document.getElementById('modal-title');
const modalContent = document.getElementById('modal-content');
const closeModalBtn = document.getElementById('close-modal-btn');

// View Routing & Loading Transition State
let isTransitioning = false;

function handleRoute() {
  const path = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  
  const viewWelcome = document.getElementById('view-welcome');
  const viewDashboard = document.getElementById('view-dashboard');
  const scrollIndicator = document.getElementById('scroll-progress-indicator');

  if (!viewWelcome || !viewDashboard) return;

  if (path === '/dashboard') {
    viewWelcome.style.display = 'none';
    viewDashboard.style.display = 'block';

    if (scrollIndicator) scrollIndicator.style.display = '';
    fetchLinks();
  } else {
    // Default to welcome view for '/' or '/welcome' or unknown routes
    viewDashboard.style.display = 'none';
    viewWelcome.style.display = 'block';

    if (scrollIndicator) scrollIndicator.style.display = 'none';
  }
}

function navigateTo(url) {
  if (window.location.pathname !== url) {
    window.history.pushState({}, '', url);
  }
  handleRoute();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// Skiper9-inspired Stairs Loading Transition
function triggerSkiper9Transition(targetUrl) {
  if (isTransitioning) return;
  isTransitioning = true;

  const preloader = document.getElementById('skiper9-preloader');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const getStartedBtn = document.getElementById('welcome-get-started-btn');

  if (getStartedBtn) getStartedBtn.disabled = true;

  if (prefersReducedMotion || !preloader) {
    navigateTo(targetUrl);
    if (getStartedBtn) getStartedBtn.disabled = false;
    isTransitioning = false;
    return;
  }

  // 1. Activate preloader and start entrance cascade
  preloader.style.display = 'flex';
  preloader.classList.remove('exiting');
  preloader.classList.add('entering');

  // 2. Midpoint: Once stairs fully cover viewport, navigate to dashboard behind overlay
  setTimeout(() => {
    navigateTo(targetUrl);

    // 3. Trigger exit cascade: stairs slide down out of view
    preloader.classList.remove('entering');
    preloader.classList.add('exiting');
  }, 440);

  // 4. Completion: Hide preloader and restore state
  setTimeout(() => {
    preloader.classList.remove('exiting');
    preloader.style.display = 'none';
    isTransitioning = false;
    if (getStartedBtn) getStartedBtn.disabled = false;
  }, 880);
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  checkHealth();

  // Initialize Route Dispatcher
  handleRoute();
  window.addEventListener('popstate', handleRoute);

  // Intercept navigation links for smooth single-page route changes
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (href === '/' || href === '/welcome' || href === '/dashboard') {
      e.preventDefault();
      navigateTo(href);
    }
  });

  // Welcome Get Started Button with Skiper9 Transition
  const welcomeGetStartedBtn = document.getElementById('welcome-get-started-btn');
  if (welcomeGetStartedBtn) {
    welcomeGetStartedBtn.addEventListener('click', (e) => {
      e.preventDefault();
      triggerSkiper9Transition('/dashboard');
    });
  }

  // Dashboard Form & Controls
  createForm.addEventListener('submit', handleCreateLink);
  refreshBtn.addEventListener('click', fetchLinks);
  closeModalBtn.addEventListener('click', closeModal);

  if (toggleAdvancedBtn && advancedOptionsGrid) {
    toggleAdvancedBtn.addEventListener('click', toggleAdvancedOptions);
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      currentPage = 1;
      renderLinksTable();
    });
  }

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter || 'all';
      currentPage = 1;
      renderLinksTable();
    });
  });

  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderLinksTable();
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      currentPage++;
      renderLinksTable();
    });
  }

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value, 10) || 10;
      currentPage = 1;
      renderLinksTable();
    });
  }

  // Modal backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Keyboard accessibility: Escape key to close modal & focus trapping
  document.addEventListener('keydown', handleGlobalKeydown);

  // Auto-refresh when tab gains focus or visibility if on dashboard
  window.addEventListener('focus', () => {
    if (window.location.pathname === '/dashboard') fetchLinks();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.location.pathname === '/dashboard') {
      fetchLinks();
    }
  });

  // Background refresh every 5 seconds to keep live metrics accurate when dashboard is active
  setInterval(() => {
    if (window.location.pathname === '/dashboard') {
      fetchLinks();
    }
  }, 5000);

  // Initialize Skiper106-inspired smooth caret on Custom Alias input
  initSmoothCaret();

  // Initialize Skiper95-inspired vertical scroll progress indicator
  initScrollProgressIndicator();
});

// Check Server Health via /api/health
async function checkHealth() {
  const statusTexts = [
    document.getElementById('system-status-text'),
    document.getElementById('welcome-status-text')
  ].filter(Boolean);

  const statusDots = [
    document.getElementById('system-status-dot'),
    document.getElementById('welcome-status-dot')
  ].filter(Boolean);

  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) throw new Error('Health check failed');
    const data = await res.json();

    if (data.status === 'ok') {
      statusTexts.forEach(el => el.textContent = 'Server Online');
      statusDots.forEach(el => el.classList.remove('offline'));
    } else {
      statusTexts.forEach(el => el.textContent = 'Degraded');
      statusDots.forEach(el => el.classList.add('offline'));
    }
  } catch {
    statusTexts.forEach(el => el.textContent = 'Offline');
    statusDots.forEach(el => el.classList.add('offline'));
  }
}

// Fetch All Links from /api/links
async function fetchLinks() {
  try {
    const res = await fetch('/api/links', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load links from server');
    allLinks = await res.json();
    updateMetrics();
    renderLinksTable();
  } catch (err) {
    linksTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2rem;">Error loading links: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// Update Real Aggregate Metrics (Calculated from real link list)
function updateMetrics() {
  const totalCount = allLinks.length;
  const totalClicks = allLinks.reduce((acc, curr) => acc + (Number(curr.clickCount) || 0), 0);
  const activeCount = allLinks.filter(l => getDerivedStatus(l) === 'active').length;

  if (metricTotalLinks) metricTotalLinks.textContent = totalCount.toLocaleString();
  if (metricTotalClicks) metricTotalClicks.textContent = totalClicks.toLocaleString();
  if (metricActiveLinks) metricActiveLinks.textContent = activeCount.toLocaleString();
}

// Derive Link Status Consistently
function getDerivedStatus(link) {
  if (link.isActive === false || link.is_active === 0) {
    return 'disabled';
  }
  if (link.expiresAt) {
    const expiryTime = new Date(link.expiresAt).getTime();
    if (!isNaN(expiryTime) && Date.now() >= expiryTime) {
      return 'expired';
    }
  }
  if (link.clickLimit !== null && link.clickLimit !== undefined) {
    if (Number(link.clickCount) >= Number(link.clickLimit)) {
      return 'limit_reached';
    }
  }
  return 'active';
}

// Render Links Table
function renderLinksTable() {
  // Apply search and status filters
  const filtered = allLinks.filter(link => {
    const status = getDerivedStatus(link);
    if (activeFilter !== 'all' && status !== activeFilter) {
      return false;
    }
    if (searchQuery) {
      const code = (link.shortCode || '').toLowerCase();
      const url = (link.originalUrl || '').toLowerCase();
      if (!code.includes(searchQuery) && !url.includes(searchQuery)) {
        return false;
      }
    }
    return true;
  });

  if (allLinks.length === 0) {
    linksTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2.5rem;">No short links created yet. Shorten your first URL above.</td></tr>`;
    if (paginationInfo) paginationInfo.textContent = 'Showing 0 of 0 links';
    if (pageNumberDisplay) pageNumberDisplay.textContent = 'Page 1 of 1';
    if (prevPageBtn) prevPageBtn.disabled = true;
    if (nextPageBtn) nextPageBtn.disabled = true;
    return;
  }

  if (filtered.length === 0) {
    linksTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding: 2.5rem;">No links match your search or filter criteria.</td></tr>`;
    if (paginationInfo) paginationInfo.textContent = 'Showing 0 of 0 links';
    if (pageNumberDisplay) pageNumberDisplay.textContent = 'Page 1 of 1';
    if (prevPageBtn) prevPageBtn.disabled = true;
    if (nextPageBtn) nextPageBtn.disabled = true;
    return;
  }

  // Calculate pagination parameters
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pageItems = filtered.slice(startIndex, endIndex);

  // Update pagination UI controls
  if (paginationInfo) {
    paginationInfo.textContent = `Showing ${startIndex + 1}–${endIndex} of ${totalItems} links`;
  }
  if (pageNumberDisplay) {
    pageNumberDisplay.textContent = `Page ${currentPage} of ${totalPages}`;
  }
  if (prevPageBtn) {
    prevPageBtn.disabled = (currentPage <= 1);
  }
  if (nextPageBtn) {
    nextPageBtn.disabled = (currentPage >= totalPages);
  }

  linksTbody.innerHTML = pageItems.map(link => {
    const status = getDerivedStatus(link);
    const createdDate = new Date(link.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const statusBadge = `<span class="badge badge-${status}">${status.replace('_', ' ')}</span>`;
    const toggleLabel = link.isActive ? 'Disable' : 'Enable';

    return `
      <tr>
        <td>
          <a href="${link.shortUrl}" target="_blank" rel="noopener noreferrer" class="shortcode-link" onclick="setTimeout(fetchLinks, 600)">
            /${escapeHtml(link.shortCode)}
          </a>
        </td>
        <td>
          <a href="${escapeHtml(link.originalUrl)}" target="_blank" rel="noopener noreferrer" class="dest-link" title="${escapeHtml(link.originalUrl)}">
            ${escapeHtml(link.originalUrl)}
          </a>
        </td>
        <td>${statusBadge}</td>
        <td>
          <strong>${link.clickCount}</strong>${link.clickLimit ? ` <span class="text-muted">/ ${link.clickLimit}</span>` : ''}
        </td>
        <td class="text-muted">${createdDate}</td>
        <td>
          <div class="action-group">
            <button type="button" class="btn btn-secondary btn-sm" onclick="copyToClipboard('${link.shortUrl}', this)">Copy</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="openAnalytics('${link.shortCode}', this)">Analytics</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="toggleLink('${link.shortCode}', ${!link.isActive})">${toggleLabel}</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Toggle Advanced Options Section
function toggleAdvancedOptions() {
  const isCollapsed = advancedOptionsGrid.classList.contains('collapsed');
  if (isCollapsed) {
    advancedOptionsGrid.classList.remove('collapsed');
    toggleAdvancedBtn.classList.add('expanded');
    toggleAdvancedBtn.setAttribute('aria-expanded', 'true');
  } else {
    advancedOptionsGrid.classList.add('collapsed');
    toggleAdvancedBtn.classList.remove('expanded');
    toggleAdvancedBtn.setAttribute('aria-expanded', 'false');
  }
}

// Handle Form Submission (Accepts both http:// and https://)
async function handleCreateLink(e) {
  e.preventDefault();
  hideAlerts();

  const url = destinationInput.value.trim();
  const customAlias = customAliasInput.value.trim() || undefined;
  const clickLimit = clickLimitInput.value ? Number(clickLimitInput.value) : undefined;
  const expiresAt = expiresAtInput.value ? new Date(expiresAtInput.value).toISOString() : undefined;

  // Frontend format check
  if (!/^https?:\/\//i.test(url)) {
    showError('Destination URL must begin with http:// or https://');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Shortening...';

  try {
    const res = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, customAlias, clickLimit, expiresAt })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || data.error || 'Failed to create short link');
    }

    showSuccess(`Short link created: <a href="${data.shortUrl}" target="_blank" class="shortcode-link" onclick="setTimeout(fetchLinks, 600)">${data.shortUrl}</a>`);
    createForm.reset();
    if (customAliasInput) {
      customAliasInput.dispatchEvent(new Event('input'));
    }
    fetchLinks();
  } catch (err) {
    showError(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Shorten URL';
  }
}

// Toggle Link Active Status
async function toggleLink(shortCode, newActiveState) {
  try {
    const res = await fetch(`/api/links/${shortCode}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: newActiveState })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to update link status');
    }

    fetchLinks();
  } catch (err) {
    alert(err.message);
  }
}

// Open Analytics Modal with Focus Management
async function openAnalytics(shortCode, triggerElement) {
  lastFocusedElement = triggerElement || document.activeElement;
  modalTitle.textContent = `Analytics: /${shortCode}`;
  modalContent.innerHTML = `<p class="text-muted text-center" style="padding: 2rem;">Loading analytics...</p>`;
  modal.style.display = 'flex';

  // Move focus into the modal
  closeModalBtn.focus();

  try {
    const res = await fetch(`/api/links/${shortCode}/analytics`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load analytics');
    const data = await res.json();
    renderAnalytics(data);
  } catch (err) {
    modalContent.innerHTML = `<p class="text-muted text-center" style="color: var(--status-expired); padding: 2rem;">Error: ${escapeHtml(err.message)}</p>`;
  }
}

// Render Analytics Data
function renderAnalytics(data) {
  const { link, summary, breakdowns, recentClicks } = data;

  const totalEvents = summary.recordedEvents || summary.totalClicks || 0;

  // Build Device Distribution
  const devicesEntries = Object.entries(breakdowns.devices || {});
  const devicesHtml = devicesEntries.length === 0
    ? '<span class="text-muted" style="font-size: 0.8125rem;">No device visits recorded yet</span>'
    : '<div class="dist-bar-wrap">' + devicesEntries.map(([dev, count]) => {
        const pct = totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0;
        return `
          <div class="dist-bar-item">
            <span class="dist-label">${escapeHtml(dev)}</span>
            <div class="dist-progress-bg"><div class="dist-progress-fill" style="width: ${pct}%"></div></div>
            <span class="dist-val">${count} (${pct}%)</span>
          </div>
        `;
      }).join('') + '</div>';

  // Build Browser Distribution
  const browsersEntries = Object.entries(breakdowns.browsers || {});
  const browsersHtml = browsersEntries.length === 0
    ? '<span class="text-muted" style="font-size: 0.8125rem;">No browser visits recorded yet</span>'
    : '<div class="dist-bar-wrap">' + browsersEntries.map(([br, count]) => {
        const pct = totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0;
        return `
          <div class="dist-bar-item">
            <span class="dist-label">${escapeHtml(br)}</span>
            <div class="dist-progress-bg"><div class="dist-progress-fill" style="width: ${pct}%"></div></div>
            <span class="dist-val">${count} (${pct}%)</span>
          </div>
        `;
      }).join('') + '</div>';

  // Build Referrers List
  const referrersEntries = Object.entries(breakdowns.referrers || {});
  const referrersHtml = referrersEntries.length === 0
    ? '<span class="text-muted" style="font-size: 0.8125rem;">No referrer data recorded</span>'
    : referrersEntries.map(([ref, count]) =>
        `<span class="tag-item"><strong>${escapeHtml(ref)}:</strong> ${count}</span>`
      ).join('');

  // Build Recent Activity Rows
  const clicksRows = (!recentClicks || recentClicks.length === 0)
    ? `<tr><td colspan="4" class="text-center text-muted" style="padding: 1.5rem;">No visits recorded yet.</td></tr>`
    : recentClicks.map(c => `
      <tr>
        <td class="text-muted">${new Date(c.timestamp).toLocaleString()}</td>
        <td>${escapeHtml(c.device || 'unknown')}</td>
        <td>${escapeHtml(c.browser || 'unknown')}</td>
        <td>${c.isBot ? '<span class="badge badge-limit_reached">Bot</span>' : '<span class="badge badge-active">Human</span>'}</td>
      </tr>
    `).join('');

  modalContent.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-value">${summary.totalClicks}</div>
        <div class="stat-label">Total Clicks</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${summary.humanClicks}</div>
        <div class="stat-label">Human Visits</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${summary.botClicks}</div>
        <div class="stat-label">Bot Traffic</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${link.clickLimit || 'None'}</div>
        <div class="stat-label">Click Cap</div>
      </div>
    </div>

    <div class="breakdown-section">
      <div class="breakdown-title">Device Breakdown</div>
      ${devicesHtml}
    </div>

    <div class="breakdown-section">
      <div class="breakdown-title">Browser Breakdown</div>
      ${browsersHtml}
    </div>

    <div class="breakdown-section">
      <div class="breakdown-title">Top Referrers</div>
      <div class="tag-list">${referrersHtml}</div>
    </div>

    <div class="breakdown-section">
      <div class="breakdown-title">Recent Activity (Last 50 Visits)</div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">Timestamp</th>
              <th scope="col">Device</th>
              <th scope="col">Browser</th>
              <th scope="col">Type</th>
            </tr>
          </thead>
          <tbody>
            ${clicksRows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Close Modal and Restore Focus
function closeModal() {
  modal.style.display = 'none';
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}

// Handle Global Keydown (Escape to close, Focus trap)
function handleGlobalKeydown(e) {
  if (modal.style.display === 'flex' || modal.style.display === 'block') {
    if (e.key === 'Escape') {
      closeModal();
      return;
    }

    // Trap focus inside modal
    if (e.key === 'Tab') {
      const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
  }
}

// Clipboard Action with Feedback
function copyToClipboard(text, btnElement) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showCopyFeedback(btnElement);
    }).catch(() => {
      fallbackPromptCopy(text);
    });
  } else {
    fallbackPromptCopy(text);
  }
}

function showCopyFeedback(btnElement) {
  const originalText = btnElement.textContent;
  btnElement.textContent = 'Copied';
  btnElement.disabled = true;
  setTimeout(() => {
    btnElement.textContent = originalText;
    btnElement.disabled = false;
  }, 1400);
}

function fallbackPromptCopy(text) {
  prompt('Copy short link URL:', text);
}

function showError(msg) {
  errorBanner.textContent = msg;
  errorBanner.style.display = 'block';
}

function showSuccess(html) {
  successBanner.innerHTML = html;
  successBanner.style.display = 'block';
}

function hideAlerts() {
  errorBanner.style.display = 'none';
  successBanner.style.display = 'none';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Skiper106-inspired Smooth Animated Caret for #custom-alias
function initSmoothCaret() {
  const input = document.getElementById('custom-alias');
  const caret = document.getElementById('custom-alias-caret');
  if (!input || !caret) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let blinkTimeout = null;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function updateFont() {
    const style = window.getComputedStyle(input);
    const font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.font = font;
    if (style.letterSpacing && style.letterSpacing !== 'normal') {
      ctx.letterSpacing = style.letterSpacing;
    }
  }

  function calculateTargetX() {
    updateFont();
    const style = window.getComputedStyle(input);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const cursorPos = input.selectionStart ?? input.value.length;
    const textBeforeCursor = input.value.slice(0, cursorPos);
    const textWidth = ctx.measureText(textBeforeCursor).width;

    // Position relative to .input-prefix-group container
    return Math.round(input.offsetLeft + paddingLeft + textWidth - input.scrollLeft);
  }

  function updateCaret(instant = false) {
    // Only show custom caret if #custom-alias is focused
    if (document.activeElement !== input) {
      caret.classList.remove('visible', 'blinking');
      input.classList.remove('smooth-caret-active');
      return;
    }

    // Hide custom caret if text is actively selected (non-collapsed selection)
    if (input.selectionStart !== input.selectionEnd) {
      caret.classList.remove('visible', 'blinking');
      input.classList.remove('smooth-caret-active');
      return;
    }

    input.classList.add('smooth-caret-active');
    const targetX = calculateTargetX();

    if (instant || reducedMotionQuery.matches) {
      const prev = caret.style.transition;
      caret.style.transition = 'none';
      caret.style.setProperty('--caret-x', `${targetX}px`);
      caret.offsetHeight; // force reflow
      caret.style.transition = prev;
    } else {
      caret.style.setProperty('--caret-x', `${targetX}px`);
    }

    caret.classList.add('visible');
    caret.classList.remove('blinking');

    if (blinkTimeout) clearTimeout(blinkTimeout);
    blinkTimeout = setTimeout(() => {
      if (document.activeElement === input && input.selectionStart === input.selectionEnd) {
        caret.classList.add('blinking');
      }
    }, 450);
  }

  input.addEventListener('focus', () => {
    updateFont();
    updateCaret(true); // Snap to position immediately on focus
  });

  input.addEventListener('blur', () => {
    if (blinkTimeout) clearTimeout(blinkTimeout);
    caret.classList.remove('visible', 'blinking');
    input.classList.remove('smooth-caret-active');
  });

  input.addEventListener('input', () => updateCaret(false));
  input.addEventListener('keydown', () => requestAnimationFrame(() => updateCaret(false)));
  input.addEventListener('keyup', () => updateCaret(false));
  input.addEventListener('click', () => updateCaret(false));
  input.addEventListener('scroll', () => updateCaret(true));

  document.addEventListener('selectionchange', () => {
    if (document.activeElement === input) {
      updateCaret(false);
    }
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (document.activeElement === input) {
        updateCaret(true);
      }
    });
  }
}

// Skiper95-inspired Vertical Scroll Progress Indicator
function initScrollProgressIndicator() {
  const wrap = document.getElementById('scroll-progress-indicator');
  const track = document.getElementById('scroll-progress-track');
  const fill = document.getElementById('scroll-progress-fill');
  const thumb = document.getElementById('scroll-progress-thumb');
  const text = document.getElementById('scroll-progress-text');

  if (!wrap || !track || !fill || !thumb || !text) return;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let isTicking = false;

  function updateProgress() {
    isTicking = false;
    const docElem = document.documentElement;
    const body = document.body;
    const scrollHeight = Math.max(docElem.scrollHeight, body.scrollHeight);
    const clientHeight = window.innerHeight || docElem.clientHeight;
    const maxScroll = scrollHeight - clientHeight;

    // Hide if page is too short to scroll
    if (maxScroll <= 15) {
      wrap.classList.add('hidden');
      return;
    }

    wrap.classList.remove('hidden');

    const currentScroll = window.pageYOffset || docElem.scrollTop || body.scrollTop || 0;
    const progress = Math.min(Math.max(currentScroll / maxScroll, 0), 1);
    const percent = Math.round(progress * 100);

    fill.style.height = `${(progress * 100).toFixed(1)}%`;
    thumb.style.top = `${(progress * 100).toFixed(1)}%`;
    text.textContent = `${percent}%`;
  }

  function requestUpdate() {
    if (!isTicking) {
      isTicking = true;
      requestAnimationFrame(updateProgress);
    }
  }

  // Click on track to smoothly jump/scroll to that portion of page
  track.addEventListener('click', (e) => {
    const rect = track.getBoundingClientRect();
    if (rect.height <= 0) return;

    const clickRatio = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    const docElem = document.documentElement;
    const body = document.body;
    const scrollHeight = Math.max(docElem.scrollHeight, body.scrollHeight);
    const clientHeight = window.innerHeight || docElem.clientHeight;
    const maxScroll = scrollHeight - clientHeight;

    if (maxScroll > 0) {
      const targetScroll = clickRatio * maxScroll;
      window.scrollTo({
        top: targetScroll,
        behavior: reducedMotionQuery.matches ? 'auto' : 'smooth'
      });
    }
  });

  // Listen to scroll and resize
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });

  // Handle dynamically changing content with ResizeObserver
  if (typeof ResizeObserver !== 'undefined' && document.body) {
    const resizeObserver = new ResizeObserver(() => {
      requestUpdate();
    });
    resizeObserver.observe(document.body);
  }

  // Handle deep-linked scroll query if provided
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('scroll')) {
    setTimeout(() => {
      const scrollTarget = parseInt(urlParams.get('scroll'), 10) || 0;
      window.scrollTo(0, scrollTarget);
      requestUpdate();
    }, 150);
  }

  // Initial calculation
  requestUpdate();
}

// Global exposure for inline onclick attributes
window.copyToClipboard = copyToClipboard;
window.openAnalytics = openAnalytics;
window.toggleLink = toggleLink;
