// lib/catalog.js — стартовый каталог (дальше всё меняется в админке Mini App).
// Марки и модели вымышленные: реальные названия автопроизводителей — товарные знаки,
// их использование в игре без лицензии рискованно (особенно с платежами). Машины
// «в духе» японских, немецких, американских и итальянских, рисунки — собственные.
// Цены подобраны так, чтобы средняя ценность контейнера была выше стартовой ставки.
// Шансы редкости по умолчанию: обычная 60%, редкая 30%, эпическая 9%, мифическая 1%.

export const GARAGE_TIERS = [[20, 25_000], [25, 50_000], [30, 100_000], [35, 150_000], [40, 300_000], [45, 400_000], [50, 500_000]];

export const CONTAINERS = [
  { name: 'Японский контейнер', country: 'Япония', emoji: '🇯🇵', price: 4_000 },
  { name: 'Немецкий контейнер', country: 'Германия', emoji: '🇩🇪', price: 5_000 },
  { name: 'Американский контейнер', country: 'США', emoji: '🇺🇸', price: 5_000 },
  { name: 'Итальянский контейнер', country: 'Италия', emoji: '🇮🇹', price: 8_000 },
];

// container — номер контейнера (с 1), speed км/ч, accel с до 100, power л.с.,
// handling и reliability — шкала 0–100, body — силуэт на рисунке.
// legacy — прежнее название (миграция 2 переименовывает, если админ его не менял).
const car = (container, rarity, name, legacy, speed, accel, power, handling, reliability, price, color, body) =>
  ({ container, rarity, name, legacy, country: CONTAINERS[container - 1].country, speed, accel, power, handling, reliability, price, color, body });

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
