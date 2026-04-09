(function (Drupal, once) {
  var FEEDBACK_FORM_PATHS = ['/website-feedback', '/form/website_feedback'];
  var FEEDBACK_IFRAME_SRC = '/website-feedback?embedded_feedback=1';

  function shouldSkipWidget() {
    if (!document.body.classList.contains('user-logged-in')) {
      return true;
    }

    var path = window.location.pathname || '';
    return FEEDBACK_FORM_PATHS.some(function (feedbackPath) {
      return path.indexOf(feedbackPath) === 0;
    }) || path.indexOf('/admin/') === 0;
  }

  function collectPageContext() {
    var bodyClasses = Array.prototype.slice.call(document.body.classList || []).join(' ');
    var pageType = '';

    Array.prototype.slice.call(document.body.classList || []).some(function (className) {
      if (className.indexOf('page-node-type-') === 0) {
        pageType = className.replace('page-node-type-', '');
        return true;
      }
      return false;
    });

    return {
      sourceUrl: window.location.href,
      sourceTitle: document.title,
      sourcePath: window.location.pathname + window.location.search,
      referrerUrl: document.referrer || '',
      viewport: window.innerWidth + 'x' + window.innerHeight,
      userAgent: navigator.userAgent,
      bodyClasses: bodyClasses,
      pageContext: pageType ? ('page-node-type:' + pageType) : 'general'
    };
  }

  function buildCommentTemplate(context) {
    return [
      'Page: ' + context.sourceTitle,
      'URL: ' + context.sourceUrl,
      'Referrer: ' + context.referrerUrl,
      'Viewport: ' + context.viewport,
      'Context: ' + context.pageContext,
      '',
      'What happened?'
    ].join('\n');
  }

  function setFieldValue(doc, name, value) {
    var field = doc.querySelector('[name="' + name + '"]');
    if (!field) {
      return null;
    }

    field.value = value;
    field.setAttribute('value', value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return field;
  }

  function ensureSuccessMessage(panel) {
    var success = panel.querySelector('.mh-feedback-panel__success');

    if (success) {
      return success;
    }

    success = document.createElement('div');
    success.className = 'mh-feedback-panel__success';
    success.hidden = true;
    success.style.padding = '1.25rem 1.25rem 1.5rem';
    success.style.display = 'flex';
    success.style.flexDirection = 'column';
    success.style.gap = '.75rem';
    success.innerHTML = [
      '<h3 style="margin:0;font-size:1.1rem;">Feedback sent</h3>',
      '<p class="mh-feedback-panel__success-text" style="margin:0;color:#4b5563;">Thanks. Your report was submitted with this page context.</p>',
      '<button type="button" class="mh-feedback-panel__reset" style="align-self:flex-start;border:0;border-radius:999px;background:#8b1919;color:#fff;padding:.7rem 1rem;font-weight:700;cursor:pointer;">Send another report</button>'
    ].join('');

    panel.appendChild(success);
    return success;
  }

  function ensureWidgetMarkup() {
    var existing = document.querySelector('.mh-feedback-widget');
    var wrapper;

    if (existing) {
      return existing;
    }

    wrapper = document.createElement('div');
    wrapper.className = 'mh-feedback-widget';
    wrapper.innerHTML = [
      '<button type="button" class="mh-feedback-toggle" aria-expanded="false" aria-controls="mh-feedback-panel">Website feedback</button>',
      '<div class="mh-feedback-overlay" hidden></div>',
      '<aside id="mh-feedback-panel" class="mh-feedback-panel" hidden aria-label="Page feedback panel">',
      '  <div class="mh-feedback-panel__header">',
      '    <div>',
      '      <h2 class="mh-feedback-panel__title">Website feedback</h2>',
      '      <p class="mh-feedback-panel__lede">Report a problem with this page or website feature. We will include the current page details automatically.</p>',
      '    </div>',
      '    <button type="button" class="mh-feedback-panel__close" aria-label="Close feedback panel">&times;</button>',
      '  </div>',
      '  <p class="mh-feedback-panel__summary"></p>',
      '  <iframe class="mh-feedback-panel__frame" title="Website feedback form" loading="lazy" src="' + FEEDBACK_IFRAME_SRC + '"></iframe>',
      '</aside>'
    ].join('');

    document.body.appendChild(wrapper);
    return wrapper;
  }

  function injectIframeTweaks(frame, context) {
    var doc;
    var commentField;
    var cleanupSelectors = [
      '.admin-toolbar',
      'header.header',
      'nav.navbar',
      '.region-top-header',
      '.region-header',
      '.region-primary-menu',
      '.region-secondary-menu',
      '.breadcrumb',
      '.tabs',
      '.messages-list'
    ];

    try {
      doc = frame.contentDocument || frame.contentWindow.document;
    }
    catch (e) {
      return;
    }

    if (!doc || !doc.body) {
      return;
    }

    if (!doc.getElementById('mh-feedback-widget-inline-style')) {
      var style = doc.createElement('style');
      style.id = 'mh-feedback-widget-inline-style';
      style.textContent = [
        'body{background:#fff;padding:0;margin:0;}',
        'html,body{background:#fff !important;padding:0 !important;margin:0 !important;}',
        '.layout-content,.dialog-off-canvas-main-canvas,.main-content,#page-wrapper,#page,.layout-container{padding:0 !important;margin:0 !important;}',
        '#toolbar-administration,.toolbar,.toolbar-bar,.toolbar-tray,.toolbar-oriented,.toolbar-menu-administration,.gin-toolbar,.gin-secondary-toolbar,.gin-breadcrumb-wrapper,.gin-sidebar-toggle,.gin-toggle-sidebar,.admin-toolbar,.region-breadcrumb,.block-page-title-block,.breadcrumb,.tabs,.messages-list,header,footer,.region-header,.region-footer,.region-top-header,.region-primary-menu,.region-secondary-menu,.navbar,.navbar-brand,.block-system-branding-block,.block-system-menu-block,.local-tasks-block,.tabs-wrapper,.page-title,.dialog-off-canvas-main-canvas > nav,.dialog-off-canvas-main-canvas > header,.ui-dialog,.ui-widget-overlay,.chatbot-footer,.ai-chatbot,.contextual,[data-contextual-id],[data-drupal-contextual-id],[class*="chatbot"],[id*="chatbot"]{display:none !important;}',
        'main,.region-content,.layout-content{padding:0 !important;margin:0 !important;}',
        'body{overflow:auto !important;}',
        '#mh-feedback-form-shell{padding:1rem 1rem 1.25rem !important;}',
        '#mh-feedback-form-shell form{margin:0 !important;}',
        '#mh-feedback-form-shell .js-form-item,#mh-feedback-form-shell .form-actions{margin-bottom:1rem !important;}',
        '#mh-feedback-form-shell .form-actions{padding-top:.25rem !important;}',
        '.form-item-reported-by-uid,.form-item-reported-by-name,.form-item-reported-by-mail{display:none !important;}'
      ].join('');
      doc.head.appendChild(style);
    }

    var form = doc.querySelector('form.webform-submission-form, form[id^="webform-submission-"]');
    var messages = doc.querySelector('[data-drupal-messages], .messages, .messages-list');

    if (form && !doc.body.hasAttribute('data-mh-feedback-form-only')) {
      var container = doc.createElement('div');
      container.id = 'mh-feedback-form-shell';

      if (messages) {
        container.appendChild(messages);
      }

      container.appendChild(form);
      doc.body.innerHTML = '';
      doc.body.appendChild(container);
      doc.body.setAttribute('data-mh-feedback-form-only', 'true');
    }

    cleanupSelectors.forEach(function (selector) {
      Array.prototype.slice.call(doc.querySelectorAll(selector)).forEach(function (element) {
        element.remove();
      });
    });

    setFieldValue(doc, 'page_title', context.sourceTitle);
    setFieldValue(doc, 'page_url', context.sourceUrl);
    setFieldValue(doc, 'page_path', context.sourcePath);
    setFieldValue(doc, 'referrer_url', context.referrerUrl);
    setFieldValue(doc, 'viewport', context.viewport);
    setFieldValue(doc, 'page_context', buildCommentTemplate(context));
    setFieldValue(doc, 'user_agent', context.userAgent);
    setFieldValue(doc, 'body_classes', context.bodyClasses);
    setFieldValue(doc, 'feedback_source', 'bootstrap_widget');

    commentField = doc.querySelector('textarea[name="what_happened"]');

    var commentLabel = doc.querySelector('label[for="' + (commentField ? commentField.id : '') + '"]');
    if (commentLabel) {
      commentLabel.textContent = 'What happened?';
    }

    if (commentField) {
      commentField.setAttribute('placeholder', 'Describe the problem, confusing part, or suggestion.');
    }
  }

  function enhanceWidget(widget) {
    var toggle = widget.querySelector('.mh-feedback-toggle');
    var overlay = widget.querySelector('.mh-feedback-overlay');
    var panel = widget.querySelector('.mh-feedback-panel');
    var closeButton = widget.querySelector('.mh-feedback-panel__close');
    var summary = widget.querySelector('.mh-feedback-panel__summary');
    var frame = widget.querySelector('.mh-feedback-panel__frame');
    var success = ensureSuccessMessage(panel);
    var successText = success.querySelector('.mh-feedback-panel__success-text');
    var resetButton = success.querySelector('.mh-feedback-panel__reset');

    if (!toggle || !overlay || !panel || !closeButton || !summary || !frame) {
      return;
    }

    if (overlay.parentNode !== document.body) {
      document.body.appendChild(overlay);
    }

    if (panel.parentNode !== document.body) {
      document.body.appendChild(panel);
    }

    if (frame.getAttribute('src') !== FEEDBACK_IFRAME_SRC) {
      frame.setAttribute('src', FEEDBACK_IFRAME_SRC);
    }

    function applyPlacement() {
      var mobile = window.innerWidth < 768;

      widget.style.position = 'fixed';
      widget.style.left = 'auto';
      widget.style.zIndex = '2147483000';
      widget.style.display = 'flex';
      widget.style.alignItems = 'center';
      widget.style.pointerEvents = 'none';

      toggle.style.pointerEvents = 'auto';
      toggle.style.border = '0';
      toggle.style.background = '#8b1919';
      toggle.style.color = '#fff';
      toggle.style.boxShadow = '0 10px 30px rgba(0,0,0,.22)';
      toggle.style.fontWeight = '700';
      toggle.style.lineHeight = '1';
      toggle.style.whiteSpace = 'nowrap';

      if (mobile) {
        widget.style.right = '1rem';
        widget.style.bottom = '1rem';
        widget.style.top = 'auto';
        widget.style.transform = 'none';

        toggle.style.borderRadius = '999px';
        toggle.style.padding = '.9rem 1.1rem';
        toggle.style.fontSize = '1rem';
        toggle.style.minHeight = '0';
        toggle.style.writingMode = 'horizontal-tb';
        toggle.style.transform = 'none';
        toggle.style.letterSpacing = '0';
      }
      else {
        widget.style.right = '0';
        widget.style.bottom = 'auto';
        widget.style.top = '58%';
        widget.style.transform = 'translateY(-50%)';

        toggle.style.borderRadius = '16px 0 0 16px';
        toggle.style.padding = '.9rem .7rem';
        toggle.style.fontSize = '.9rem';
        toggle.style.minHeight = '9rem';
        toggle.style.writingMode = 'vertical-rl';
        toggle.style.transform = 'none';
        toggle.style.letterSpacing = '.04em';
      }
    }

    applyPlacement();
    window.addEventListener('resize', applyPlacement);

    panel.style.position = 'fixed';
    panel.style.top = '0';
    panel.style.right = '0';
    panel.style.left = 'auto';
    panel.style.zIndex = '2147482999';
    panel.style.width = 'min(30rem, calc(100vw - 2rem))';
    panel.style.height = '100vh';
    panel.style.background = '#fff';
    panel.style.boxShadow = '0 18px 45px rgba(0,0,0,.28)';
    panel.style.transform = 'translateX(100%)';
    panel.style.transition = 'transform 180ms ease';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.pointerEvents = 'auto';

    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '2147482998';
    overlay.style.background = 'rgba(22,25,31,.42)';
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.transition = 'opacity 160ms ease';

    frame.style.pointerEvents = 'auto';
    frame.style.flex = '1 1 auto';
    frame.style.width = '100%';
    frame.style.border = '0';
    frame.style.display = 'block';

    summary.style.margin = '0';
    summary.style.padding = '.75rem 1.25rem';
    summary.style.fontSize = '.9rem';
    summary.style.color = '#4b5563';
    summary.style.borderBottom = '1px solid #e5e7eb';

    function showForm() {
      success.hidden = true;
      success.style.display = 'none';
      frame.hidden = false;
      frame.style.display = 'block';
    }

    function showSuccess(message) {
      if (successText) {
        successText.textContent = message || 'Thanks. Your report was submitted with this page context.';
      }
      frame.hidden = true;
      frame.style.display = 'none';
      success.hidden = false;
      success.style.display = 'flex';
    }

    function resetForm() {
      showForm();
      frame.setAttribute('src', FEEDBACK_IFRAME_SRC + '&reload=' + Date.now());
    }

    function refreshSummary() {
      summary.textContent = document.title + ' • ' + window.location.pathname;
    }

    function openPanel() {
      refreshSummary();
      panel.hidden = false;
      overlay.hidden = false;
      requestAnimationFrame(function () {
        panel.classList.add('is-open');
        overlay.classList.add('is-visible');
        panel.style.transform = 'translateX(0)';
        overlay.style.opacity = '1';
        overlay.style.pointerEvents = 'auto';
      });
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('mh-feedback-panel-open');
    }

    function closePanel() {
      panel.classList.remove('is-open');
      overlay.classList.remove('is-visible');
      panel.style.transform = 'translateX(100%)';
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('mh-feedback-panel-open');
      window.setTimeout(function () {
        panel.hidden = true;
        overlay.hidden = true;
      }, 180);
    }

    frame.addEventListener('load', function () {
      var doc;
      var message;

      try {
        doc = frame.contentDocument || frame.contentWindow.document;
      }
      catch (e) {
        return;
      }

      if (!doc || !doc.body) {
        return;
      }

      if (doc.querySelector('form.webform-submission-form, form[id^="webform-submission-"]')) {
        showForm();
        injectIframeTweaks(frame, collectPageContext());
        return;
      }

      message = doc.querySelector('.webform-confirmation__message, [data-drupal-messages] .messages__content, .messages--status, .messages');
      showSuccess(message ? message.textContent.trim() : 'Thanks. Your report was submitted with this page context.');
    });

    toggle.addEventListener('click', function () {
      if (panel.classList.contains('is-open')) {
        closePanel();
        return;
      }
      openPanel();
    });

    closeButton.addEventListener('click', closePanel);
    overlay.addEventListener('click', closePanel);
    resetButton.addEventListener('click', resetForm);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && panel.classList.contains('is-open')) {
        closePanel();
      }
    });
  }

  Drupal.behaviors.makerspacePageFeedbackWidget = {
    attach: function (context) {
      if (shouldSkipWidget()) {
        return;
      }

      var widget = ensureWidgetMarkup();
      if (widget && !widget.hasAttribute('data-mh-feedback-enhanced')) {
        enhanceWidget(widget);
        widget.setAttribute('data-mh-feedback-enhanced', 'true');
      }
    }
  };
}(Drupal, once));
