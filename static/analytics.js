// Extracted from app.html so the CSP can use `script-src 'self'` instead of
// `unsafe-inline`, which would otherwise permit any injected inline script.
window.dataLayer = window.dataLayer || [];
function gtag() {
	dataLayer.push(arguments);
}

gtag('js', new Date());
gtag('config', 'G-H3R7JRFG7D');
