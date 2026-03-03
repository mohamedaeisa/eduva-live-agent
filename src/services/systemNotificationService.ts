export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) return false;
  
  if (Notification.permission === 'granted') return true;
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  return false;
};

export const sendSystemNotification = (title: string, body: string) => {
  if (!('Notification' in window)) return;
  
  if (Notification.permission === 'granted') {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          body,
          icon: './logo.svg',
          badge: './logo.svg',
          vibrate: [200, 100, 200],
          tag: 'eduva-gen-complete',
          renotify: true,
          data: { url: window.location.href }
        } as any);
      });
    } else {
      new Notification(title, {
        body,
        icon: './logo.svg',
      });
    }
  }
};