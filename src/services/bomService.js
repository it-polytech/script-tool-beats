const STOP_ITEMS = new Set([
  '128362-S-PO',
  '128275-S-PO',
  '129550-S-PO',
  '128244-S-PO',
  '128274-S-PO',
  '128247-S-03-PO',
  '110736'
]);

function buildFathersByChild(bomLinks) {
  const fathersByChild = new Map();

  for (const row of bomLinks) {
    const childItem = String(row.child_item || '').trim();
    const fatherItem = String(row.father_item || '').trim();
    const quantity = Number(row.quantity || 0);

    if (!childItem || !fatherItem || quantity === 0) {
      continue;
    }

    if (!fathersByChild.has(childItem)) {
      fathersByChild.set(childItem, []);
    }

    fathersByChild.get(childItem).push({
      fatherItem,
      quantity
    });
  }

  return fathersByChild;
}

function resolveBomFathers({
  itemCode,
  fathersByChild,
  currentQty = 1,
  level = 0,
  path = []
}) {
  const cleanItemCode = String(itemCode || '').trim();
  const results = [];

  if (!cleanItemCode) return results;
  if (path.includes(cleanItemCode)) return results;
  if (STOP_ITEMS.has(cleanItemCode)) return results;
  if (!fathersByChild.has(cleanItemCode)) return results;

  const nextPath = [...path, cleanItemCode];

  for (const link of fathersByChild.get(cleanItemCode)) {
    const fatherItem = String(link.fatherItem || '').trim();
    const qty = Number(link.quantity || 0);

    if (!fatherItem || qty === 0) {
      continue;
    }

    if (nextPath.includes(fatherItem)) {
      continue;
    }

    const bomQty = currentQty * qty;
    const fatherPath = [...nextPath, fatherItem];

    results.push({
      father_item: fatherItem,
      bom_qty: bomQty,
      bom_level: level + 1,
      bom_path: fatherPath.join('>')
    });

    const upperFathers = resolveBomFathers({
      itemCode: fatherItem,
      fathersByChild,
      currentQty: bomQty,
      level: level + 1,
      path: fatherPath
    });

    results.push(...upperFathers);
  }

  return results;
}

module.exports = {
  buildFathersByChild,
  resolveBomFathers
};