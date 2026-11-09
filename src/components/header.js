// উপরের Header: Logo, Home, About, Help
const LINKS = [
  { route: 'home', href: '#/', label: 'Home' },
  { route: 'about', href: '#/about', label: 'About' },
  { route: 'help', href: '#/help', label: 'Help' }
];

export function renderHeader(activeRoute) {
  const links = LINKS.map(
    (l) => `<a href="${l.href}" class="${l.route === activeRoute ? 'active' : ''}">${l.label}</a>`
  ).join('');
  return `
    <header class="header">
      <div class="wrap">
        <a class="logo" href="#/">বাংলা OCR Studio</a>
        <nav class="nav" aria-label="প্রধান মেনু">${links}</nav>
      </div>
    </header>`;
}

export function renderFooter() {
  return `<footer class="footer">🔒 OCR Processing আপনার Browser-এই হয়। আপনার PDF বা ছবি কোনো সার্ভারে পাঠানো হয় না।</footer>`;
}
