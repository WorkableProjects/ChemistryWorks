// Apply the saved theme before first paint (js/lib/theme.js takes over once the app loads).
(function () {
  try {
    var d = document.documentElement, ls = window.localStorage;
    var t = JSON.parse(ls.getItem('cw:theme') || '"system"');
    var admin = /[?&]admin=true/.test(location.search);
    var a = JSON.parse(ls.getItem(admin ? 'cw:accent:admin' : 'cw:accent:student') || 'null') || 'navy';
    d.dataset.theme = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    d.dataset.accent = a;
    d.dataset.role = admin ? 'admin' : 'student';
  } catch (e) { /* storage blocked: defaults apply */ }
})();
