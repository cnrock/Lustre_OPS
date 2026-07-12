(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (node) => (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();
  const visible = (node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const labelOf = (node, index) => (
    node.getAttribute('aria-label') ||
    node.getAttribute('title') ||
    text(node) ||
    `${node.tagName.toLowerCase()}#${index}`
  ).trim();
  const closeOverlay = async () => {
    const candidates = Array.from(document.querySelectorAll('button')).filter((button) => {
      const label = labelOf(button, 0);
      return ['取消', '关闭弹窗', '关闭', 'Close'].some((item) => label.includes(item));
    });
    const target = candidates.find(visible);
    if (target) target.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(150);
  };

  const results = [];
  const skipped = [];
  const controls = Array.from(document.querySelectorAll('main button, header button, [role="button"]'))
    .filter(visible)
    .map((node, index) => ({
      index,
      node,
      label: labelOf(node, index),
      disabled: Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true'),
    }));

  for (const control of controls) {
    if (control.disabled) {
      skipped.push({ label: control.label, reason: 'disabled' });
      continue;
    }
    if (/删除|清除|卸载|确认重置|移除/.test(control.label)) {
      skipped.push({ label: control.label, reason: 'dangerous' });
      continue;
    }
    const beforeUrl = location.href;
    const beforeDialogs = document.querySelectorAll('[role="dialog"]').length;
    const beforeStatus = Array.from(document.querySelectorAll('[role="status"], [role="alert"]')).map(text).filter(Boolean).join(' | ');
    const beforeText = text(document.body).slice(0, 1200);
    let error = null;
    try {
      control.node.click();
      await sleep(450);
    } catch (event) {
      error = String(event?.message || event);
    }
    const afterDialogs = document.querySelectorAll('[role="dialog"]').length;
    const afterStatus = Array.from(document.querySelectorAll('[role="status"], [role="alert"]')).map(text).filter(Boolean).join(' | ');
    const afterText = text(document.body).slice(0, 1200);
    const changed = beforeUrl !== location.href || beforeDialogs !== afterDialogs || beforeStatus !== afterStatus || beforeText !== afterText;
    results.push({
      label: control.label,
      beforeUrl,
      afterUrl: location.href,
      dialogsAfter: afterDialogs,
      statusAfter: afterStatus,
      changed,
      error,
    });
    if (afterDialogs > 0) await closeOverlay();
  }

  const selects = Array.from(document.querySelectorAll('select')).filter(visible).map((node, index) => ({
    index,
    label: node.getAttribute('aria-label') || node.previousElementSibling?.textContent?.trim() || `select#${index}`,
    optionCount: node.options.length,
    value: node.value,
  }));
  const inputs = Array.from(document.querySelectorAll('input, textarea')).filter(visible).map((node, index) => ({
    index,
    label: node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.previousElementSibling?.textContent?.trim() || `${node.tagName.toLowerCase()}#${index}`,
    valueLength: node.value?.length || 0,
    disabled: Boolean(node.disabled || node.getAttribute('aria-disabled') === 'true'),
  }));

  return {
    url: location.href,
    title: document.title,
    buttonsSeen: controls.length,
    clicked: results.length,
    skipped,
    results,
    selects,
    inputs,
    dialogsOpen: document.querySelectorAll('[role="dialog"]').length,
    bodySample: text(document.body).slice(0, 500),
  };
})()
