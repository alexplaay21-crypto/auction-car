// lib/catalog.js — стартовый каталог (дальше всё меняется в админке Mini App).
// Марки и модели вымышленные: реальные названия автопроизводителей — товарные знаки,
// их использование в игре без лицензии рискованно (особенно с платежами). Машины
// «в духе» японских, немецких, американских и итальянских, рисунки — собственные.
// Цены подобраны так, чтобы средняя ценность контейнера была выше стартовой ставки.
// Шансы редкости (миграция 5): обычная 74%, редкая 21,5%, эпическая 4%, легендарная 0,5%.

export const GARAGE_TIERS = [[20, 25_000], [25, 50_000], [30, 100_000], [35, 150_000], [40, 300_000], [45, 400_000], [50, 500_000]];

export const CONTAINERS = [
  { name: 'Японский контейнер', country: 'Япония', emoji: '🇯🇵', flag: 'jp', price: 4_000 },
  { name: 'Немецкий контейнер', country: 'Германия', emoji: '🇩🇪', flag: 'de', price: 5_000 },
  { name: 'Американский контейнер', country: 'США', emoji: '🇺🇸', flag: 'us', price: 5_000 },
  { name: 'Итальянский контейнер', country: 'Италия', emoji: '🇮🇹', flag: 'it', price: 8_000 },
];

// Миграция 3: ещё четыре страны — контейнеры 5–8.
export const CONTAINERS_V3 = [
  { name: 'Российский контейнер', country: 'Россия', emoji: '🇷🇺', flag: 'ru', price: 3_000 },
  { name: 'Китайский контейнер', country: 'Китай', emoji: '🇨🇳', flag: 'cn', price: 3_500 },
  { name: 'Французский контейнер', country: 'Франция', emoji: '🇫🇷', flag: 'fr', price: 4_500 },
  { name: 'Контейнер «Весь мир»', country: 'Другие страны', emoji: '🌍', flag: 'world', price: 7_000 },
];
export const ALL_CONTAINERS = [...CONTAINERS, ...CONTAINERS_V3];

// container — номер контейнера (с 1), speed км/ч, accel с до 100, power л.с.,
// handling и reliability — шкала 0–100, body — силуэт на рисунке.
// legacy — прежнее название (миграция 2 переименовывает, если админ его не менял).
const car = (container, rarity, name, legacy, speed, accel, power, handling, reliability, price, color, body) =>
  ({ container, rarity, name, legacy, country: ALL_CONTAINERS[container - 1].country, speed, accel, power, handling, reliability, price, color, body });

export const CATALOG = [
  car(1, 'common', 'Kaito Sora', 'Toyota Corolla', 195, 9.8, 132, 55, 92, 2_500, '#d7dce3', 'sedan'),
  car(1, 'common', 'Hoshi Mira', 'Honda Civic', 200, 8.9, 158, 62, 88, 3_000, '#2f6fde', 'hatch'),
  car(1, 'common', 'Kaito Akari', 'Nissan Almera', 185, 11.2, 102, 50, 80, 2_000, '#9aa3ad', 'wagon'),
  car(1, 'rare', 'Ryujin Kaze RS', 'Subaru Impreza WRX STI', 255, 5.2, 300, 80, 74, 9_000, '#1d4fa8', 'sedan'),
  car(1, 'rare', 'Hoshi Raiden R', 'Mitsubishi Lancer Evolution IX', 250, 4.9, 286, 82, 70, 10_000, '#e8e8e8', 'sedan'),
  car(1, 'epic', 'Kaito Tsunami GT', 'Toyota Supra A80', 285, 4.6, 330, 78, 84, 32_000, '#f0a020', 'coupe'),
  car(1, 'epic', 'Ryujin Shogun R', 'Nissan Skyline GT-R R34', 280, 4.4, 330, 86, 76, 38_000, '#3a5fcf', 'coupe'),
  car(1, 'mythic', 'Hoshi Kirin V10', 'Lexus LFA', 325, 3.6, 560, 90, 88, 220_000, '#f2f2f2', 'super'),

  car(2, 'common', 'Rhein Stadt', 'Volkswagen Golf', 210, 8.5, 150, 64, 86, 3_000, '#c9ccd1', 'hatch'),
  car(2, 'common', 'Adler Kompakt', 'Opel Astra', 205, 9.4, 140, 58, 78, 2_500, '#7a8794', 'hatch'),
  car(2, 'common', 'Kessler K3', 'BMW 3 E46', 225, 7.8, 192, 70, 72, 4_000, '#202428', 'sedan'),
  car(2, 'rare', 'Adler Allrad RS', 'Audi RS4', 280, 4.1, 450, 80, 78, 12_000, '#8a95a0', 'wagon'),
  car(2, 'rare', 'Kessler K63', 'Mercedes-Benz C63 AMG', 290, 4.0, 476, 76, 76, 14_000, '#101215', 'sedan'),
  car(2, 'epic', 'Kessler K5 Turbo', 'BMW M5 F90', 305, 3.3, 600, 84, 80, 45_000, '#4a6b8a', 'sedan'),
  car(2, 'epic', 'Rhein Falke S', 'Porsche 911 Carrera', 293, 4.2, 385, 92, 86, 52_000, '#c8102e', 'coupe'),
  car(2, 'mythic', 'Rhein Blitz Hybrid', 'Porsche 918 Spyder', 345, 2.6, 887, 96, 84, 350_000, '#e6e6e6', 'super'),

  car(3, 'common', 'Liberty Rider', 'Ford Focus', 200, 9.2, 150, 60, 80, 2_500, '#2b5cab', 'hatch'),
  car(3, 'common', 'Eagle Cruiser', 'Chevrolet Cruze', 195, 10.0, 140, 56, 78, 2_200, '#b9bec4', 'suv'),
  car(3, 'common', 'Liberty Dash', 'Dodge Caliber', 190, 10.5, 158, 52, 74, 2_800, '#b3202a', 'hatch'),
  car(3, 'rare', 'Stallion GT', 'Ford Mustang GT', 250, 4.5, 450, 70, 78, 11_000, '#d4241f', 'coupe'),
  car(3, 'rare', 'Eagle Thunder SS', 'Chevrolet Camaro SS', 250, 4.2, 455, 72, 76, 11_500, '#f3c400', 'coupe'),
  car(3, 'epic', 'Stallion Hellfire', 'Dodge Challenger SRT Hellcat', 320, 3.6, 717, 66, 72, 40_000, '#1a1a1a', 'coupe'),
  car(3, 'epic', 'Eagle Vortex Z', 'Chevrolet Corvette C8', 312, 2.9, 495, 88, 80, 48_000, '#f26b1d', 'super'),
  car(3, 'mythic', 'Liberty Spirit GT', 'Ford GT', 348, 3.0, 656, 92, 82, 300_000, '#1c3f94', 'super'),

  car(4, 'common', 'Lupo Città', 'Fiat Punto', 180, 11.5, 95, 54, 70, 2_000, '#e0e0e0', 'hatch'),
  car(4, 'common', 'Lupo Cinque', 'Fiat 500', 160, 12.5, 69, 58, 72, 1_800, '#5ec6c0', 'hatch'),
  car(4, 'common', 'Veloce Sprint', 'Alfa Romeo 147', 205, 9.0, 150, 64, 64, 3_200, '#a3101b', 'hatch'),
  car(4, 'rare', 'Veloce Quadro', 'Alfa Romeo Giulia Quadrifoglio', 307, 3.9, 510, 86, 68, 16_000, '#b0131d', 'sedan'),
  car(4, 'rare', 'Lupo Gran Turismo', 'Maserati Ghibli', 285, 4.9, 430, 74, 70, 15_000, '#1b2c52', 'sedan'),
  car(4, 'epic', 'Toro Furia', 'Ferrari 488 GTB', 330, 3.0, 670, 92, 78, 70_000, '#d40000', 'super'),
  car(4, 'epic', 'Toro Tempesta', 'Lamborghini Huracán', 325, 2.9, 640, 90, 76, 75_000, '#9ccc2a', 'super'),
  car(4, 'mythic', 'Veloce Leggenda', 'Ferrari LaFerrari', 350, 2.4, 963, 97, 80, 450_000, '#c00000', 'super'),
];

// Машины контейнеров 5–8 (миграция 3), номера 33–64.
export const CATALOG_V3 = [
  car(5, 'common', 'Neva Sputnik', null, 165, 13.5, 80, 48, 70, 1_200, '#c9d1d9', 'hatch'),
  car(5, 'common', 'Volna Classic', null, 155, 16.0, 75, 42, 66, 1_000, '#2f4f6f', 'sedan'),
  car(5, 'common', 'Taiga 4x4', null, 140, 17.0, 83, 50, 82, 1_600, '#3c5a3a', 'suv'),
  car(5, 'rare', 'Ural Strela', null, 210, 8.9, 170, 66, 72, 5_500, '#8b0000', 'sedan'),
  car(5, 'rare', 'Baikal Sport', null, 225, 7.6, 210, 70, 68, 6_500, '#1f6feb', 'coupe'),
  car(5, 'epic', 'Kosmos GT', null, 265, 5.4, 340, 78, 74, 24_000, '#e6e6e6', 'coupe'),
  car(5, 'epic', 'Sever Bronya', null, 210, 6.9, 420, 60, 92, 28_000, '#1a1a1a', 'suv'),
  car(5, 'mythic', 'Zarya Imperator', null, 250, 5.5, 598, 70, 96, 160_000, '#0d0d0d', 'sedan'),

  car(6, 'common', 'Longwei Q3', null, 175, 11.8, 110, 52, 74, 1_500, '#e04b3a', 'hatch'),
  car(6, 'common', 'Huoyan S5', null, 185, 10.5, 140, 55, 76, 1_900, '#ececec', 'sedan'),
  car(6, 'common', 'Tianma X1', null, 180, 10.9, 160, 54, 78, 2_200, '#556270', 'suv'),
  car(6, 'rare', 'Longwei EV7', null, 210, 4.9, 400, 74, 80, 8_000, '#00a3a3', 'sedan'),
  car(6, 'rare', 'Huoyan GT', null, 240, 5.6, 330, 76, 74, 8_500, '#ff7a1a', 'coupe'),
  car(6, 'epic', 'Tianma Thunder', null, 230, 3.9, 700, 72, 82, 30_000, '#2b2d42', 'suv'),
  car(6, 'epic', 'Jinlong Dragon R', null, 300, 3.1, 620, 86, 78, 42_000, '#d4a017', 'super'),
  car(6, 'mythic', 'Jinlong Imperial', null, 340, 2.3, 1_200, 92, 80, 260_000, '#b30000', 'super'),

  car(7, 'common', 'Lumière Ville', null, 180, 11.0, 100, 58, 76, 1_800, '#f2e8cf', 'hatch'),
  car(7, 'common', 'Brise City', null, 175, 11.6, 95, 60, 74, 1_600, '#4d7cfe', 'hatch'),
  car(7, 'common', 'Lumière Break', null, 190, 10.2, 130, 56, 80, 2_400, '#6c757d', 'wagon'),
  car(7, 'rare', 'Brise GTi', null, 235, 6.4, 260, 82, 72, 9_000, '#c1121f', 'hatch'),
  car(7, 'rare', 'Alpes Berlinette', null, 260, 4.5, 300, 90, 76, 12_000, '#1d3557', 'coupe'),
  car(7, 'epic', 'Lumière Élégance', null, 250, 5.2, 400, 74, 86, 34_000, '#3a0ca3', 'sedan'),
  car(7, 'epic', 'Alpes Turbo A1', null, 300, 3.4, 520, 92, 76, 46_000, '#0077b6', 'super'),
  car(7, 'mythic', 'Riviera Hypersport', null, 420, 2.4, 1_500, 94, 82, 380_000, '#14213d', 'super'),

  car(8, 'common', 'Hanul City', null, 180, 11.5, 100, 56, 84, 1_900, '#ffffff', 'hatch'),
  car(8, 'common', 'Hanul Sorrel', null, 190, 9.9, 180, 58, 86, 2_800, '#4a4e69', 'suv'),
  car(8, 'common', 'Nordvik 40', null, 200, 9.0, 190, 62, 90, 3_200, '#adb5bd', 'wagon'),
  car(8, 'rare', 'Nordvik Polar', null, 240, 5.9, 320, 72, 92, 13_000, '#e9ecef', 'sedan'),
  car(8, 'rare', 'Hanul Arrow GT', null, 270, 4.7, 370, 78, 84, 14_000, '#9d0208', 'coupe'),
  car(8, 'epic', 'Albion Sovereign', null, 250, 4.4, 550, 70, 90, 60_000, '#1b4332', 'sedan'),
  car(8, 'epic', 'Thames V8', null, 315, 3.6, 510, 88, 80, 68_000, '#2d6a4f', 'coupe'),
  car(8, 'mythic', 'Regalia Monarch', null, 250, 5.3, 563, 68, 98, 420_000, '#111111', 'sedan'),
];
