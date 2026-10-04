// service-worker.js

const CACHE_VERSION = 'quiz-cache-v3';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './images/church-logo.jpg',
  './js/qrcode.min.js'
];

const CORE_ASSET_URLS = CORE_ASSETS.map(
  path => new URL(path, self.location).toString()
);


// =========================
// INSTALL
// =========================

self.addEventListener('install', event => {

  event.waitUntil(

    (async () => {

      const cache =
        await caches.open(CACHE_VERSION);

      await Promise.all(

        CORE_ASSET_URLS.map(async url => {

          try {

            const response =
              await fetch(url, {
                cache: 'no-cache'
              });

            if (response && response.ok) {

              await cache.put(
                url,
                response
              );

            }

          } catch (error) {

            console.log(
              'تعذر تخزين:',
              url
            );

          }

        })

      );

      self.skipWaiting();

    })()

  );

});


// =========================
// ACTIVATE
// =========================

self.addEventListener('activate', event => {

  event.waitUntil(

    (async () => {

      const cacheNames =
        await caches.keys();

      await Promise.all(

        cacheNames
          .filter(name =>
            name !== CACHE_VERSION
          )
          .map(name =>
            caches.delete(name)
          )

      );

      await self.clients.claim();

    })()

  );

});


// =========================
// FETCH
// =========================

self.addEventListener('fetch', event => {

  const request = event.request;

  if (
    request.method !== 'GET' ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return;
  }


  // =========================
  // صفحات HTML
  // =========================

  if (
    request.mode === 'navigate' ||
    request.destination === 'document'
  ) {

    event.respondWith(

      (async () => {

        const cache =
          await caches.open(CACHE_VERSION);

        try {

          // الشبكة أولًا
          const networkResponse =
            await fetch(request, {
              cache: 'no-store'
            });

          if (
            networkResponse &&
            networkResponse.ok
          ) {

            await cache.put(
              request,
              networkResponse.clone()
            );

          }

          return networkResponse;

        } catch (error) {

          // لو مفيش نت استخدم النسخة المحفوظة
          const cached =
            await cache.match(request);

          if (cached) {
            return cached;
          }


          const indexURL =
            new URL(
              './index.html',
              self.location
            ).toString();

          const cachedIndex =
            await cache.match(indexURL);

          if (cachedIndex) {
            return cachedIndex;
          }


          return new Response(
            '<h1 dir="rtl">لا يوجد اتصال بالإنترنت ولا توجد نسخة محفوظة.</h1>',
            {
              headers: {
                'Content-Type':
                  'text/html; charset=UTF-8'
              }
            }
          );

        }

      })()

    );

    return;
  }


  // =========================
  // الملفات الأخرى
  // =========================

  event.respondWith(

    (async () => {

      const cache =
        await caches.open(CACHE_VERSION);

      const cached =
        await cache.match(request);

      if (cached) {
        return cached;
      }

      try {

        const networkResponse =
          await fetch(request);

        if (
          networkResponse &&
          networkResponse.ok
        ) {

          await cache.put(
            request,
            networkResponse.clone()
          );

        }

        return networkResponse;

      } catch (error) {

        return new Response(
          '',
          {
            status: 504,
            statusText:
              'Offline and not cached'
          }
        );

      }

    })()

  );

});
