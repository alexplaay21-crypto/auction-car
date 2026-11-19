// lib/catalog.js — стартовый каталог (дальше всё меняется в админке Mini App).
// Цены подобраны так, чтобы средняя ценность контейнера была выше стартовой ставки
// (иначе торговаться невыгодно), а мифическая машина была редкой удачей.
// Шансы редкости по умолчанию: обычная 60%, редкая 30%, эпическая 9%, мифическая 1%.

export const GARAGE_TIERS = [[20, 25_000], [25, 50_000], [30, 100_000], [35, 150_000], [40, 300_000], [45, 400_000], [50, 500_000]];

export const CONTAINERS = [
  { name: 'Японский контейнер', country: 'Япония', emoji: '🇯🇵', price: 4_000 },
  { name: 'Немецкий контейнер', country: 'Германия', emoji: '🇩🇪', price: 5_000 },
  { name: 'Американский контейнер', country: 'США', emoji: '🇺🇸', price: 5_000 },
  { name: 'Итальянский контейнер', country: 'Италия', emoji: '🇮🇹', price: 8_000 },
];

// container — номер контейнера (с 1), speed км/ч, accel с до 100, power л.с.,
// handling и reliability — шкала 0–100, body — силуэт на карточке.
const car = (container, rarity, name, speed, accel, power, handling, reliability, price, color, body) =>
  ({ container, rarity, name, country: CONTAINERS[container - 1].country, speed, accel, power, handling, reliability, price, color, body });

export const CATALOG = [
  car(1, 'common', 'Toyota Corolla', 195, 9.8, 132, 55, 92, 2_500, '#d7dce3', 'sedan'),
  car(1, 'common', 'Honda Civic', 200, 8.9, 158, 62, 88, 3_000, '#2f6fde', 'hatch'),
  car(1, 'common', 'Nissan Almera', 185, 11.2, 102, 50, 80, 2_000, '#9aa3ad', 'sedan'),
  car(1, 'rare', 'Subaru Impreza WRX STI', 255, 5.2, 300, 80, 74, 9_000, '#1d4fa8', 'sedan'),
  car(1, 'rare', 'Mitsubishi Lancer Evolution IX', 250, 4.9, 286, 82, 70, 10_000, '#e8e8e8', 'sedan'),
  car(1, 'epic', 'Toyota Supra A80', 285, 4.6, 330, 78, 84, 32_000, '#f0a020', 'coupe'),
  car(1, 'epic', 'Nissan Skyline GT-R R34', 280, 4.4, 330, 86, 76, 38_000, '#3a5fcf', 'coupe'),
  car(1, 'mythic', 'Lexus LFA', 325, 3.6, 560, 90, 88, 220_000, '#f2f2f2', 'super'),

  car(2, 'common', 'Volkswagen Golf', 210, 8.5, 150, 64, 86, 3_000, '#c9ccd1', 'hatch'),
  car(2, 'common', 'Opel Astra', 205, 9.4, 140, 58, 78, 2_500, '#7a8794', 'hatch'),
  car(2, 'common', 'BMW 3 E46', 225, 7.8, 192, 70, 72, 4_000, '#202428', 'sedan'),
  car(2, 'rare', 'Audi RS4', 280, 4.1, 450, 80, 78, 12_000, '#8a95a0', 'wagon'),
  car(2, 'rare', 'Mercedes-Benz C63 AMG', 290, 4.0, 476, 76, 76, 14_000, '#101215', 'sedan'),
  car(2, 'epic', 'BMW M5 F90', 305, 3.3, 600, 84, 80, 45_000, '#4a6b8a', 'sedan'),
  car(2, 'epic', 'Porsche 911 Carrera', 293, 4.2, 385, 92, 86, 52_000, '#c8102e', 'coupe'),
  car(2, 'mythic', 'Porsche 918 Spyder', 345, 2.6, 887, 96, 84, 350_000, '#e6e6e6', 'super'),

  car(3, 'common', 'Ford Focus', 200, 9.2, 150, 60, 80, 2_500, '#2b5cab', 'hatch'),
  car(3, 'common', 'Chevrolet Cruze', 195, 10.0, 140, 56, 78, 2_200, '#b9bec4', 'sedan'),
  car(3, 'common', 'Dodge Caliber', 190, 10.5, 158, 52, 74, 2_800, '#b3202a', 'hatch'),
  car(3, 'rare', 'Ford Mustang GT', 250, 4.5, 450, 70, 78, 11_000, '#d4241f', 'coupe'),
  car(3, 'rare', 'Chevrolet Camaro SS', 250, 4.2, 455, 72, 76, 11_500, '#f3c400', 'coupe'),
  car(3, 'epic', 'Dodge Challenger SRT Hellcat', 320, 3.6, 717, 66, 72, 40_000, '#1a1a1a', 'coupe'),
  car(3, 'epic', 'Chevrolet Corvette C8', 312, 2.9, 495, 88, 80, 48_000, '#f26b1d', 'super'),
  car(3, 'mythic', 'Ford GT', 348, 3.0, 656, 92, 82, 300_000, '#1c3f94', 'super'),

  car(4, 'common', 'Fiat Punto', 180, 11.5, 95, 54, 70, 2_000, '#e0e0e0', 'hatch'),
  car(4, 'common', 'Fiat 500', 160, 12.5, 69, 58, 72, 1_800, '#5ec6c0', 'hatch'),
  car(4, 'common', 'Alfa Romeo 147', 205, 9.0, 150, 64, 64, 3_200, '#a3101b', 'hatch'),
  car(4, 'rare', 'Alfa Romeo Giulia Quadrifoglio', 307, 3.9, 510, 86, 68, 16_000, '#b0131d', 'sedan'),
  car(4, 'rare', 'Maserati Ghibli', 285, 4.9, 430, 74, 70, 15_000, '#1b2c52', 'sedan'),
  car(4, 'epic', 'Ferrari 488 GTB', 330, 3.0, 670, 92, 78, 70_000, '#d40000', 'super'),
  car(4, 'epic', 'Lamborghini Huracán', 325, 2.9, 640, 90, 76, 75_000, '#9ccc2a', 'super'),
  car(4, 'mythic', 'Ferrari LaFerrari', 350, 2.4, 963, 97, 80, 450_000, '#c00000', 'super'),
];
