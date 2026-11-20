// catalog_world.js — 8 контейнеров по 50 новых популярных машин (30 обычных, 14 редких,
// 4 эпических, 2 легендарные). Марка в названии чуть изменена, модель узнаётся.
// Строка: [реальная модель (для поиска 3D), редкость, л.с., кузов, заводская цена $, keep?]
// Цена машины — заводская (MSRP); цена контейнера — такая, что 18 из 30 обычных дешевле него.
// keep — id машины старого каталога, которая становится этой моделью (у игроков она остаётся).

const BRAND = {
  Toyota: 'Toyoda', Honda: 'Hondo', Nissan: 'Nisan', Mazda: 'Matsda', Mitsubishi: 'Mitsubisi', Subaru: 'Subara', Suzuki: 'Suzuky', Lexus: 'Lexxus',
  Ford: 'Forde', Chevrolet: 'Chevrolay', Dodge: 'Dodje', Jeep: 'Jip', RAM: 'RAMM', GMC: 'GMS', Tesla: 'Tezla', Chrysler: 'Chrisler', Buick: 'Buik',
  Cadillac: 'Kadillac', Lincoln: 'Linkoln', Shelby: 'Shelbi', Hennessey: 'Henessi',
  Fiat: 'Fiatt', 'Alfa Romeo': 'Alpha Romio', Lancia: 'Lanchia', Abarth: 'Abart', Maserati: 'Mazerati', Ferrari: 'Ferari', Lamborghini: 'Lamborgini', Pagani: 'Pagany',
  Lada: 'Lado', UAZ: 'UAS', GAZ: 'GAS', Moskvich: 'Moskvych', Aurus: 'Aurous', Marussia: 'Marusya', ZIL: 'Zill', VAZ: 'VAS', ZIS: 'ZYS', Kamaz: 'Kamas', ZAZ: 'ZAS',
  BYD: 'BYDD', Geely: 'Jeely', Chery: 'Cherri', Jetour: 'Jetur', Haval: 'Havall', 'Great Wall': 'Grate Wall', Changan: 'Changann', Omoda: 'Omodo', Exeed: 'Exid',
  MG: 'EM-G', Wuling: 'Wulin', Tank: 'Tanc', 'Li Auto': 'Li Avto', NIO: 'Neo', Xpeng: 'Xpen', Hongqi: 'Hongchi', Zeekr: 'Zeekar', Xiaomi: 'Xiaomy',
  Denza: 'Denzza', Yangwang: 'Yanvang',
  Peugeot: 'Pejo', Renault: 'Reno', Citroen: 'Sitroen', DS: 'D.S.', Alpine: 'Alpin', Bugatti: 'Bugati',
  Kia: 'Kiya', Hyundai: 'Hyundei', Skoda: 'Shkoda', Seat: 'Siat', Cupra: 'Kupra', Volvo: 'Volva', Mini: 'Minny', 'Land Rover': 'Land Rovar',
  'Range Rover': 'Range Rovar', Jaguar: 'Jaguarr', Dacia: 'Dachia', Polestar: 'Polstar', Genesis: 'Jenesis', Lotus: 'Lotos', 'Aston Martin': 'Aston Martyn',
  Bentley: 'Bentli', 'Rolls-Royce': 'Rols-Rois', McLaren: 'McLaran', Koenigsegg: 'Konigseg', Rimac: 'Rimak',
  Volkswagen: 'Folkswagen', Audi: 'Audy', BMW: 'BMV', 'Mercedes-Benz': 'Mersedes-Bens', 'Mercedes-AMG': 'Mersedes-AMX',
  'Mercedes-Maybach': 'Mersedes-Maibax', Porsche: 'Porshe', Opel: 'Opal', Lucid: 'Lusid', Rivian: 'Rivyan', SSC: 'S.S.C.', Czinger: 'Tsinger',
  Saleen: 'Salin', Evolute: 'Evolut', Tenet: 'Tennet', Solaris: 'Solarys', Neta: 'Netta', GAC: 'G.A.C.', Avatr: 'Avatar', Dongfeng: 'Dongfen',
  Leapmotor: 'Lipmotor', Ora: 'Orra', BAIC: 'Baik', Lynk: 'Link', Aito: 'Ayto', Voyah: 'Voyya', IZh: 'IJ', LuAZ: 'LUAS',
};
export function gameName(model) {
  for (const [b, f] of Object.entries(BRAND).sort((a, c) => c[0].length - a[0].length)) if (model.startsWith(b + ' ')) return f + model.slice(b.length);
  return model;
}

export const WORLD = {
  // id контейнера: { flag, country, base (первый id новых машин), cars: [модель, редкость, л.с., кузов, заводская цена $, keep] }
  1: { flag: 'jp', country: 'Япония', base: 200, cars: [
    ['Toyota Corolla', 'common', 169, 'sedan', 22500, 1], ['Toyota Camry', 'common', 225, 'sedan', 28400, 2], ['Toyota RAV4', 'common', 203, 'suv', 28800, 3],
    ['Honda Civic', 'common', 158, 'sedan', 24250], ['Honda CR-V', 'common', 190, 'suv', 30850], ['Toyota Yaris Cross', 'common', 116, 'suv', 24000],
    ['Nissan Qashqai', 'common', 158, 'suv', 29500], ['Mazda CX-5', 'common', 187, 'suv', 29300], ['Mazda 3', 'common', 191, 'hatch', 24150],
    ['Toyota C-HR', 'common', 138, 'suv', 25500], ['Toyota Prius', 'common', 194, 'hatch', 28000], ['Honda Accord', 'common', 192, 'sedan', 28300],
    ['Toyota Highlander', 'common', 265, 'suv', 39900], ['Nissan X-Trail', 'common', 201, 'suv', 29230], ['Nissan Juke', 'common', 114, 'suv', 24000],
    ['Nissan Leaf', 'common', 147, 'hatch', 28140], ['Honda HR-V', 'common', 158, 'suv', 24900], ['Subaru Outback', 'common', 182, 'wagon', 29995],
    ['Subaru Forester', 'common', 180, 'suv', 28895], ['Mitsubishi Outlander', 'common', 181, 'suv', 28595], ['Suzuki Swift', 'common', 82, 'hatch', 17000],
    ['Suzuki Jimny', 'common', 101, 'suv', 22000], ['Toyota Corolla Cross', 'common', 169, 'suv', 24135], ['Nissan Altima', 'common', 188, 'sedan', 26370],
    ['Honda Jazz', 'common', 121, 'hatch', 19500], ['Nissan Ariya', 'common', 238, 'suv', 39770], ['Subaru Crosstrek', 'common', 152, 'suv', 25195],
    ['Mitsubishi Eclipse Cross', 'common', 152, 'suv', 26990], ['Toyota Sienna', 'common', 245, 'van', 38950], ['Toyota Alphard', 'common', 275, 'van', 52000],
    ['Toyota GR86', 'rare', 228, 'coupe', 29300, 4], ['Toyota GR Supra', 'rare', 382, 'coupe', 46440, 5], ['Toyota GR Yaris', 'rare', 300, 'hatch', 38000],
    ['Honda Civic Type R', 'rare', 315, 'hatch', 44890], ['Nissan Z', 'rare', 400, 'coupe', 42210], ['Subaru WRX', 'rare', 271, 'sedan', 32735],
    ['Toyota Land Cruiser 300', 'rare', 409, 'suv', 89665], ['Lexus RX', 'rare', 275, 'suv', 49950], ['Lexus RC F', 'rare', 472, 'coupe', 67400],
    ['Mazda MX-5', 'rare', 181, 'roadster', 29330], ['Toyota GR Corolla', 'rare', 300, 'hatch', 36500], ['Lexus ES', 'rare', 203, 'sedan', 41890],
    ['Mitsubishi Lancer Evolution X', 'rare', 291, 'sedan', 34995], ['Subaru BRZ', 'rare', 228, 'coupe', 30195], ['Lexus LC 500', 'epic', 471, 'coupe', 99350, 6],
    ['Nissan GT-R', 'epic', 565, 'super', 121090], ['Honda NSX', 'epic', 600, 'super', 171495], ['Toyota Century', 'epic', 406, 'suv', 170000],
    ['Lexus LFA', 'mythic', 553, 'super', 375000, 7], ['Nissan GT-R Nismo', 'mythic', 600, 'super', 221090, 8],
  ] },
  2: { flag: 'de', country: 'Германия', base: 101, cars: [
    ['Volkswagen Golf', 'common', 150, 'hatch', 28000, 9], ['Volkswagen Polo', 'common', 95, 'hatch', 22000, 10], ['Volkswagen Tiguan', 'common', 150, 'suv', 30000, 11],
    ['Volkswagen T-Roc', 'common', 150, 'suv', 27000], ['Volkswagen Passat', 'common', 150, 'wagon', 40000], ['Volkswagen ID.4', 'common', 204, 'suv', 40000],
    ['Volkswagen T-Cross', 'common', 115, 'suv', 24000], ['Volkswagen Arteon', 'common', 190, 'sedan', 45000], ['Volkswagen Touareg', 'common', 286, 'suv', 60000],
    ['Audi A3', 'common', 150, 'hatch', 36000], ['Audi A4', 'common', 204, 'sedan', 42000], ['Audi A6', 'common', 265, 'sedan', 58000],
    ['Audi Q3', 'common', 150, 'suv', 40000], ['Audi Q5', 'common', 265, 'suv', 46000], ['Audi Q4 e-tron', 'common', 204, 'suv', 50000],
    ['Audi A1', 'common', 116, 'hatch', 26000], ['BMW 1 Series', 'common', 136, 'hatch', 35000], ['BMW 2 Series Gran Coupe', 'common', 178, 'sedan', 40000],
    ['BMW 3 Series', 'common', 255, 'sedan', 45000], ['BMW 5 Series', 'common', 255, 'sedan', 58000], ['BMW X1', 'common', 241, 'suv', 41000],
    ['BMW X3', 'common', 255, 'suv', 50000], ['Mercedes-Benz A-Class', 'common', 163, 'hatch', 36000], ['Mercedes-Benz C-Class', 'common', 255, 'sedan', 47000],
    ['Mercedes-Benz E-Class', 'common', 255, 'sedan', 63000], ['Mercedes-Benz CLA', 'common', 221, 'sedan', 43000], ['Mercedes-Benz GLA', 'common', 221, 'suv', 42000],
    ['Mercedes-Benz GLC', 'common', 255, 'suv', 50000], ['Opel Corsa', 'common', 100, 'hatch', 20000], ['Opel Astra', 'common', 130, 'hatch', 28000],
    ['Volkswagen Golf GTI', 'rare', 245, 'hatch', 33000, 12], ['Volkswagen Golf R', 'rare', 333, 'hatch', 46000, 13], ['Audi RS3', 'rare', 400, 'sedan', 63000],
    ['Audi RS6', 'rare', 621, 'wagon', 125000], ['Audi Q8', 'rare', 335, 'suv', 74000], ['BMW M2', 'rare', 453, 'coupe', 63000],
    ['BMW M3', 'rare', 473, 'sedan', 77000], ['BMW M4', 'rare', 473, 'coupe', 79000], ['Mercedes-AMG A45', 'rare', 416, 'hatch', 60000],
    ['Mercedes-AMG C63', 'rare', 671, 'sedan', 85000], ['Mercedes-AMG GT', 'rare', 577, 'coupe', 100000], ['Mercedes-Benz G-Class', 'rare', 416, 'suv', 145000],
    ['Porsche Macan', 'rare', 261, 'suv', 63000], ['Porsche Cayenne', 'rare', 348, 'suv', 85000], ['BMW M5', 'epic', 717, 'sedan', 120000, 14],
    ['Porsche 911 Turbo S', 'epic', 640, 'coupe', 230000, 15], ['Audi R8', 'epic', 602, 'super', 160000], ['Porsche 911 GT3 RS', 'epic', 518, 'coupe', 241000],
    ['Mercedes-AMG One', 'mythic', 1063, 'super', 2700000, 16], ['Porsche 918 Spyder', 'mythic', 887, 'super', 845000],
  ] },
  3: { flag: 'us', country: 'США', base: 300, cars: [
    ['Tesla Model 3', 'common', 283, 'sedan', 38990, 17], ['Tesla Model Y', 'common', 299, 'suv', 44990, 18], ['Ford Explorer', 'common', 300, 'suv', 40000, 19],
    ['Jeep Wrangler', 'common', 285, 'suv', 32095], ['Jeep Grand Cherokee', 'common', 293, 'suv', 39995], ['Ford Bronco', 'common', 275, 'suv', 39630],
    ['Chevrolet Equinox', 'common', 175, 'suv', 28600], ['Ford Escape', 'common', 180, 'suv', 29495], ['Chevrolet Malibu', 'common', 160, 'sedan', 25600],
    ['Dodge Charger', 'common', 292, 'sedan', 33125], ['Ford Mustang Mach-E', 'common', 266, 'suv', 39995], ['Chevrolet Tahoe', 'common', 355, 'suv', 58195],
    ['Jeep Compass', 'common', 200, 'suv', 27995], ['Jeep Cherokee', 'common', 270, 'suv', 31000], ['Chevrolet Traverse', 'common', 328, 'suv', 39995],
    ['Chevrolet Trax', 'common', 137, 'suv', 21495], ['Chevrolet Blazer', 'common', 228, 'suv', 35995], ['Dodge Durango', 'common', 293, 'suv', 39995],
    ['Chrysler Pacifica', 'common', 287, 'van', 40080], ['Ford Edge', 'common', 250, 'suv', 38995], ['Jeep Renegade', 'common', 177, 'suv', 25000],
    ['GMC Acadia', 'common', 328, 'suv', 43995], ['Cadillac CT4', 'common', 237, 'sedan', 35495], ['Chevrolet Bolt', 'common', 200, 'hatch', 26500],
    ['Ford Bronco Sport', 'common', 180, 'suv', 30215], ['Chevrolet Suburban', 'common', 355, 'suv', 61195], ['GMC Yukon', 'common', 355, 'suv', 60895],
    ['Ford Fusion', 'common', 175, 'sedan', 23170], ['Chevrolet Camaro', 'common', 335, 'coupe', 29100], ['Ford Focus', 'common', 160, 'hatch', 19000],
    ['Ford Mustang GT', 'rare', 480, 'coupe', 42495, 20], ['Ford Mustang Dark Horse', 'rare', 500, 'coupe', 59565, 21], ['Chevrolet Corvette Stingray', 'rare', 490, 'super', 68300],
    ['Chevrolet Camaro ZL1', 'rare', 650, 'coupe', 72395], ['Dodge Challenger SRT Hellcat', 'rare', 717, 'coupe', 69295], ['Tesla Model S', 'rare', 670, 'sedan', 74990],
    ['Tesla Model X', 'rare', 670, 'suv', 79990], ['Cadillac Escalade', 'rare', 420, 'suv', 89995], ['Cadillac CT5-V Blackwing', 'rare', 668, 'sedan', 91995],
    ['Lincoln Navigator', 'rare', 440, 'suv', 89995], ['Lucid Air', 'rare', 430, 'sedan', 71400], ['GMC Hummer EV', 'rare', 830, 'suv', 98845],
    ['Dodge Viper', 'rare', 645, 'super', 91990], ['Jeep Wrangler Rubicon 392', 'rare', 470, 'suv', 91000], ['Chevrolet Corvette Z06', 'epic', 670, 'super', 112700, 22],
    ['Ford GT', 'epic', 660, 'super', 500000, 23], ['Chevrolet Corvette ZR1', 'epic', 1064, 'super', 175000], ['Saleen S7', 'epic', 750, 'super', 585000],
    ['Hennessey Venom F5', 'mythic', 1817, 'super', 2100000, 24], ['SSC Tuatara', 'mythic', 1750, 'super', 1900000],
  ] },
  4: { flag: 'it', country: 'Италия', base: 400, cars: [
    ['Fiat 500', 'common', 70, 'hatch', 19000, 25], ['Fiat Panda', 'common', 70, 'hatch', 16500, 26], ['Alfa Romeo Tonale', 'common', 268, 'suv', 42000, 27],
    ['Alfa Romeo Giulia', 'common', 280, 'sedan', 44500], ['Alfa Romeo Stelvio', 'common', 280, 'suv', 47500], ['Abarth 595', 'common', 165, 'hatch', 27500],
    ['Fiat Argo', 'common', 109, 'hatch', 15500], ['Alfa Romeo Giulietta', 'common', 170, 'hatch', 28000], ['Fiat Punto', 'common', 105, 'hatch', 17500],
    ['Fiat Bravo', 'common', 120, 'hatch', 21000], ['Lancia Delta', 'common', 140, 'hatch', 26000], ['Fiat Freemont', 'common', 170, 'suv', 28000],
    ['Alfa Romeo 159', 'common', 200, 'sedan', 32000], ['Alfa Romeo Brera', 'common', 260, 'coupe', 38000], ['Fiat Linea', 'common', 115, 'sedan', 16500],
    ['Alfa Romeo Giulietta Veloce', 'common', 240, 'hatch', 33000], ['Alfa Romeo 4C', 'common', 240, 'coupe', 66000], ['Fiat Punto Evo', 'common', 105, 'hatch', 17000],
    ['Fiat Stilo', 'common', 115, 'hatch', 18000], ['Alfa Romeo 147', 'common', 150, 'hatch', 24000], ['Alfa Romeo 156', 'common', 155, 'sedan', 26000],
    ['Fiat Doblo', 'common', 120, 'van', 22000], ['Fiat Palio', 'common', 86, 'hatch', 11000], ['Fiat Barchetta', 'common', 130, 'roadster', 24000],
    ['Alfa Romeo Spider', 'common', 185, 'roadster', 33000], ['Abarth 124 Spider', 'common', 170, 'roadster', 30000], ['Abarth Punto', 'common', 165, 'hatch', 24000],
    ['Fiat Uno', 'common', 70, 'hatch', 9000], ['Fiat 500 Abarth', 'common', 135, 'hatch', 24000], ['Fiat Multipla', 'common', 115, 'van', 20000],
    ['Maserati Levante', 'rare', 345, 'suv', 90000, 28], ['Maserati Quattroporte', 'rare', 424, 'sedan', 106000, 29], ['Maserati GranTurismo', 'rare', 490, 'coupe', 178000],
    ['Maserati MC20', 'rare', 621, 'super', 239000], ['Alfa Romeo Giulia Quadrifoglio', 'rare', 505, 'sedan', 81000], ['Lamborghini Urus', 'rare', 657, 'suv', 233000],
    ['Ferrari Roma', 'rare', 612, 'coupe', 247000], ['Ferrari Portofino', 'rare', 612, 'coupe', 225000], ['Ferrari Purosangue', 'rare', 715, 'suv', 400000],
    ['Lamborghini Huracan', 'rare', 631, 'super', 249000], ['Ferrari 296 GTB', 'rare', 819, 'super', 322000], ['Alfa Romeo 8C Competizione', 'rare', 450, 'coupe', 250000],
    ['Lamborghini Gallardo', 'rare', 552, 'super', 200000], ['Ferrari 458 Italia', 'rare', 562, 'super', 240000], ['Ferrari SF90 Stradale', 'epic', 986, 'super', 524000, 30],
    ['Lamborghini Revuelto', 'epic', 1001, 'super', 608000, 31], ['Ferrari 812 Superfast', 'epic', 789, 'super', 366000], ['Lamborghini Aventador SVJ', 'epic', 759, 'super', 517000],
    ['Ferrari LaFerrari', 'mythic', 950, 'super', 1420000, 32], ['Pagani Huayra', 'mythic', 791, 'super', 2800000],
  ] },
  5: { flag: 'ru', country: 'Россия', base: 500, cars: [
    ['Lada Granta', 'common', 90, 'sedan', 9500, 33], ['Lada Vesta', 'common', 106, 'sedan', 14000, 34], ['Lada Niva Legend', 'common', 83, 'suv', 11000, 35],
    ['Lada Largus', 'common', 90, 'wagon', 15500], ['Moskvich 3', 'common', 150, 'suv', 25000], ['Moskvich 6', 'common', 147, 'sedan', 28000],
    ['UAZ Patriot', 'common', 150, 'suv', 21000], ['UAZ Hunter', 'common', 135, 'suv', 15500], ['Tenet T7', 'common', 147, 'suv', 26000],
    ['Tenet T4', 'common', 147, 'suv', 21000], ['Solaris HS', 'common', 123, 'sedan', 16500], ['Lada Priora', 'common', 106, 'sedan', 8500],
    ['Lada 2114', 'common', 81, 'hatch', 7000], ['Lada 2110', 'common', 81, 'sedan', 7000], ['Lada 2115', 'common', 81, 'sedan', 7000],
    ['Lada 4x4 Urban', 'common', 83, 'suv', 11500], ['Lada 2107', 'common', 75, 'sedan', 6000], ['Lada 2106', 'common', 75, 'sedan', 6000],
    ['Lada 2108', 'common', 75, 'hatch', 6000], ['Lada 2105', 'common', 71, 'sedan', 5500], ['Moskvich 2141', 'common', 72, 'hatch', 5000],
    ['Lada Niva', 'common', 83, 'suv', 11000], ['VAZ 2109', 'common', 75, 'hatch', 6000], ['VAZ 21099', 'common', 75, 'sedan', 6000],
    ['VAZ 2104', 'common', 72, 'wagon', 5500], ['Moskvich 2140', 'common', 75, 'sedan', 5000], ['GAZ 3110', 'common', 131, 'sedan', 9000],
    ['GAZ 3102', 'common', 100, 'sedan', 10000], ['UAZ Buhanka', 'common', 112, 'van', 14000], ['Lada Samara Cross', 'common', 75, 'hatch', 9000],
    ['Tenet T8', 'rare', 186, 'suv', 32000, 36], ['GAZ 21 Volga', 'rare', 70, 'sedan', 40000, 37], ['GAZ 24 Volga', 'rare', 95, 'sedan', 30000],
    ['Moskvich 412', 'rare', 75, 'sedan', 20000], ['Moskvich 407', 'rare', 45, 'sedan', 25000], ['Moskvich 401', 'rare', 23, 'sedan', 25000],
    ['Lada 2101', 'rare', 64, 'sedan', 15000], ['Lada 2103', 'rare', 71, 'sedan', 15000], ['UAZ 469', 'rare', 75, 'suv', 18000],
    ['GAZ 69', 'rare', 55, 'suv', 25000], ['Lada Samara T3', 'rare', 300, 'hatch', 90000], ['Lada 2105 VFTS', 'rare', 160, 'sedan', 40000],
    ['Moskvich 400', 'rare', 23, 'sedan', 30000], ['GAZ M20 Pobeda', 'rare', 52, 'sedan', 35000], ['GAZ 13 Chaika', 'epic', 195, 'sedan', 150000, 38],
    ['ZIS 101', 'epic', 110, 'sedan', 120000, 39], ['Marussia B1', 'epic', 300, 'super', 130000], ['ZIL 111', 'epic', 200, 'sedan', 250000],
    ['Aurus Senat', 'mythic', 598, 'sedan', 330000, 40], ['Marussia B2', 'mythic', 420, 'super', 180000],
  ] },
  6: { flag: 'cn', country: 'Китай', base: 600, cars: [
    ['BYD Seagull', 'common', 101, 'hatch', 10000, 41], ['BYD Dolphin', 'common', 201, 'hatch', 17000, 42], ['BYD Atto 3', 'common', 201, 'suv', 21000, 43],
    ['BYD Seal', 'common', 308, 'sedan', 26000], ['BYD Han', 'common', 241, 'sedan', 30000], ['Geely Emgrand', 'common', 122, 'sedan', 11000],
    ['Chery Tiggo 7 Pro', 'common', 147, 'suv', 18000], ['Chery Tiggo 4', 'common', 147, 'suv', 14000], ['Chery Tiggo 9', 'common', 254, 'suv', 30000],
    ['Haval H6', 'common', 201, 'suv', 19000], ['Changan CS55 Plus', 'common', 188, 'suv', 16000], ['Changan CS75 Plus', 'common', 233, 'suv', 19000],
    ['Changan UNI-K', 'common', 233, 'suv', 25000], ['Changan UNI-V', 'common', 188, 'sedan', 17000], ['Chery Jaecoo J7', 'common', 147, 'suv', 22000],
    ['MG4', 'common', 201, 'hatch', 20000], ['MG ZS', 'common', 106, 'suv', 17000], ['Wuling Hongguang Mini EV', 'common', 40, 'hatch', 5000],
    ['Hongqi H5', 'common', 169, 'sedan', 22000], ['Hongqi HS5', 'common', 224, 'suv', 27000], ['Neta V', 'common', 94, 'suv', 11000],
    ['GAC Trumpchi GS4', 'common', 151, 'suv', 15000], ['Chery QQ', 'common', 68, 'hatch', 6000], ['Geely Binyue', 'common', 177, 'suv', 13000],
    ['Geely Galaxy', 'common', 218, 'suv', 18000], ['Lynk Co 01', 'common', 254, 'suv', 25000], ['Haval H9', 'common', 218, 'suv', 30000],
    ['Changan Alsvin', 'common', 107, 'sedan', 10000], ['BYD e6', 'common', 218, 'van', 25000], ['Jetour Dashing', 'common', 197, 'suv', 15000],
    ['Tank 300', 'rare', 227, 'suv', 35000, 44], ['Zeekr 001', 'rare', 536, 'hatch', 42000, 45], ['Zeekr 007', 'rare', 637, 'sedan', 32000],
    ['Xiaomi SU7', 'rare', 664, 'sedan', 30000], ['Xpeng P7', 'rare', 473, 'sedan', 32000], ['Hongqi H9', 'rare', 360, 'sedan', 50000],
    ['Avatr 11', 'rare', 578, 'suv', 42000], ['Zeekr X', 'rare', 428, 'suv', 28000], ['Lotus Eletre', 'rare', 603, 'suv', 110000],
    ['Zeekr 009', 'rare', 536, 'van', 60000], ['MG Cyberster', 'rare', 536, 'roadster', 45000], ['Lotus Emeya', 'rare', 905, 'sedan', 105000],
    ['Voyah Courage', 'rare', 435, 'suv', 35000], ['BYD Yangwang U7', 'rare', 1287, 'sedan', 90000], ['Xiaomi SU7 Ultra', 'epic', 1548, 'sedan', 74000, 46],
    ['BYD Yangwang U8', 'epic', 1180, 'suv', 150000, 47], ['GAC Aion Hyper SSR', 'epic', 1225, 'super', 175000], ['Hongqi S9', 'epic', 1400, 'super', 1400000],
    ['BYD Yangwang U9', 'mythic', 1287, 'super', 230000, 48], ['NIO EP9', 'mythic', 1341, 'super', 1480000],
  ] },
  7: { flag: 'fr', country: 'Франция', base: 700, cars: [
    ['Peugeot 208', 'common', 100, 'hatch', 21000, 49], ['Renault Clio', 'common', 90, 'hatch', 20000, 50], ['Peugeot 2008', 'common', 130, 'suv', 26000, 51],
    ['Peugeot 308', 'common', 130, 'hatch', 29000], ['Peugeot 3008', 'common', 136, 'suv', 36000], ['Renault Captur', 'common', 140, 'suv', 24000],
    ['Citroen C3', 'common', 100, 'hatch', 19000], ['Peugeot 5008', 'common', 136, 'suv', 39000], ['Renault Austral', 'common', 160, 'suv', 35000],
    ['Peugeot 408', 'common', 130, 'hatch', 33000], ['Peugeot 508', 'common', 180, 'sedan', 38000], ['Renault Arkana', 'common', 140, 'suv', 29000],
    ['Dacia Duster', 'common', 130, 'suv', 19000], ['DS 3', 'common', 130, 'suv', 30000], ['DS 4', 'common', 130, 'hatch', 33000],
    ['Renault Kadjar', 'common', 140, 'suv', 27000], ['Renault Twingo', 'common', 65, 'hatch', 14000], ['Renault Zoe', 'common', 136, 'hatch', 32000],
    ['Renault Koleos', 'common', 170, 'suv', 35000], ['Peugeot 206', 'common', 90, 'hatch', 14000], ['Peugeot 207', 'common', 95, 'hatch', 16000],
    ['Peugeot 307', 'common', 110, 'hatch', 18000], ['Peugeot 407', 'common', 140, 'sedan', 24000], ['Peugeot Partner', 'common', 110, 'van', 20000],
    ['Renault Megane', 'common', 140, 'hatch', 24000], ['Renault Laguna', 'common', 150, 'sedan', 26000], ['Renault Scenic', 'common', 130, 'van', 25000],
    ['Renault Kangoo', 'common', 110, 'van', 21000], ['Renault Fluence', 'common', 110, 'sedan', 19000], ['Citroen Xsara', 'common', 90, 'hatch', 14000],
    ['Renault Espace', 'rare', 200, 'suv', 45000, 52], ['Alpine A110', 'rare', 252, 'coupe', 70000, 53], ['DS 9', 'rare', 360, 'sedan', 62000],
    ['Renault Clio RS', 'rare', 220, 'hatch', 30000], ['Peugeot RCZ', 'rare', 270, 'coupe', 38000], ['Alpine A110 S', 'rare', 300, 'coupe', 82000],
    ['Peugeot 9X8', 'rare', 680, 'super', 120000], ['Peugeot 205 GTI', 'rare', 130, 'hatch', 30000], ['Peugeot 106 Rallye', 'rare', 100, 'hatch', 20000],
    ['Renault Clio V6', 'rare', 255, 'hatch', 60000], ['Renault Sport Spider', 'rare', 150, 'roadster', 50000], ['Citroen SM', 'rare', 170, 'coupe', 70000],
    ['Citroen DS', 'rare', 125, 'sedan', 60000], ['Alpine A310', 'rare', 150, 'coupe', 60000], ['Renault 5 Turbo 3E', 'epic', 540, 'hatch', 160000, 54],
    ['Bugatti Veyron', 'epic', 1001, 'super', 1700000, 55], ['Bugatti Divo', 'epic', 1500, 'super', 5800000], ['Bugatti EB110', 'epic', 553, 'super', 2000000],
    ['Bugatti Chiron', 'mythic', 1500, 'super', 3000000, 56], ['Bugatti Tourbillon', 'mythic', 1800, 'super', 4000000],
  ] },
  8: { flag: 'world', country: 'Другие страны', base: 800, cars: [
    ['Kia Sportage', 'common', 187, 'suv', 27990, 57], ['Hyundai Tucson', 'common', 187, 'suv', 28705, 58], ['Kia Rio', 'common', 120, 'sedan', 17000, 59],
    ['Hyundai Elantra', 'common', 147, 'sedan', 21625], ['Kia K5', 'common', 191, 'sedan', 26690], ['Hyundai Sonata', 'common', 191, 'sedan', 26900],
    ['Kia Sorento', 'common', 191, 'suv', 31990], ['Hyundai Santa Fe', 'common', 277, 'suv', 33950], ['Kia Picanto', 'common', 84, 'hatch', 14000],
    ['Hyundai Creta', 'common', 123, 'suv', 18000], ['Hyundai Ioniq 5', 'common', 225, 'suv', 42500], ['Kia EV6', 'common', 225, 'suv', 42600],
    ['Skoda Octavia', 'common', 150, 'sedan', 27000], ['Skoda Kodiaq', 'common', 190, 'suv', 38000], ['Skoda Superb', 'common', 190, 'sedan', 36000],
    ['Skoda Kamiq', 'common', 150, 'suv', 25000], ['Skoda Karoq', 'common', 150, 'suv', 29000], ['Volvo XC60', 'common', 247, 'suv', 44450],
    ['Volvo XC90', 'common', 247, 'suv', 57000], ['Mini Cooper', 'common', 134, 'hatch', 28750], ['Mini Countryman', 'common', 241, 'suv', 39000],
    ['Kia Telluride', 'common', 291, 'suv', 36190], ['Hyundai Palisade', 'common', 291, 'suv', 37200], ['Kia Carnival', 'common', 287, 'van', 36700],
    ['Hyundai Kona', 'common', 147, 'suv', 24550], ['Range Rover Evoque', 'common', 246, 'suv', 50350], ['Land Rover Discovery', 'common', 355, 'suv', 60000],
    ['Polestar 2', 'common', 299, 'sedan', 49900], ['Kia Seltos', 'common', 147, 'suv', 24690], ['Hyundai i20', 'common', 100, 'hatch', 20000],
    ['Land Rover Defender', 'rare', 395, 'suv', 57000, 60], ['Range Rover', 'rare', 395, 'suv', 107000, 61], ['Range Rover Sport', 'rare', 395, 'suv', 84000],
    ['Kia Stinger', 'rare', 368, 'sedan', 51000], ['Hyundai Ioniq 5 N', 'rare', 641, 'suv', 66100], ['Kia EV9', 'rare', 379, 'suv', 54900],
    ['Genesis GV80', 'rare', 375, 'suv', 58000], ['Genesis G90', 'rare', 409, 'sedan', 90000], ['Jaguar F-Type', 'rare', 575, 'coupe', 79000],
    ['Aston Martin Vantage', 'rare', 656, 'coupe', 191000], ['Bentley Continental GT', 'rare', 650, 'coupe', 240000], ['Bentley Bentayga', 'rare', 542, 'suv', 200000],
    ['Lotus Emira', 'rare', 400, 'coupe', 99900], ['Hyundai i30 N', 'rare', 280, 'hatch', 36000], ['Rolls-Royce Phantom', 'epic', 563, 'sedan', 470000, 62],
    ['Rolls-Royce Cullinan', 'epic', 563, 'suv', 400000, 63], ['Aston Martin DBS', 'epic', 715, 'coupe', 330000], ['McLaren 720S', 'epic', 710, 'super', 310000],
    ['Koenigsegg Jesko', 'mythic', 1600, 'super', 3000000, 64], ['McLaren P1', 'mythic', 903, 'super', 1150000],
  ] },
};

const COLORS = ['#c4161c', '#1f4fa8', '#e8e8e8', '#202428', '#8c96a3', '#2e7d4f', '#e8742c', '#f2c230', '#5b2a86', '#2a8f9a', '#7a1218', '#c9ccd1'];
const round = (x) => Math.max(100, Math.round(x / 100) * 100);

export function buildCountry(cid) {
  const W = WORLD[cid];
  return W.cars.map(([model, rarity, hp, body, price, keep], i) => {
    const sport = { common: 0, rare: 1, epic: 2, mythic: 3 }[rarity];
    const accel = Math.max(2.0, Math.min(25, +(14 - Math.log2(hp / 60) * 2.9 - sport * 0.4).toFixed(1)));
    const speed = Math.round(Math.min(420, 110 + Math.sqrt(hp) * 8 + sport * 6));
    const handling = Math.min(98, 52 + sport * 10 + (body === 'super' || body === 'coupe' ? 8 : body === 'suv' || body === 'van' ? -6 : 0) + (i % 5));
    const reliability = Math.max(55, Math.min(95, 88 - sport * 3 - (cid == 5 ? 12 : cid == 4 ? 6 : 0) + (i % 4)));
    return [gameName(model), model, rarity, speed, accel, hp, handling, reliability, round(price), body, COLORS[i % COLORS.length], keep];
  });
}

// Цена контейнера: между 18-й и 19-й по цене обычной машиной (60 % обычных дешевле, 40 % дороже), кратно $500.
export function containerPrice(cid) {
  const commons = WORLD[cid].cars.filter((c) => c[1] === 'common').map((c) => c[4]).sort((a, b) => a - b);
  return Math.round((commons[17] + commons[18]) / 2 / 500) * 500;
}
