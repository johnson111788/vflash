/* The NVIDIA consent configuration belongs to nvidia.com. Localhost and
 * IDE-forwarded previews must not load it or attempt to store its cookies. */
(() => {
  'use strict';
  if (!/(^|\.)nvidia\.com$/i.test(location.hostname)) return;

  window.OptanonWrapper = function () {
    window.dispatchEvent(new Event('bannerLoaded'));
  };

  const notice = document.createElement('script');
  notice.src = 'https://cdn.cookielaw.org/scripttemplates/otSDKStub.js';
  notice.async = false;
  notice.charset = 'UTF-8';
  notice.setAttribute('data-document-language', 'true');
  notice.setAttribute('data-domain-script', '3e2b62ff-7ae7-4ac5-87c8-d5949ecafff5');
  document.head.append(notice);

  const custom = document.createElement('script');
  custom.src = 'https://images.nvidia.com/aem-dam/Solutions/ot-js/ot-custom.js';
  custom.async = false;
  document.head.append(custom);
})();
