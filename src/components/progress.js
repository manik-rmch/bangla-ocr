// Progress Bar: শতাংশ, অবস্থা ও বিবরণ
export function createProgress(root) {
  root.innerHTML = `
    <div class="progress card" hidden>
      <div class="pg-head"><span class="pg-status"></span><strong class="pg-pct">0%</strong></div>
      <div class="pg-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="pg-fill"></div>
      </div>
      <div class="pg-detail"></div>
    </div>`;
  const box = root.querySelector('.progress');
  const status = root.querySelector('.pg-status');
  const pct = root.querySelector('.pg-pct');
  const bar = root.querySelector('.pg-bar');
  const fill = root.querySelector('.pg-fill');
  const detail = root.querySelector('.pg-detail');

  return {
    show() { box.hidden = false; },
    hide() { box.hidden = true; },
    update({ percent, status: s, detail: d }) {
      if (typeof percent === 'number') {
        const p = Math.max(0, Math.min(100, Math.round(percent)));
        pct.textContent = p + '%';
        fill.style.width = p + '%';
        bar.setAttribute('aria-valuenow', String(p));
      }
      if (typeof s === 'string') status.textContent = s;
      if (typeof d === 'string') detail.textContent = d;
    },
    destroy() { root.innerHTML = ''; }
  };
}
