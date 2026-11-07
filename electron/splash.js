// Called from the main process via executeJavaScript.
window.setStatus = (status, percent, sub) => {
  document.getElementById('status').textContent = status;
  document.getElementById('sub').textContent = sub || '';
  const bar = document.getElementById('bar');
  const fill = document.getElementById('fill');
  if (percent === null || percent === undefined) {
    bar.classList.add('indeterminate');
    fill.style.width = '';
  } else {
    bar.classList.remove('indeterminate');
    fill.style.width = `${Math.max(2, Math.min(100, percent))}%`;
  }
};
