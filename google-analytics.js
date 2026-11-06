// GA4 (G-SP3LYPYCXC) is a destination of the www.capriole.ai Google tag, so Docs load that tag;
// the G- ID's own container has no GA4 tags and sends nothing.
// Enhanced measurement sends the page views, including Mintlify's client-side navigations.
const googleTagId = 'AW-18486045693';
const googleTagScript = document.createElement('script');
googleTagScript.src = `https://www.googletagmanager.com/gtag/js?id=${googleTagId}`;
googleTagScript.async = true;
document.head.appendChild(googleTagScript);

window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag('js', new Date());
gtag('config', googleTagId);
