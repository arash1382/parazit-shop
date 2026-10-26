const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const STATIC_DIR = path.join(__dirname, 'outfit.hellohello.is');

// Map preloader images to the extracted AVIF files in outfit.hellohello.is/_next/
const PRELOADER_IMAGE_MAP = {
  '/preloader/image-01.jpg': 'image-0fe94d30eedf3.html',
  '/preloader/image-02.jpg': 'image-d88b9dcaa1e93.html',
  '/preloader/image-03.jpg': 'image-fc334a413b1708.html',
  '/preloader/image-04.jpg': 'image-14227cd38a6308.html',
  '/preloader/image-05.jpg': 'image-7ab0b34dde0f9.html',
  '/preloader/image-06.jpg': 'image-fcb1ed20a713b8.html',
};

// Handle Next.js Image Optimization endpoint (/_next/image?url=...&w=...&q=...)
app.get('/_next/image', (req, res) => {
  const rawUrl = req.query.url;
  const width = req.query.w;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).send('Missing url parameter');
  }

  // Serve local AVIF preloader images
  if (PRELOADER_IMAGE_MAP[rawUrl]) {
    const filePath = path.join(STATIC_DIR, '_next', PRELOADER_IMAGE_MAP[rawUrl]);
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'image/avif');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.sendFile(filePath);
    }
  }

  // Redirect remote Shopify CDN URLs directly (append width if supported)
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    try {
      const targetUrl = new URL(rawUrl);
      if (width && targetUrl.hostname.includes('cdn.shopify.com')) {
        targetUrl.searchParams.set('width', String(width));
      }
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.redirect(302, targetUrl.toString());
    } catch {
      return res.redirect(302, rawUrl);
    }
  }

  // Fallback to default extracted AVIF image
  const fallbackFile = path.join(STATIC_DIR, '_next', 'image.html');
  if (fs.existsSync(fallbackFile)) {
    res.setHeader('Content-Type', 'image/avif');
    return res.sendFile(fallbackFile);
  }

  res.status(404).end();
});

// Handle missing legacy noModule polyfill chunk cleanly
app.get('/_next/static/chunks/a6dad97d9634a72d.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.send('// noModule polyfill stub');
});

// Client-side interactive router & cart layer for Product Detail, Bag, and Shipping & Returns
const INTERACTIVE_SCRIPT = `
(function () {
  if (window.__outfitInteractiveLoaded) return;
  window.__outfitInteractiveLoaded = true;

  const STORAGE_KEY = 'outfit_hh_bag_v1';

  // Extract all product objects from Next.js flight payload (self.__next_f)
  function extractProducts() {
    const map = new Map();
    const chunks = Array.isArray(window.__next_f) ? window.__next_f : [];
    const fullText = chunks.map(c => (Array.isArray(c) && typeof c[1] === 'string' ? c[1] : '')).join('\\n');

    const marker = '"item":{"id":"gid://shopify/Product/';
    let idx = 0;
    while ((idx = fullText.indexOf(marker, idx)) !== -1) {
      const startObj = idx + 7; // starts at {"id":"gid://shopify/Product/...
      let depth = 0;
      let inStr = false;
      let esc = false;
      let endObj = -1;
      for (let i = startObj; i < fullText.length; i++) {
        const ch = fullText[i];
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === '\\\\') {
          esc = true;
          continue;
        }
        if (ch === '"') {
          inStr = !inStr;
          continue;
        }
        if (!inStr) {
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              endObj = i + 1;
              break;
            }
          }
        }
      }
      if (endObj !== -1) {
        try {
          const prod = JSON.parse(fullText.slice(startObj, endObj));
          if (prod && prod.handle) {
            map.set(prod.handle, prod);
          }
        } catch (e) {}
      }
      idx += marker.length;
    }
    return map;
  }

  function loadBag() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveBag(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
    updateHeaderBagCount(items);
  }

  function updateHeaderBagCount(items) {
    const total = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    document.querySelectorAll('a[href="/bag"] number-flow-react').forEach(el => {
      try {
        el.innerHTML = String(total);
        if (el.shadowRoot) {
          const numSpan = el.shadowRoot.querySelector('.number__inner');
          if (numSpan) numSpan.textContent = String(total);
        }
      } catch {}
    });
  }

  function formatMoney(amount) {
    const num = parseFloat(amount || '0');
    return '$' + num.toFixed(2);
  }

  function ensureOverlayRoot() {
    let root = document.getElementById('outfit-dynamic-overlay');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'outfit-dynamic-overlay';
    root.style.cssText = 'position:fixed;inset:0;z-index:45;display:none;overflow-y:auto;background:var(--overlay-bg, #ff0001);color:var(--overlay-fg, #000);transition:opacity 0.28s ease;';
    document.body.appendChild(root);
    return root;
  }

  function syncOverlayTheme(root) {
    const html = document.documentElement;
    const isDark = html.classList.contains('dark');
    const isLight = html.classList.contains('light');
    if (isDark) {
      root.style.background = '#000000';
      root.style.color = '#ede4dd';
      root.style.setProperty('--border-col', 'rgba(237,228,221,0.22)');
      root.style.setProperty('--btn-bg', '#ede4dd');
      root.style.setProperty('--btn-fg', '#000000');
    } else if (isLight) {
      root.style.background = '#ede4dd';
      root.style.color = '#000000';
      root.style.setProperty('--border-col', 'rgba(0,0,0,0.2)');
      root.style.setProperty('--btn-bg', '#000000');
      root.style.setProperty('--btn-fg', '#ede4dd');
    } else {
      root.style.background = '#ff0001';
      root.style.color = '#000000';
      root.style.setProperty('--border-col', 'rgba(0,0,0,0.25)');
      root.style.setProperty('--btn-bg', '#000000');
      root.style.setProperty('--btn-fg', '#ede4dd');
    }
  }

  function closeOverlay(pushHome) {
    const root = document.getElementById('outfit-dynamic-overlay');
    if (root) {
      root.style.display = 'none';
      root.innerHTML = '';
    }
    document.body.style.overflow = '';
    if (pushHome && window.location.pathname !== '/') {
      history.pushState({}, '', '/');
    }
  }

  function renderProductView(handle, pushHistory = true) {
    const products = extractProducts();
    const product = products.get(handle);
    if (!product) {
      closeOverlay(true);
      return;
    }

    if (pushHistory && window.location.pathname !== '/product/' + handle) {
      history.pushState({ view: 'product', handle }, '', '/product/' + handle);
    }

    const root = ensureOverlayRoot();
    syncOverlayTheme(root);
    root.style.display = 'block';
    document.body.style.overflow = 'hidden';

    const variants = Array.isArray(product.variants) ? product.variants : [];
    let selectedVariant = variants.find(v => v.availableForSale) || variants[0] || {
      id: product.id,
      title: 'Default',
      availableForSale: product.availableForSale,
      price: product.priceRange?.minVariantPrice || { amount: '34.0', currencyCode: 'USD' }
    };

    const images = Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : (product.featuredImage ? [product.featuredImage] : []);

    function renderContent() {
      const priceStr = formatMoney(selectedVariant?.price?.amount || product.priceRange?.maxVariantPrice?.amount);
      const isAvailable = Boolean(product.availableForSale && selectedVariant?.availableForSale);
      const showVariants = variants.length > 1 || (variants[0] && variants[0].title !== 'Default Title');

      root.innerHTML = \`
        <div style="min-height:100vh;padding:6.5rem 1.5rem 4rem;max-width:1440px;margin:0 auto;display:flex;flex-direction:column;justify-content:space-between;">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:1.25rem;border-bottom:2px solid currentColor;margin-bottom:2.5rem;">
              <button id="outfit-back-btn" style="font-weight:700;font-size:0.875rem;text-transform:uppercase;letter-spacing:0.04em;cursor:pointer;display:flex;align-items:center;gap:0.5rem;">
                ← Back to Collection
              </button>
              <span style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">OUTFIT® / SPECIMEN</span>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:3rem;align-items:start;">
              <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:1rem;">
                \${images.map(img => \`
                  <div style="background:#d2cac3;overflow:hidden;aspect-ratio:3/4;">
                    <img src="\${img.url}" alt="\${product.title}" style="width:100%;height:100%;object-fit:cover;display:block;" />
                  </div>
                \`).join('')}
              </div>

              <div style="display:flex;flex-direction:column;gap:1.75rem;max-width:520px;">
                <div>
                  <div style="display:flex;align-items:center;gap:0.5rem;font-size:0.75rem;text-transform:uppercase;margin-bottom:0.5rem;font-weight:700;">
                    <span style="width:8px;height:8px;border-radius:999px;background:currentColor;display:inline-block;"></span>
                    <span>\${isAvailable ? 'In Stock' : 'Sold Out'}</span>
                  </div>
                  <h1 style="font-size:clamp(2.25rem, 4vw, 3.75rem);font-weight:700;line-height:0.95;letter-spacing:-0.03em;text-transform:uppercase;margin:0;">
                    \${product.title}
                  </h1>
                  <p style="font-size:1.75rem;font-weight:700;margin-top:0.75rem;">\${priceStr} <span style="font-size:0.875rem;font-weight:400;">USD</span></p>
                </div>

                <p style="font-size:1.05rem;line-height:1.5;opacity:0.9;">
                  \${product.description || ''}
                </p>

                \${showVariants ? \`
                  <div>
                    <p style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.65rem;">Select Option</p>
                    <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
                      \${variants.map(v => {
                        const active = v.id === selectedVariant.id;
                        return \`
                          <button data-variant-id="\${v.id}" style="padding:0.65rem 1.1rem;font-size:0.85rem;font-weight:700;text-transform:uppercase;border:1.5px solid currentColor;cursor:pointer;background:\${active ? 'var(--btn-bg)' : 'transparent'};color:\${active ? 'var(--btn-fg)' : 'currentColor'};opacity:\${v.availableForSale ? '1' : '0.4'};">
                            \${v.title}
                          </button>
                        \`;
                      }).join('')}
                    </div>
                  </div>
                \` : ''}

                <div style="display:flex;gap:1rem;margin-top:0.5rem;">
                  <button id="outfit-add-bag" \${!isAvailable ? 'disabled' : ''} style="flex:1;padding:1.15rem 1.75rem;font-size:0.95rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;background:var(--btn-bg);color:var(--btn-fg);border:none;cursor:\${isAvailable ? 'pointer' : 'not-allowed'};opacity:\${isAvailable ? '1' : '0.45'};">
                    \${isAvailable ? 'Add to Bag — ' + priceStr : 'Sold Out'}
                  </button>
                </div>

                <div style="border-top:1px solid var(--border-col);padding-top:1.25rem;font-size:0.82rem;line-height:1.6;opacity:0.85;">
                  <p><strong>Crafted by ++hellohello:</strong> Heavyweight studio-grade construction. Worldwide tracked shipping available.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      \`;

      root.querySelector('#outfit-back-btn')?.addEventListener('click', () => closeOverlay(true));
      root.querySelectorAll('[data-variant-id]').forEach(btn => {
        btn.addEventListener('click', () => {
          const vId = btn.getAttribute('data-variant-id');
          const found = variants.find(v => v.id === vId);
          if (found) {
            selectedVariant = found;
            renderContent();
          }
        });
      });

      root.querySelector('#outfit-add-bag')?.addEventListener('click', () => {
        if (!isAvailable) return;
        const bag = loadBag();
        const existing = bag.find(item => item.variantId === selectedVariant.id);
        if (existing) {
          existing.quantity += 1;
        } else {
          bag.push({
            handle: product.handle,
            title: product.title,
            variantId: selectedVariant.id,
            variantTitle: selectedVariant.title,
            price: parseFloat(selectedVariant?.price?.amount || '34.0'),
            image: images[0]?.url || '',
            quantity: 1
          });
        }
        saveBag(bag);
        renderBagView(true);
      });
    }

    renderContent();
  }

  function renderBagView(pushHistory = true) {
    if (pushHistory && window.location.pathname !== '/bag') {
      history.pushState({ view: 'bag' }, '', '/bag');
    }
    const root = ensureOverlayRoot();
    syncOverlayTheme(root);
    root.style.display = 'block';
    document.body.style.overflow = 'hidden';

    function updateBagDOM() {
      const bag = loadBag();
      const subtotal = bag.reduce((sum, i) => sum + i.price * i.quantity, 0);

      root.innerHTML = \`
        <div style="min-height:100vh;padding:6.5rem 1.5rem 4rem;max-width:1280px;margin:0 auto;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:4px solid currentColor;padding-bottom:1.25rem;margin-bottom:2.5rem;">
            <h1 style="font-size:clamp(3rem, 7vw, 5.5rem);font-weight:700;letter-spacing:-0.04em;line-height:0.9;text-transform:uppercase;margin:0;">YOUR BAG</h1>
            <button id="outfit-close-bag" style="font-weight:700;font-size:0.9rem;text-transform:uppercase;cursor:pointer;">← Continue Shopping</button>
          </div>

          \${bag.length === 0 ? \`
            <div style="padding:5rem 0;text-align:left;">
              <p style="font-size:1.75rem;font-weight:700;margin-bottom:1.5rem;">Your bag is currently empty.</p>
              <button id="outfit-empty-explore" style="padding:1rem 2rem;background:var(--btn-bg);color:var(--btn-fg);font-weight:700;text-transform:uppercase;font-size:0.875rem;cursor:pointer;border:none;">
                Explore Collection
              </button>
            </div>
          \` : \`
            <div style="display:grid;grid-template-columns:1fr;gap:1.5rem;">
              \${bag.map((item, idx) => \`
                <div style="display:grid;grid-template-columns:96px 1fr auto;gap:1.5rem;align-items:center;padding-bottom:1.5rem;border-bottom:1px solid var(--border-col);">
                  <img src="\${item.image}" alt="\${item.title}" style="width:96px;height:120px;object-fit:cover;background:#d2cac3;" />
                  <div>
                    <h3 style="font-size:1.25rem;font-weight:700;text-transform:uppercase;margin:0 0 0.25rem;">\${item.title}</h3>
                    <p style="font-size:0.85rem;opacity:0.8;margin:0 0 0.75rem;">\${item.variantTitle !== 'Default Title' ? item.variantTitle : 'Standard Edition'}</p>
                    <div style="display:inline-flex;align-items:center;border:1.5px solid currentColor;">
                      <button data-dec="\${idx}" style="padding:0.25rem 0.75rem;font-weight:700;cursor:pointer;">−</button>
                      <span style="padding:0.25rem 0.75rem;font-weight:700;font-size:0.9rem;">\${item.quantity}</span>
                      <button data-inc="\${idx}" style="padding:0.25rem 0.75rem;font-weight:700;cursor:pointer;">+</button>
                    </div>
                  </div>
                  <div style="text-align:right;">
                    <p style="font-size:1.25rem;font-weight:700;margin:0 0 0.5rem;">\${formatMoney(item.price * item.quantity)}</p>
                    <button data-remove="\${idx}" style="font-size:0.75rem;text-transform:uppercase;text-decoration:underline;cursor:pointer;opacity:0.75;">Remove</button>
                  </div>
                </div>
              \`).join('')}

              <div style="display:flex;flex-direction:column;align-items:flex-end;padding-top:1.5rem;gap:1rem;">
                <div style="display:flex;justify-content:space-between;width:100%;max-width:380px;font-size:1.35rem;font-weight:700;">
                  <span>Subtotal</span>
                  <span>\${formatMoney(subtotal)} USD</span>
                </div>
                <p style="font-size:0.85rem;opacity:0.75;">Shipping and taxes calculated at checkout.</p>
                <button id="outfit-checkout-btn" style="width:100%;max-width:380px;padding:1.15rem 2rem;background:var(--btn-bg);color:var(--btn-fg);font-weight:700;text-transform:uppercase;letter-spacing:0.05em;cursor:pointer;border:none;">
                  Proceed to Checkout
                </button>
                <p id="outfit-checkout-msg" style="display:none;font-size:0.875rem;font-weight:700;margin-top:0.5rem;">
                  Thank you for exploring OUTFIT® by ++hellohello! Online checkout is in preview mode.
                </p>
              </div>
            </div>
          \`}
        </div>
      \`;

      root.querySelector('#outfit-close-bag')?.addEventListener('click', () => closeOverlay(true));
      root.querySelector('#outfit-empty-explore')?.addEventListener('click', () => closeOverlay(true));
      root.querySelector('#outfit-checkout-btn')?.addEventListener('click', () => {
        const msg = root.querySelector('#outfit-checkout-msg');
        if (msg) msg.style.display = 'block';
      });

      root.querySelectorAll('[data-inc]').forEach(btn => {
        btn.addEventListener('click', () => {
          const i = Number(btn.getAttribute('data-inc'));
          const current = loadBag();
          if (current[i]) {
            current[i].quantity += 1;
            saveBag(current);
            updateBagDOM();
          }
        });
      });

      root.querySelectorAll('[data-dec]').forEach(btn => {
        btn.addEventListener('click', () => {
          const i = Number(btn.getAttribute('data-dec'));
          const current = loadBag();
          if (current[i]) {
            current[i].quantity -= 1;
            if (current[i].quantity <= 0) current.splice(i, 1);
            saveBag(current);
            updateBagDOM();
          }
        });
      });

      root.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
          const i = Number(btn.getAttribute('data-remove'));
          const current = loadBag();
          current.splice(i, 1);
          saveBag(current);
          updateBagDOM();
        });
      });
    }

    updateBagDOM();
  }

  function renderShippingView(pushHistory = true) {
    if (pushHistory && window.location.pathname !== '/shipping-and-return') {
      history.pushState({ view: 'shipping' }, '', '/shipping-and-return');
    }
    const root = ensureOverlayRoot();
    syncOverlayTheme(root);
    root.style.display = 'block';
    document.body.style.overflow = 'hidden';

    root.innerHTML = \`
      <div style="min-height:100vh;padding:6.5rem 1.5rem 4rem;max-width:1100px;margin:0 auto;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:4px solid currentColor;padding-bottom:1.25rem;margin-bottom:2.5rem;">
          <h1 style="font-size:clamp(2.5rem, 6vw, 4.75rem);font-weight:700;letter-spacing:-0.04em;line-height:0.95;text-transform:uppercase;margin:0;">SHIPPING &amp; RETURNS</h1>
          <button id="outfit-close-shipping" style="font-weight:700;font-size:0.9rem;text-transform:uppercase;cursor:pointer;">← Back to Shop</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:2.5rem;line-height:1.6;">
          <div>
            <h2 style="font-size:1.35rem;font-weight:700;text-transform:uppercase;margin-bottom:0.75rem;">Production &amp; Dispatch</h2>
            <p>Every OUTFIT® piece is made to order to reduce overproduction and textile waste. Please allow 2–5 business days for garment printing, quality inspection, and fulfillment before your order ships.</p>
          </div>
          <div>
            <h2 style="font-size:1.35rem;font-weight:700;text-transform:uppercase;margin-bottom:0.75rem;">Worldwide Delivery</h2>
            <p>We ship globally with tracked delivery. Standard domestic orders arrive within 5–8 business days; international shipments typically arrive within 7–14 business days depending on customs clearance.</p>
          </div>
          <div>
            <h2 style="font-size:1.35rem;font-weight:700;margin-bottom:0.75rem;text-transform:uppercase;">Returns &amp; Exchanges</h2>
            <p>If an item arrives damaged, misprinted, or defective, reach out within 14 days of delivery and we will issue a replacement at no additional cost.</p>
          </div>
        </div>
      </div>
    \`;

    root.querySelector('#outfit-close-shipping')?.addEventListener('click', () => closeOverlay(true));
  }

  // Intercept internal route clicks in capture phase before TransitionRouter leaves page
  document.addEventListener('click', function (e) {
    const anchor = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';

    if (href === '/') {
      if (document.getElementById('outfit-dynamic-overlay')?.style.display === 'block') {
        e.preventDefault();
        e.stopPropagation();
        closeOverlay(true);
      }
      return;
    }

    if (href.startsWith('/product/')) {
      e.preventDefault();
      e.stopPropagation();
      const handle = href.replace('/product/', '').split('?')[0];
      renderProductView(handle, true);
      return;
    }

    if (href === '/bag') {
      e.preventDefault();
      e.stopPropagation();
      renderBagView(true);
      return;
    }

    if (href === '/shipping-and-return') {
      e.preventDefault();
      e.stopPropagation();
      renderShippingView(true);
      return;
    }
  }, true);

  window.addEventListener('popstate', function () {
    const p = window.location.pathname;
    if (p.startsWith('/product/')) {
      renderProductView(p.replace('/product/', ''), false);
    } else if (p === '/bag') {
      renderBagView(false);
    } else if (p === '/shipping-and-return') {
      renderShippingView(false);
    } else {
      closeOverlay(false);
    }
  });

  // Watch theme changes to keep overlay synchronized
  const obs = new MutationObserver(() => {
    const root = document.getElementById('outfit-dynamic-overlay');
    if (root && root.style.display === 'block') {
      syncOverlayTheme(root);
    }
  });
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('DOMContentLoaded', () => {
    updateHeaderBagCount(loadBag());
    setTimeout(() => updateHeaderBagCount(loadBag()), 1200);
  });
})();
`;

app.get('/__outfit-interactive.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.send(INTERACTIVE_SCRIPT);
});

// Handle Next.js RSC prefetch requests cleanly so no 404s occur in console
app.use((req, res, next) => {
  if (req.headers['rsc'] === '1') {
    res.setHeader('Content-Type', 'text/x-component; charset=utf-8');
    const indexRsc = path.join(STATIC_DIR, 'index-d90a3c09b31c88.html');
    if (fs.existsSync(indexRsc)) {
      return res.sendFile(indexRsc);
    }
    return res.status(200).send('');
  }
  next();
});

// Helper to serve index.html with the interactive script injected
function serveMainHtml(res) {
  const indexPath = path.join(STATIC_DIR, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  if (!html.includes('/__outfit-interactive.js')) {
    html = html.replace('</body>', '<script src="/__outfit-interactive.js" defer></script></body>');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

app.get('/', (_req, res) => {
  serveMainHtml(res);
});

// Serve static assets from outfit.hellohello.is
app.use(express.static(STATIC_DIR, { index: false }));

// Fallback for SPA routes (/product/*, /bag, /shipping-and-return)
app.use((_req, res) => {
  serveMainHtml(res);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('OUTFIT® server listening on http://0.0.0.0:' + PORT);
});
