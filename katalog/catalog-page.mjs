import { filterCatalog, sizeLabel, validateCatalog } from './catalog-model.mjs';

const get = (id) => document.getElementById(id);
const type = document.body.dataset.catalog;
const sourceUrl = new URL('./data.json', import.meta.url);
const carBrand = get('car-brand');
const carModel = get('car-model');
const carTrim = get('car-trim');
const filterForm = get('filters');
const products = get('products');
const dialog = get('pickup-dialog');
const pickupSize = get('pickup-size');
const quantity = get('pickup-quantity');
const currency = new Intl.NumberFormat('ru-BY', { maximumFractionDigits: 2 });
const plural = new Intl.PluralRules('ru');
const alphabet = new Intl.Collator('ru', { numeric: true });
const price = (minorUnits) => `${currency.format(minorUnits / 100)} BYN`;
const dimensions = type === 'tires'
  ? [['kind', 'Сезон'], ['diameter', 'Диаметр, дюймы'], ['width', 'Ширина, мм'], ['profile', 'Профиль, %']]
  : [['kind', 'Тип диска'], ['diameter', 'Диаметр, дюймы'], ['pcd', 'Крепление (PCD)'],
    ['width', 'Ширина, J'], ['bore', 'Ступица (DIA), мм'], ['offset', 'Вылет (ET), мм']];
dimensions.push(['brand', 'Бренд']);

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function fillSelect(select, values, placeholder) {
  const options = values.map(([value, label]) => new Option(label, value));
  if (placeholder) options.unshift(new Option(placeholder, ''));
  select.replaceChildren(...options);
}

function options(values) {
  return [...new Set(values)].sort(alphabet.compare).map((value) => [value, value]);
}

function variantDescription(variant) {
  return type === 'tires'
    ? `${sizeLabel(type, variant)} · ${variant.load}${variant.speed}`
    : `${sizeLabel(type, variant)} · DIA ${variant.bore}`;
}

function openPickup(item) {
  get('pickup-product').textContent = `${item.brand} ${item.name}`;
  fillSelect(pickupSize, item.variants.map((variant) =>
    [variant.sku, `${variantDescription(variant)} · ${price(variant.price)}`]));
  const updateTotal = () => {
    const selection = item.variants.find(({ sku }) => sku === pickupSize.value);
    get('pickup-total').textContent = price(selection.price * Number(quantity.value));
  };
  quantity.value = '4';
  pickupSize.onchange = updateTotal;
  quantity.onchange = updateTotal;
  updateTotal();
  dialog.showModal();
}

function productCard(item) {
  const card = element('article', 'shop-card');
  const media = element('div', 'shop-card-media');
  const kind = element('span', 'shop-card-kind', item.kind);
  const placeholder = () => element('span', 'shop-no-photo', 'Фото появится позже');
  if (item.image) {
    const image = element('img');
    image.src = new URL(item.image, sourceUrl).href;
    image.alt = '';
    image.width = 260;
    image.height = 200;
    image.loading = 'lazy';
    image.addEventListener('error', () => image.replaceWith(placeholder()), { once: true });
    media.append(image);
  } else {
    media.append(placeholder());
  }
  media.append(kind);

  const body = element('div', 'shop-card-body');
  const heading = element('h3', '', `${item.brand} ${item.name}`);
  const sizes = element('ul', 'shop-card-info');
  sizes.setAttribute('aria-label', 'Доступные размеры');
  const labels = item.variants.map((variant) => type === 'tires'
    ? sizeLabel(type, variant) : `${variant.width}J × ${variant.diameter}`);
  for (const label of new Set(labels)) sizes.append(element('li', '', label));
  const detail = type === 'wheels'
    ? [...new Set(item.variants.map(({ pcd }) => pcd.replace('x', '×')))].join(' · ')
    : [...new Set(item.variants.map(({ load, speed }) => `${load}${speed}`))].join(' · ');
  const specs = element('p', 'shop-card-note', type === 'wheels' ? `PCD ${detail}` : `Индексы ${detail}`);
  const cost = element('p', 'shop-card-price');
  if (item.variants.some((variant) => variant.price !== item.price)) cost.append('от ');
  cost.append(element('strong', '', price(item.price)), ' / шт.');
  const button = element('button', 'button primary', 'Выбрать размер');
  button.type = 'button';
  button.setAttribute('aria-label', `Выбрать размер: ${item.brand} ${item.name}`);
  button.addEventListener('click', () => openPickup(item));
  body.append(heading, sizes, specs, cost, button);
  card.append(media, body);
  return card;
}

function mount({ items, vehicles, demo }) {
  const group = items.filter((item) => item.type === type);
  get('demo-note').hidden = !demo;
  if (matchMedia('(max-width: 600px)').matches) document.querySelector('.shop-filters').open = false;
  const locationUrl = new URL(window.location.href);
  const initial = vehicles.find((vehicle) => vehicle.id === locationUrl.searchParams.get('car'));

  function updateCarFields(brand = '', model = '', trim = '') {
    const models = vehicles.filter((vehicle) => vehicle.brand === brand);
    const trims = models.filter((vehicle) => vehicle.model === model);
    carBrand.value = brand;
    fillSelect(carModel, options(models.map((vehicle) => vehicle.model)), 'Выберите модель');
    fillSelect(carTrim, trims.map((vehicle) => [vehicle.id, vehicle.trim]), 'Выберите версию');
    carModel.disabled = !brand;
    carTrim.disabled = !model;
    carModel.value = model;
    carTrim.value = trim;
  }

  function updateLinks(vehicle) {
    for (const link of document.querySelectorAll('[data-catalog-link]')) {
      const target = new URL(link.href);
      if (vehicle) target.searchParams.set('car', vehicle.id);
      else target.searchParams.delete('car');
      link.href = target.href;
    }
    if (vehicle) locationUrl.searchParams.set('car', vehicle.id);
    else locationUrl.searchParams.delete('car');
    if (locationUrl.href !== window.location.href) history.replaceState(null, '', locationUrl.href);
  }

  function render() {
    const filters = Object.fromEntries(new FormData(filterForm));
    const vehicle = vehicles.find(({ id }) => id === carTrim.value);
    const sort = get('sort').value;
    const matches = filterCatalog(group, { type, filters, vehicle, sort });
    if (sort === 'name') matches.sort((a, b) => alphabet.compare(`${a.brand} ${a.name}`, `${b.brand} ${b.name}`));
    const count = matches.length;
    const word = { one: 'модель', few: 'модели', many: 'моделей' }[plural.select(count)] ?? 'модели';
    get('results-count').textContent = `${count} ${word}`;
    products.replaceChildren(...matches.map(productCard));
    get('empty').hidden = count > 0;

    const fitment = get('fitment-result');
    fitment.hidden = !vehicle;
    if (vehicle) {
      const clear = element('button', 'shop-reset', 'Убрать автомобиль');
      clear.type = 'button';
      clear.addEventListener('click', () => {
        updateCarFields();
        render();
        carBrand.focus();
      });
      fitment.replaceChildren(
        element('strong', '', `${vehicle.brand} ${vehicle.model}`),
        demo ? ' · подбор по тестовым параметрам.' : ' · подбор по параметрам из базы.',
        clear,
      );
    }
    updateLinks(vehicle);
  }

  for (const [key, label] of dimensions) {
    const field = element('label', '', label);
    const select = element('select');
    select.name = key;
    const values = ['kind', 'brand'].includes(key)
      ? group.map((item) => item[key]) : group.flatMap((item) => item.variants.map((variant) => variant[key]));
    fillSelect(select, options(values), 'Все');
    field.append(select);
    get('filter-fields').append(field);
  }

  fillSelect(carBrand, options(vehicles.map((vehicle) => vehicle.brand)), 'Выберите марку');
  updateCarFields(initial?.brand, initial?.model, initial?.id);
  carBrand.addEventListener('change', () => { updateCarFields(carBrand.value); render(); });
  carModel.addEventListener('change', () => { updateCarFields(carBrand.value, carModel.value); render(); });
  carTrim.addEventListener('change', render);
  filterForm.addEventListener('change', render);
  filterForm.addEventListener('submit', (event) => event.preventDefault());
  filterForm.addEventListener('reset', () => queueMicrotask(render));
  get('sort').addEventListener('change', render);
  get('clear-all').addEventListener('click', () => {
    updateCarFields();
    get('sort').value = 'default';
    filterForm.reset();
    carBrand.focus();
  });
  render();
}

try {
  const response = await fetch(sourceUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Каталог: HTTP ${response.status}`);
  mount(validateCatalog(await response.json()));
} catch (error) {
  console.error(error);
  get('results-count').textContent = 'Каталог временно недоступен.';
  products.append(element('p', 'shop-load-error', 'Обновите страницу, чтобы попробовать снова.'));
}

