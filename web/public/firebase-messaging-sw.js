/* Firebase Cloud Messaging service worker. Config arrives in the registration URL (?config=…). */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js')
const config = JSON.parse(new URL(self.location).searchParams.get('config') || '{}')
if (config.apiKey) {
  firebase.initializeApp(config)
  firebase.messaging() // notification payloads are displayed automatically
}
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const link = e.notification?.data?.FCM_MSG?.notification?.click_action || e.notification?.data?.link || '/notifications'
  e.waitUntil(clients.openWindow(link))
})
