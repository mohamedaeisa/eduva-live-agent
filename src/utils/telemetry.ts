
/**
 * Collects technical telemetry about the user's device and session.
 * @param {Object} geoData - Optional server-provided geo data { ip, city, country }
 */
export const collectDeviceMetadata = (geoData: { ip?: string; city?: string; country?: string } = {}) => {
  const nav = window.navigator as any;
  const screen = window.screen;

  // Basic heuristic for device type
  const ua = nav.userAgent;
  let deviceType = "Desktop";
  if (/Mobi|Android/i.test(ua)) deviceType = "Mobile";
  else if (/Tablet|iPad/i.test(ua)) deviceType = "Tablet";

  return {
    browser: getBrowserName(ua),
    os: getOS(ua),
    deviceType,
    deviceModel: "Unknown", // Hard to get accurately from browser JS alone
    userAgent: ua,
    userAgentFull: ua,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: nav.language || nav.userLanguage,
    referrer: document.referrer || "Direct",
    connectionType: nav.connection ? nav.connection.effectiveType : "unknown",
    ipAddress: geoData.ip || null,
    city: geoData.city || null,
    country: geoData.country || null,
  };
};

// Helpers
function getBrowserName(ua: string) {
  if (ua.indexOf("Chrome") > -1) return "Chrome";
  if (ua.indexOf("Safari") > -1) return "Safari";
  if (ua.indexOf("Firefox") > -1) return "Firefox";
  if (ua.indexOf("MSIE") > -1 || ua.indexOf("Trident/") > -1) return "Internet Explorer";
  return "Unknown";
}

function getOS(ua: string) {
  if (ua.indexOf("Win") > -1) return "Windows";
  if (ua.indexOf("Mac") > -1) return "MacOS";
  if (ua.indexOf("Linux") > -1) return "Linux";
  if (ua.indexOf("Android") > -1) return "Android";
  if (ua.indexOf("like Mac") > -1) return "iOS";
  return "Unknown";
}
