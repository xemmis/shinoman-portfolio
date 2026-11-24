# Graph Report - shinoman-portfolio  (2026-11-24)

## Corpus Check
- Corpus is ~8,318 words - fits in a single context window. You may not need a graph.

## Summary
- 140 nodes · 229 edges · 6 communities
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Запись на шиномонтаж
- Размеры и совместимость
- Интернет-витрина · catalog-page.mjs
- HTTP и расписание
- Интернет-витрина · Диски · страница каталога
- Главная и калькулятор

## God Nodes (most connected - your core abstractions)
1. `showWeek()` - 10 edges
2. `mount()` - 9 edges
3. `render()` - 9 edges
4. `Шиноман · магазин и шиномонтаж` - 9 edges
5. `filterCatalog()` - 8 edges
6. `validateCatalog()` - 8 edges
7. `openPickup()` - 8 edges
8. `productCard()` - 7 edges
9. `book()` - 7 edges
10. `Страница записи на шиномонтаж` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Форма записи на выбранное время` --conceptually_related_to--> `book()`  [INFERRED]
  zapis-na-shinomontazh/index.html → server.mjs
- `Модель товара и размерные SKU` --conceptually_related_to--> `productCard()`  [INFERRED]
  README.md → katalog/catalog-page.mjs
- `Совместимость с версией автомобиля` --conceptually_related_to--> `isCompatible()`  [INFERRED]
  README.md → katalog/catalog-model.mjs
- `Диски · фильтры и сортировка` --implements--> `filterCatalog()`  [INFERRED]
  katalog/diski/index.html → katalog/catalog-model.mjs
- `Шины · фильтры и сортировка` --implements--> `filterCatalog()`  [INFERRED]
  katalog/shiny/index.html → katalog/catalog-model.mjs

## Import Cycles
- None detected.

## Communities (6 total, 0 thin omitted)

### Community 0 - "Запись на шиномонтаж"
Cohesion: 0.08
Nodes (31): api, button(), byId(), configuredApi, dateLabel, days, daysList, dialog (+23 more)

### Community 1 - "Размеры и совместимость"
Cohesion: 0.09
Nodes (14): identifier(), isCompatible(), positive(), text(), tireFields, validateCatalog(), validDimensions(), wheelFields (+6 more)

### Community 2 - "Интернет-витрина · catalog-page.mjs"
Cohesion: 0.13
Nodes (26): filterCatalog(), sizeLabel(), alphabet, carBrand, carModel, carTrim, currency, dialog (+18 more)

### Community 3 - "HTTP и расписание"
Cohesion: 0.12
Nodes (21): addDays(), book(), catalog, catalogImages, databasePath, db, findRequest, hours (+13 more)

### Community 4 - "Интернет-витрина · Диски · страница каталога"
Cohesion: 0.16
Nodes (11): Калькулятор услуг, Главная шиномонтажа, Диски · фильтры и сортировка, Диски · выбор марки, модели и версии, Диски · страница каталога, Шины · фильтры и сортировка, Шины · страница каталога, Шины · выбор марки, модели и версии (+3 more)

### Community 5 - "Главная и калькулятор"
Cohesion: 0.36
Nodes (6): calculate(), currentEstimate(), diameters, services, showTotal(), update()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Страница записи на шиномонтаж` connect `Интернет-витрина · Диски · страница каталога` to `Запись на шиномонтаж`?**
  _High betweenness centrality (0.399) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `filterCatalog()` (e.g. with `Диски · фильтры и сортировка` and `Шины · фильтры и сортировка`) actually correct?**
  _`filterCatalog()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `Запись на шиномонтаж` be split into smaller, more focused modules?**
  _Cohesion score 0.0766488413547237 - nodes in this community are weakly interconnected._
- **Why does `Главная шиномонтажа` connect `Интернет-витрина · Диски · страница каталога` to `Размеры и совместимость`, `Главная и калькулятор`?**
  _High betweenness centrality (0.188) - this node is a cross-community bridge._
- **Should `Размеры и совместимость` be split into smaller, more focused modules?**
  _Cohesion score 0.09462365591397849 - nodes in this community are weakly interconnected._
- **Why does `Шины · страница каталога` connect `Интернет-витрина · Диски · страница каталога` to `Интернет-витрина · catalog-page.mjs`?**
  _High betweenness centrality (0.146) - this node is a cross-community bridge._
- **Should `Интернет-витрина · catalog-page.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.12962962962962962 - nodes in this community are weakly interconnected._