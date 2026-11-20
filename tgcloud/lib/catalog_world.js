// catalog_world.js — остальные 7 контейнеров по 50 узнаваемых машин (30 обычных, 14 редких,
// 4 эпических, 2 легендарные). Марка в названии чуть изменена, модель узнаётся.
// Строка: [реальная модель (для поиска 3D), редкость, л.с., кузов, keep?]
// keep — id машины старого каталога, которая становится этой моделью (у игроков она остаётся).
// Характеристики и цены считаются из мощности, редкости и цены контейнера (см. buildCountry).

const BRAND = {
  Toyota: 'Toyoda', Honda: 'Hondo', Nissan: 'Nisan', Mazda: 'Matsda', Mitsubishi: 'Mitsubisi', Subaru: 'Subara', Suzuki: 'Suzuky', Lexus: 'Lexxus',
  Ford: 'Forde', Chevrolet: 'Chevrolay', Dodge: 'Dodje', Jeep: 'Jip', RAM: 'RAMM', GMC: 'GMS', Tesla: 'Tezla', Chrysler: 'Chrisler', Buick: 'Buik',
  Cadillac: 'Kadillac', Lincoln: 'Linkoln', Shelby: 'Shelbi', Hennessey: 'Henessi',
  Fiat: 'Fiatt', 'Alfa Romeo': 'Alfa Romio', Lancia: 'Lanchia', Abarth: 'Abart', Maserati: 'Mazerati', Ferrari: 'Ferari', Lamborghini: 'Lamborgini', Pagani: 'Pagany',
  Lada: 'Lado', UAZ: 'UAS', GAZ: 'GAS', Moskvich: 'Moskvych', Aurus: 'Aurous', Marussia: 'Marusya', ZIL: 'Zill',
  BYD: 'BYDD', Geely: 'Jeely', Chery: 'Cherri', Haval: 'Havall', 'Great Wall': 'Grate Wall', Changan: 'Changann', Omoda: 'Omodo', Exeed: 'Exid',
  MG: 'EM-G', Wuling: 'Wulin', Tank: 'Tanc', 'Li Auto': 'Li Avto', NIO: 'Neo', Xpeng: 'Xpen', Hongqi: 'Hongchi', Zeekr: 'Zeekar', Xiaomi: 'Xiaomy',
  Denza: 'Denzza', Yangwang: 'Yanvang',
  Peugeot: 'Pejo', Renault: 'Reno', Citroen: 'Sitroen', DS: 'D.S.', Alpine: 'Alpin', Bugatti: 'Bugati',
  Kia: 'Kiya', Hyundai: 'Hyundei', Skoda: 'Shkoda', Seat: 'Siat', Cupra: 'Kupra', Volvo: 'Volva', Mini: 'Minny', 'Land Rover': 'Land Rovar',
  'Range Rover': 'Range Rovar', Jaguar: 'Jaguarr', Dacia: 'Dachia', Polestar: 'Polstar', Genesis: 'Jenesis', Lotus: 'Lotos', 'Aston Martin': 'Aston Martyn',
  Bentley: 'Bentli', 'Rolls-Royce': 'Rols-Rois', McLaren: 'McLaran', Koenigsegg: 'Konigseg',
};
export function gameName(model) {
  for (const [b, f] of Object.entries(BRAND).sort((a, c) => c[0].length - a[0].length)) if (model.startsWith(b + ' ')) return f + model.slice(b.length);
  return model;
}

export const WORLD = {
  // id контейнера: { flag, country, price, base (первый id новых машин), cars }
  1: { flag: 'jp', country: 'Япония', price: 4000, base: 200, cars: [
    ['Toyota Corolla', 'common', 140, 'sedan', 1], ['Honda Civic', 'common', 158, 'sedan', 2], ['Nissan Micra', 'common', 92, 'hatch', 3],
    ['Toyota Camry', 'common', 203, 'sedan'], ['Toyota RAV4', 'common', 203, 'suv'], ['Toyota Yaris', 'common', 116, 'hatch'], ['Toyota C-HR', 'common', 122, 'suv'],
    ['Toyota Prius', 'common', 122, 'hatch'], ['Toyota Hilux', 'common', 204, 'suv'], ['Honda Accord', 'common', 192, 'sedan'], ['Honda CR-V', 'common', 193, 'suv'],
    ['Honda Jazz', 'common', 109, 'hatch'], ['Honda HR-V', 'common', 131, 'suv'], ['Nissan Qashqai', 'common', 158, 'suv'], ['Nissan X-Trail', 'common', 171, 'suv'],
    ['Nissan Leaf', 'common', 150, 'hatch'], ['Nissan Juke', 'common', 114, 'suv'], ['Mazda 3', 'common', 150, 'hatch'], ['Mazda CX-5', 'common', 194, 'suv'],
    ['Mazda 6', 'common', 194, 'sedan'], ['Mitsubishi Outlander', 'common', 167, 'suv'], ['Mitsubishi Lancer', 'common', 143, 'sedan'],
    ['Mitsubishi Lancer Evolution IX', 'common', 280, 'sedan'], ['Subaru Impreza', 'common', 152, 'hatch'], ['Subaru Forester', 'common', 182, 'suv'],
    ['Subaru Outback', 'common', 182, 'wagon'], ['Suzuki Swift', 'common', 90, 'hatch'], ['Suzuki Jimny', 'common', 102, 'suv'], ['Lexus IS', 'common', 245, 'sedan'],
    ['Lexus RX', 'common', 275, 'suv'],
    ['Subaru WRX STI', 'rare', 305, 'sedan', 4], ['Mitsubishi Lancer Evolution X', 'rare', 295, 'sedan', 5], ['Toyota GR86', 'rare', 235, 'coupe'],
    ['Toyota GR Yaris', 'rare', 261, 'hatch'], ['Toyota Land Cruiser 300', 'rare', 409, 'suv'], ['Honda Civic Type R', 'rare', 329, 'hatch'],
    ['Mazda MX-5', 'rare', 184, 'roadster'], ['Nissan 370Z', 'rare', 328, 'coupe'], ['Nissan Z', 'rare', 400, 'coupe'], ['Subaru BRZ', 'rare', 231, 'coupe'],
    ['Lexus RC F', 'rare', 472, 'coupe'], ['Nissan Patrol', 'rare', 400, 'suv'], ['Toyota GR Supra', 'rare', 387, 'coupe'], ['Honda S2000', 'rare', 240, 'roadster'],
    ['Toyota Supra MK4', 'epic', 330, 'coupe', 6], ['Nissan GT-R R35', 'epic', 565, 'coupe'], ['Lexus LC 500', 'epic', 471, 'coupe'], ['Honda NSX', 'epic', 573, 'super'],
    ['Nissan Skyline GT-R R34', 'mythic', 330, 'coupe', 7], ['Lexus LFA', 'mythic', 560, 'super', 8],
  ] },
  3: { flag: 'us', country: 'США', price: 5000, base: 300, cars: [
    ['Ford Focus', 'common', 150, 'hatch', 17], ['Chevrolet Cruze', 'common', 153, 'sedan', 18], ['Dodge Durango', 'common', 295, 'suv', 19],
    ['Ford Fusion', 'common', 181, 'sedan'], ['Ford Escape', 'common', 181, 'suv'], ['Ford Explorer', 'common', 300, 'suv'], ['Ford F-150', 'common', 400, 'suv'],
    ['Ford Ranger', 'common', 270, 'suv'], ['Ford Bronco Sport', 'common', 181, 'suv'], ['Chevrolet Malibu', 'common', 160, 'sedan'], ['Chevrolet Equinox', 'common', 175, 'suv'],
    ['Chevrolet Tahoe', 'common', 355, 'suv'], ['Chevrolet Silverado', 'common', 355, 'suv'], ['Ford Mustang Mach-E', 'common', 266, 'suv'], ['Jeep Wrangler', 'common', 285, 'suv'],
    ['Jeep Grand Cherokee', 'common', 293, 'suv'], ['Jeep Cherokee', 'common', 271, 'suv'], ['Jeep Compass', 'common', 177, 'suv'], ['RAM 1500', 'common', 395, 'suv'],
    ['GMC Sierra', 'common', 355, 'suv'], ['GMC Yukon', 'common', 355, 'suv'], ['Tesla Model 3', 'common', 283, 'sedan'], ['Tesla Model Y', 'common', 299, 'suv'],
    ['Chrysler Pacifica', 'common', 287, 'van'], ['Chrysler 300', 'common', 292, 'sedan'], ['Ford Expedition', 'common', 400, 'suv'], ['Chevrolet Blazer', 'common', 308, 'suv'],
    ['Jeep Gladiator', 'common', 285, 'suv'], ['Ford Maverick', 'common', 250, 'suv'], ['Chevrolet Colorado', 'common', 308, 'suv'],
    ['Ford Mustang GT', 'rare', 480, 'coupe', 20], ['Chevrolet Camaro SS', 'rare', 455, 'coupe', 21], ['Dodge Charger SRT', 'rare', 485, 'sedan'],
    ['Ford Bronco', 'rare', 330, 'suv'], ['Ford F-150 Raptor', 'rare', 450, 'suv'], ['Cadillac Escalade', 'rare', 420, 'suv'], ['Lincoln Navigator', 'rare', 440, 'suv'],
    ['Tesla Model S Plaid', 'rare', 1020, 'sedan'], ['Tesla Cybertruck', 'rare', 845, 'suv'], ['Jeep Grand Cherokee Trackhawk', 'rare', 707, 'suv'],
    ['RAM TRX', 'rare', 702, 'suv'], ['Cadillac CT5-V Blackwing', 'rare', 668, 'sedan'], ['Chevrolet Corvette C7', 'rare', 460, 'coupe'], ['Jeep Wrangler Rubicon 392', 'rare', 470, 'suv'],
    ['Dodge Challenger SRT Hellcat', 'epic', 717, 'coupe', 22], ['Chevrolet Corvette C8', 'epic', 495, 'super', 23], ['Dodge Viper ACR', 'epic', 645, 'super'],
    ['Shelby Mustang GT500', 'epic', 760, 'coupe'],
    ['Ford GT', 'mythic', 660, 'super', 24], ['Hennessey Venom F5', 'mythic', 1817, 'super'],
  ] },
  4: { flag: 'it', country: 'Италия', price: 8000, base: 400, cars: [
    ['Fiat Punto', 'common', 77, 'hatch', 25], ['Fiat 500', 'common', 69, 'hatch', 26], ['Alfa Romeo Giulietta', 'common', 150, 'hatch', 27],
    ['Fiat Panda', 'common', 69, 'hatch'], ['Fiat Multipla', 'common', 103, 'van'], ['Fiat Barchetta', 'common', 130, 'roadster'], ['Alfa Romeo Spider', 'common', 150, 'roadster'],
    ['Fiat Doblo', 'common', 95, 'van'], ['Fiat Ducato', 'common', 140, 'van'], ['Alfa Romeo 156', 'common', 155, 'sedan'], ['Fiat Bravo', 'common', 120, 'hatch'],
    ['Fiat Strada', 'common', 107, 'suv'], ['Alfa Romeo 147', 'common', 150, 'hatch'], ['Iveco Daily', 'common', 146, 'van'], ['Fiat Abarth 500', 'common', 135, 'hatch'],
    ['Abarth 595', 'common', 165, 'hatch'], ['Abarth 124 Spider', 'common', 170, 'roadster'], ['Alfa Romeo Giulia', 'common', 200, 'sedan'],
    ['Alfa Romeo Stelvio', 'common', 280, 'suv'], ['Alfa Romeo Tonale', 'common', 160, 'suv'], ['Alfa Romeo MiTo', 'common', 135, 'hatch'],
    ['Alfa Romeo Brera', 'common', 260, 'coupe'], ['Alfa Romeo 159', 'common', 200, 'sedan'], ['Fiat Stilo', 'common', 115, 'hatch'], ['Lancia Delta', 'common', 140, 'hatch'],
    ['Fiat Argo', 'common', 109, 'hatch'], ['Fiat Palio', 'common', 75, 'hatch'], ['Fiat Uno', 'common', 75, 'hatch'], ['Fiat Linea', 'common', 115, 'sedan'],
    ['Fiat Toro', 'common', 139, 'suv'],
    ['Alfa Romeo Giulia Quadrifoglio', 'rare', 510, 'sedan', 28], ['Maserati MC20', 'rare', 630, 'super', 29], ['Maserati Levante', 'rare', 430, 'suv'],
    ['Maserati Quattroporte', 'rare', 430, 'sedan'], ['Lancia Delta Integrale', 'rare', 215, 'hatch'], ['Alfa Romeo 4C', 'rare', 240, 'coupe'],
    ['Alfa Romeo Stelvio Quadrifoglio', 'rare', 510, 'suv'], ['Alfa Romeo 8C Competizione', 'rare', 450, 'coupe'], ['Lancia 037 Stradale', 'rare', 205, 'coupe'],
    ['Lamborghini Urus', 'rare', 650, 'suv'], ['Ferrari California T', 'rare', 560, 'coupe'], ['Ferrari Portofino', 'rare', 600, 'coupe'],
    ['Maserati GranTurismo', 'rare', 460, 'coupe'], ['Ferrari Roma', 'rare', 620, 'coupe'],
    ['Ferrari 488 GTB', 'epic', 670, 'super', 30], ['Lamborghini Huracan', 'epic', 610, 'super', 31], ['Lamborghini Aventador SVJ', 'epic', 770, 'super'],
    ['Ferrari SF90 Stradale', 'epic', 1000, 'super'],
    ['Ferrari LaFerrari', 'mythic', 963, 'super', 32], ['Pagani Huayra', 'mythic', 730, 'super'],
  ] },
  5: { flag: 'ru', country: 'Россия', price: 3000, base: 500, cars: [
    ['Lada Granta', 'common', 90, 'sedan', 33], ['GAZ Volga 31105', 'common', 131, 'sedan', 34], ['Lada Niva Legend', 'common', 83, 'suv', 35],
    ['Lada Vesta', 'common', 106, 'sedan'], ['Lada Niva Travel', 'common', 80, 'suv'], ['Lada 2104', 'common', 74, 'wagon'], ['Lada 2105', 'common', 74, 'sedan'],
    ['Lada 2103', 'common', 77, 'sedan'], ['Lada Priora', 'common', 98, 'sedan'], ['Lada 2107', 'common', 74, 'sedan'], ['Lada 2109', 'common', 70, 'hatch'],
    ['Lada 2114', 'common', 81, 'hatch'], ['Lada 2110', 'common', 81, 'sedan'], ['Lada 2106', 'common', 75, 'sedan'], ['Lada 2101', 'common', 64, 'sedan'],
    ['UAZ Patriot', 'common', 150, 'suv'], ['UAZ Hunter', 'common', 135, 'suv'], ['UAZ Buhanka', 'common', 112, 'van'], ['Moskvich 2140', 'common', 75, 'sedan'],
    ['GAZ 3102', 'common', 100, 'sedan'], ['GAZ Volga 3110', 'common', 130, 'sedan'], ['GAZ Volga Siber', 'common', 141, 'sedan'],
    ['LuAZ 969', 'common', 40, 'suv'], ['Moskvich 2141', 'common', 72, 'hatch'], ['Moskvich 412', 'common', 75, 'sedan'], ['IZh Kombi', 'common', 75, 'hatch'],
    ['Lada Vesta SW Cross', 'common', 122, 'wagon'], ['Lada Granta Cross', 'common', 90, 'wagon'], ['ZAZ 965', 'common', 23, 'hatch'], ['Lada 2108', 'common', 70, 'hatch'],
    ['Lada Vesta Sport', 'rare', 145, 'sedan', 36], ['Lada Granta Sport', 'rare', 120, 'sedan', 37], ['Moskvich 400', 'rare', 23, 'sedan'],
    ['GAZ 21 Volga', 'rare', 75, 'sedan'], ['GAZ 24 Volga', 'rare', 95, 'sedan'], ['Lada Niva Bronto', 'rare', 83, 'suv'], ['Lada 4x4 Urban', 'rare', 83, 'suv'],
    ['GAZ 69', 'rare', 55, 'suv'], ['UAZ 3163 Patriot', 'rare', 135, 'suv'], ['ZIL 130', 'rare', 150, 'van'], ['Lada Vesta NG', 'rare', 122, 'sedan'],
    ['Lada 2105 VFTS', 'rare', 160, 'sedan'], ['UAZ 469', 'rare', 75, 'suv'], ['Lada Samara 21099', 'rare', 70, 'sedan'],
    ['GAZ 66', 'epic', 115, 'suv', 38], ['GAZ Tigr', 'epic', 215, 'suv', 39], ['ZIL 157', 'epic', 109, 'van'], ['Kamaz 5330', 'epic', 210, 'van'],
    ['Marussia B2', 'mythic', 420, 'super', 40], ['Marussia B1', 'mythic', 360, 'super'],
  ] },
  6: { flag: 'cn', country: 'Китай', price: 3500, base: 600, cars: [
    ['BYD Atto 3', 'common', 204, 'suv', 41], ['Geely Binyue', 'common', 177, 'suv', 42], ['Chery Tiggo 7 Pro', 'common', 147, 'suv', 43],
    ['BYD Dolphin', 'common', 204, 'hatch'], ['Chery QQ', 'common', 68, 'hatch'], ['Chery Tiggo 9', 'common', 261, 'suv'], ['BYD e6', 'common', 163, 'wagon'],
    ['Haval H9', 'common', 218, 'suv'], ['Wuling Hongguang S', 'common', 99, 'van'], ['Geely Emgrand', 'common', 122, 'sedan'], ['Hongqi H5', 'common', 169, 'sedan'],
    ['Chery Tiggo 8 Pro', 'common', 197, 'suv'], ['Chery Tiggo 4', 'common', 147, 'suv'], ['Chery Arrizo 8', 'common', 186, 'sedan'], ['Hongqi HS5', 'common', 224, 'suv'],
    ['Haval H6', 'common', 200, 'suv'], ['MG5', 'common', 173, 'sedan'], ['MG HS', 'common', 162, 'suv'], ['Great Wall Poer', 'common', 197, 'suv'],
    ['Changan CS35 Plus', 'common', 150, 'suv'], ['Changan CS75 Plus', 'common', 180, 'suv'], ['Changan UNI-K', 'common', 233, 'suv'], ['Changan UNI-V', 'common', 188, 'sedan'],
    ['Haval Big Dog', 'common', 211, 'suv'], ['Changan CS55 Plus', 'common', 188, 'suv'], ['MG ZS', 'common', 106, 'suv'], ['MG4', 'common', 204, 'hatch'],
    ['Wuling Hongguang Mini EV', 'common', 27, 'hatch'], ['Changan Eado Plus', 'common', 160, 'sedan'], ['Neta V', 'common', 95, 'suv'],
    ['BYD Han', 'rare', 517, 'sedan', 44], ['Zeekr 001', 'rare', 544, 'wagon', 45], ['BYD Seal', 'rare', 530, 'sedan'], ['Avatr 11', 'rare', 578, 'suv'],
    ['BYD Seal 06 GT', 'rare', 313, 'sedan'], ['MG Astor', 'rare', 140, 'suv'], ['Xpeng P7', 'rare', 473, 'sedan'], ['Hongqi H9', 'rare', 252, 'sedan'],
    ['GAC Trumpchi GS4', 'rare', 200, 'suv'], ['Chery Arrizo 5', 'rare', 147, 'sedan'], ['MG Cyberster', 'rare', 544, 'roadster'], ['Xiaomi SU7', 'rare', 673, 'sedan'],
    ['Dongfeng Aeolus AX70', 'rare', 197, 'suv'], ['Zeekr X', 'rare', 428, 'suv'],
    ['Xiaomi SU7 Ultra', 'epic', 1548, 'sedan', 46], ['BYD Yangwang U8', 'epic', 1180, 'suv', 47], ['GAC Aion Hyper SSR', 'epic', 1225, 'super'], ['Zeekr 007', 'epic', 646, 'sedan'],
    ['BYD Yangwang U9', 'mythic', 1287, 'super', 48], ['NIO EP9', 'mythic', 1341, 'super'],
  ] },
  7: { flag: 'fr', country: 'Франция', price: 4500, base: 700, cars: [
    ['Peugeot 208', 'common', 100, 'hatch', 49], ['Renault Clio', 'common', 100, 'hatch', 50], ['Peugeot 308', 'common', 130, 'hatch', 51],
    ['Peugeot 2008', 'common', 130, 'suv'], ['Peugeot 3008', 'common', 130, 'suv'], ['Peugeot 5008', 'common', 130, 'suv'], ['Peugeot 508', 'common', 180, 'sedan'],
    ['Peugeot 405', 'common', 110, 'sedan'], ['Peugeot 206', 'common', 75, 'hatch'], ['Renault Captur', 'common', 140, 'suv'], ['Renault Megane', 'common', 140, 'hatch'],
    ['Renault Kadjar', 'common', 140, 'suv'], ['Renault Austral', 'common', 160, 'suv'], ['Renault Arkana', 'common', 160, 'suv'], ['Renault Koleos', 'common', 175, 'suv'],
    ['Renault Scenic', 'common', 140, 'van'], ['Renault Zoe', 'common', 135, 'hatch'], ['Renault Twingo', 'common', 75, 'hatch'], ['Renault Logan', 'common', 90, 'sedan'],
    ['Renault Espace', 'common', 200, 'suv'], ['Peugeot 406', 'common', 135, 'sedan'], ['Citroen C3', 'common', 110, 'hatch'], ['Peugeot 407', 'common', 140, 'sedan'],
    ['Citroen C4', 'common', 130, 'hatch'], ['Renault Duster', 'common', 114, 'suv'], ['Peugeot 207', 'common', 95, 'hatch'], ['Renault Laguna', 'common', 150, 'sedan'],
    ['Citroen Ami', 'common', 8, 'hatch'], ['Renault 4', 'common', 34, 'hatch'], ['Citroen Saxo', 'common', 75, 'hatch'],
    ['Renault Megane RS', 'rare', 300, 'hatch', 52], ['Alpine A110', 'rare', 252, 'coupe', 53], ['Peugeot 208 GTi', 'rare', 208, 'hatch'],
    ['Renault Clio V6', 'rare', 255, 'hatch'], ['Peugeot 508 PSE', 'rare', 360, 'sedan'], ['Renault Clio RS', 'rare', 220, 'hatch'], ['Citroen SM', 'rare', 170, 'coupe'],
    ['Peugeot 106 Rallye', 'rare', 100, 'hatch'], ['Peugeot 205 GTI', 'rare', 130, 'hatch'], ['Renault 5 Alpine', 'rare', 93, 'hatch'], ['Citroen 2CV', 'rare', 29, 'hatch'],
    ['Alpine A310', 'rare', 150, 'coupe'], ['Renault 5 Turbo', 'rare', 160, 'hatch'], ['Peugeot RCZ', 'rare', 270, 'coupe'],
    ['Bugatti EB110', 'epic', 553, 'super', 54], ['Alpine A110 R', 'epic', 300, 'coupe', 55], ['Bugatti Veyron', 'epic', 1001, 'super'], ['Renault 5 Turbo 3E', 'epic', 540, 'hatch'],
    ['Bugatti Chiron', 'mythic', 1500, 'super', 56], ['Bugatti Bolide', 'mythic', 1600, 'super'],
  ] },
  8: { flag: 'world', country: 'Другие страны', price: 7000, base: 800, cars: [
    ['Kia Rio', 'common', 123, 'sedan', 57], ['Kia Sportage', 'common', 150, 'suv', 58], ['Volvo XC60', 'common', 250, 'suv', 59],
    ['Kia Sorento', 'common', 200, 'suv'], ['Kia Ceed', 'common', 140, 'hatch'], ['Kia K5', 'common', 194, 'sedan'], ['Hyundai Solaris', 'common', 123, 'sedan'],
    ['Hyundai Elantra', 'common', 147, 'sedan'], ['Hyundai Tucson', 'common', 180, 'suv'], ['Hyundai Santa Fe', 'common', 200, 'suv'], ['Hyundai Creta', 'common', 123, 'suv'],
    ['Hyundai Ioniq 5', 'common', 225, 'suv'], ['Skoda Octavia', 'common', 150, 'sedan'], ['Skoda Superb', 'common', 190, 'sedan'], ['Skoda Kodiaq', 'common', 180, 'suv'],
    ['Skoda Fabia', 'common', 110, 'hatch'], ['Seat Leon', 'common', 150, 'hatch'], ['Hyundai i20', 'common', 100, 'hatch'], ['Hyundai Kona', 'common', 149, 'suv'],
    ['Volvo XC90', 'common', 250, 'suv'], ['Volvo S60', 'common', 250, 'sedan'], ['Mini Cooper', 'common', 136, 'hatch'], ['Range Rover Evoque', 'common', 200, 'suv'],
    ['Land Rover Discovery', 'common', 300, 'suv'], ['Dacia Duster', 'common', 130, 'suv'], ['Dacia Sandero', 'common', 90, 'hatch'], ['Polestar 2', 'common', 408, 'sedan'],
    ['Kia Seltos', 'common', 177, 'suv'], ['Kia Carnival', 'common', 290, 'van'], ['Hyundai Palisade', 'common', 291, 'suv'],
    ['Land Rover Defender', 'rare', 400, 'suv', 60], ['Kia Stinger', 'rare', 370, 'sedan', 61], ['Hyundai i30 N', 'rare', 280, 'hatch'],
    ['Hyundai Ioniq 5 N', 'rare', 650, 'suv'], ['Kia EV6 GT', 'rare', 585, 'suv'], ['Range Rover', 'rare', 530, 'suv'], ['Jaguar F-Type', 'rare', 575, 'coupe'],
    ['Mini John Cooper Works', 'rare', 231, 'hatch'], ['Lotus Emira', 'rare', 400, 'coupe'], ['Aston Martin Vantage', 'rare', 665, 'coupe'],
    ['Bentley Bentayga', 'rare', 550, 'suv'], ['Bentley Continental GT', 'rare', 650, 'coupe'], ['Genesis GV80', 'rare', 375, 'suv'], ['Skoda Octavia RS', 'rare', 245, 'sedan'],
    ['Rolls-Royce Phantom', 'epic', 563, 'sedan', 62], ['Aston Martin DBS', 'epic', 725, 'coupe', 63], ['Rolls-Royce Cullinan', 'epic', 563, 'suv'], ['McLaren 720S', 'epic', 720, 'super'],
    ['Koenigsegg Jesko', 'mythic', 1600, 'super', 64], ['McLaren P1', 'mythic', 916, 'super'],
  ] },
};

const COLORS = ['#c4161c', '#1f4fa8', '#e8e8e8', '#202428', '#8c96a3', '#2e7d4f', '#e8742c', '#f2c230', '#5b2a86', '#2a8f9a', '#7a1218', '#c9ccd1'];
const MULT = {
  // доли цены контейнера: 18 обычных дешевле, 12 немного дороже; редкие 1,4–3,2×; эпические 9–16×; легендарные ~70×
  common: [0.4, 0.45, 0.5, 0.55, 0.6, 0.62, 0.65, 0.68, 0.7, 0.72, 0.75, 0.78, 0.8, 0.83, 0.86, 0.9, 0.93, 0.96,
    1.04, 1.06, 1.08, 1.1, 1.12, 1.15, 1.18, 1.2, 1.24, 1.28, 1.32, 1.36],
  rare: [1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.4, 2.6, 2.8, 3.0, 3.2], epic: [9, 11, 13, 16], mythic: [70, 76],
};
const round = (x) => Math.max(100, Math.round(x / 100) * 100);

// Строки в формате немецкого каталога: [название, реальная модель, редкость, км/ч, 0-100, л.с., управление, надёжность, цена, кузов, цвет, keep]
export function buildCountry(cid) {
  const W = WORLD[cid];
  const byR = { common: [], rare: [], epic: [], mythic: [] };
  W.cars.forEach((c, i) => byR[c[1]].push(i));
  // внутри редкости дороже те, у кого больше мощности
  const price = new Array(W.cars.length);
  for (const [r, idx] of Object.entries(byR)) {
    const sorted = [...idx].sort((a, b) => W.cars[a][2] - W.cars[b][2]);
    sorted.forEach((i, j) => { price[i] = round(W.price * MULT[r][Math.min(j, MULT[r].length - 1)]); });
  }
  return W.cars.map(([model, rarity, hp, body, keep], i) => {
    const sport = { common: 0, rare: 1, epic: 2, mythic: 3 }[rarity];
    const accel = Math.max(2.0, Math.min(25, +(14 - Math.log2(hp / 60) * 2.9 - sport * 0.4).toFixed(1)));
    const speed = Math.round(Math.min(420, 110 + Math.sqrt(hp) * 8 + sport * 6));
    const handling = Math.min(98, 52 + sport * 10 + (body === 'super' || body === 'coupe' ? 8 : body === 'suv' || body === 'van' ? -6 : 0) + (i % 5));
    const reliability = Math.max(55, Math.min(95, 88 - sport * 3 - (cid === 5 ? 12 : cid === 4 ? 6 : 0) + (i % 4)));
    return [gameName(model), model, rarity, speed, accel, hp, handling, reliability, price[i], body, COLORS[i % COLORS.length], keep];
  });
}
