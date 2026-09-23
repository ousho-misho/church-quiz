// service-worker.js
// يعمل هذا الملف من نفس مجلد index.html، لذلك كل المسارات هنا نسبية له.
// هذا يضمن أنه يعمل سواء كان المشروع منشورًا على:
//   https://username.github.io/          (دومين رئيسي)
// أو على:
//   https://username.github.io/REPO/     (مشروع داخل مسار فرعي)
// لأننا لا نفترض أبدًا أن الموقع على جذر الدومين "/".

const CACHE_VERSION = 'quiz-cache-v2';

// نبني قائمة الملفات المطلوب تخزينها اعتمادًا على مكان هذا الملف نفسه (self.location)
// بدلاً من كتابة مسارات مطلقة تبدأ بـ "/"، حتى تعمل تحت أي مسار فرعي في GitHub Pages.
const BASE_PATH = new URL('./', self.location).pathname;

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './images/church-logo.jpg',
  './js/qrcode.min.js'
];

// نحوّلها إلى روابط مطلقة (Absolute URL objects) مبنية على مكان هذا الملف
// حتى تُخزَّن وتُقارَن بشكل صحيح داخل الـ Cache Storage.
const CORE_ASSET_URLS = CORE_ASSETS.map((path) => new URL(path, self.location).toString());

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // نستخدم إضافة كل ملف على حدة بدلاً من cache.addAll دفعة واحدة،
      // حتى لو فشل تحميل ملف واحد (مثلاً بسبب اسم أو مسار خاطئ)، لا يفشل التثبيت بالكامل.
      await Promise.all(
        CORE_ASSET_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'no-cache' });
            if (response && response.ok) {
              await cache.put(url, response);
            } else {
              console.error('[service-worker] فشل تحميل الملف أثناء التخزين المسبق:', url);
            }
          } catch (err) {
            console.error('[service-worker] خطأ أثناء تخزين الملف:', url, err);
          }
        })
      );
      // يجعل النسخة الجديدة من الـ Service Worker تعمل فورًا دون انتظار إغلاق كل التبويبات.
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // نتعامل فقط مع طلبات GET من نفس الأصل (نفس الموقع)، ونترك أي شيء آخر (لو وُجد) للمتصفح كالمعتاد.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // طلبات التنقل بين الصفحات (مثال: فتح رابط GitHub Pages مباشرة، أو تحديث الصفحة)
  // نعالجها بشكل خاص: نحاول الشبكة أولاً إن كانت متاحة (لأخذ أحدث نسخة)،
  // فإن فشلت (لا يوجد إنترنت) نرجع فورًا لملف index.html المخزَّن مسبقًا.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            cache.put(new URL('./index.html', self.location).toString(), networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          const cachedIndex = await cache.match(new URL('./index.html', self.location).toString());
          if (cachedIndex) {
            return cachedIndex;
          }
          const cachedRequest = await cache.match(request);
          if (cachedRequest) {
            return cachedRequest;
          }
          return new Response(
            '<h1 dir="rtl" style="font-family:Tahoma">لا يوجد اتصال بالإنترنت ولا توجد نسخة مخزنة من الصفحة بعد.</h1>',
            { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
          );
        }
      })()
    );
    return;
  }

  // لكل الملفات الثابتة الأخرى (CSS/JS/صور/manifest...): استراتيجية "الكاش أولاً".
  // إن وُجد الملف في الكاش نُعيده فورًا بدون أي طلب شبكة (وهذا هو المطلوب للعمل أوفلاين).
  // إن لم يوجد، نحاول الشبكة، ونخزّن النتيجة لأي استخدام قادم أوفلاين.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        // لا يوجد إنترنت ولا يوجد الملف في الكاش: فشل واضح بدون كسر الصفحة بالكامل.
        console.error('[service-worker] الملف غير متاح أوفلاين ولم يُخزَّن مسبقًا:', request.url);
        return new Response('', { status: 504, statusText: 'Offline and not cached' });
      }
    })()
  );
});
