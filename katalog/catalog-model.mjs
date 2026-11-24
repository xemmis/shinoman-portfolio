export const tireFields = ['width', 'profile', 'diameter'];
export const wheelFields = ['diameter', 'width', 'pcd', 'bore', 'offset'];

export function sizeLabel(type, variant) {
  return type === 'tires'
    ? `${variant.width}/${variant.profile} R${variant.diameter}`
    : `${variant.width}J × ${variant.diameter} · ${variant.pcd} · ET${variant.offset}`;
}

export function isCompatible(type, variant, vehicle) {
  const fields = type === 'tires' ? tireFields : wheelFields;
  return vehicle[type].some((fitment) => fields.every((key) => fitment[key] === variant[key])
    && (type !== 'tires' || variant.load >= fitment.load));
}

export function filterCatalog(items, { type, filters = {}, vehicle, sort = 'default' }) {
  const results = [];
  for (const item of items) {
    if (item.type !== type || (filters.brand && item.brand !== filters.brand)
      || (filters.kind && item.kind !== filters.kind)) continue;

    const variants = item.variants.filter((variant) =>
      (!vehicle || isCompatible(type, variant, vehicle))
      && Object.entries(filters).every(([field, value]) =>
        !value || field === 'brand' || field === 'kind' || String(variant[field]) === value));
    if (!variants.length) continue;

    results.push({ ...item, variants, price: Math.min(...variants.map(({ price }) => price)) });
  }

  if (sort === 'price-up') results.sort((a, b) => a.price - b.price);
  if (sort === 'price-down') results.sort((a, b) => b.price - a.price);
  return results;
}

const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const identifier = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);

function validDimensions(type, fitment) {
  if (!fitment || !positive(fitment.width) || !positive(fitment.diameter)) return false;
  if (type === 'tires') return positive(fitment.profile) && positive(fitment.load);
  return typeof fitment.pcd === 'string' && /^\d+x\d+(\.\d+)?$/.test(fitment.pcd)
    && positive(fitment.bore) && Number.isFinite(fitment.offset);
}

export function validateCatalog(data) {
  if (data?.version !== 1 || typeof data.demo !== 'boolean'
    || !Array.isArray(data.items) || !data.items.length || !Array.isArray(data.vehicles)) {
    throw new Error('Ожидается каталог версии 1 с товарами и списком автомобилей.');
  }

  const ids = new Set();
  const skus = new Set();
  for (const item of data.items) {
    if (!item || !identifier(item.id) || ids.has(item.id) || !['tires', 'wheels'].includes(item.type)
      || ![item.brand, item.name, item.kind].every(text) || !Array.isArray(item.variants) || !item.variants.length
      || (item.image !== undefined && (typeof item.image !== 'string'
        || !/^(?:images\/[a-z0-9-]+\.(?:svg|webp|png|jpg)|https:\/\/[^\s]+)$/.test(item.image)))) {
      throw new Error(`Проверьте карточку товара ${item?.id ?? 'без ID'}.`);
    }
    ids.add(item.id);
    for (const variant of item.variants) {
      if (!validDimensions(item.type, variant) || !identifier(variant.sku) || skus.has(variant.sku)
        || !Number.isSafeInteger(variant.price) || variant.price <= 0
        || (item.type === 'tires' && !text(variant.speed))) {
        throw new Error(`Проверьте характеристики, SKU и цену варианта ${variant?.sku ?? 'без SKU'}.`);
      }
      skus.add(variant.sku);
    }
  }

  const vehicleIds = new Set();
  for (const vehicle of data.vehicles) {
    if (!vehicle || !identifier(vehicle.id) || vehicleIds.has(vehicle.id)
      || ![vehicle.brand, vehicle.model, vehicle.trim].every(text)
      || !['tires', 'wheels'].every((type) => Array.isArray(vehicle[type]) && vehicle[type].length
        && vehicle[type].every((fitment) => validDimensions(type, fitment)))) {
      throw new Error(`Проверьте параметры автомобиля ${vehicle?.id ?? 'без ID'}.`);
    }
    vehicleIds.add(vehicle.id);
  }
  return data;
}

