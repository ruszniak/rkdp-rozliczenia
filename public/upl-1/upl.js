// Instrukcja UPL-1: ?sposob=ezus|edoreczenia|papier wyróżnia sposób polecony w e-mailu, ?us=… pokazuje urząd skarbowy klienta.
(() => {
  const q = new URLSearchParams(location.search);
  const way = q.get('sposob');
  if (['ezus', 'edoreczenia', 'papier'].includes(way)) {
    document.querySelector(`.ways a[data-way="${way}"]`)?.classList.add('on');
    const sec = document.getElementById(way);
    if (sec) {
      sec.classList.add('on');
      sec.parentNode.insertBefore(sec, document.getElementById('ezus'));   // polecony sposób na początku
    }
  }
  const us = (q.get('us') || '').slice(0, 120);
  if (us) { document.getElementById('us-name').textContent = us; document.getElementById('us-box').hidden = false; }
})();
