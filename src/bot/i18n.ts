import type { Lang } from "../generation/brief.js";

export type Dict = {
  chooseLang: string;
  welcome: string;
  askPhoto: string;
  askTitle: string;
  askPrice: string;
  askBullets: string;
  skip: string;
  cancel: string;
  canceled: string;
  queued: string;
  progress: (done: number, total: number) => string;
  packReady: (credits: number) => string;
  packPartial: (ok: number, total: number, credits: number) => string;
  packFailed: string;
  freeSample: string;
  freeUsed: string;
  noCredits: string;
  balance: (credits: number) => string;
  buyTitle: string;
  packLabel: (credits: number, uzs: number) => string;
  payClick: string;
  payStars: (stars: number) => string;
  payPrompt: (uzs: number) => string;
  paid: (credits: number, balance: number) => string;
  help: string;
  cardName: Record<"main" | "lifestyle" | "model" | "infographic", string>;
  cardCaption: (name: string) => string;
  moderationNote: string;
  genericError: string;
  notPhoto: string;
  priceHint: string;
};

const ru: Dict = {
  chooseLang: "Выберите язык / Tilni tanlang",
  welcome:
    "Добро пожаловать в Vitrina AI.\n\nПришлите фото товара — я сделаю 4 карточки для Uzum, Wildberries и Ozon: главное фото, фото в интерьере, фото с моделью и инфографику с ценой.\n\nФормат 3:4, 1200×1600, готово к загрузке.\n\nПервая карточка бесплатно.",
  askPhoto: "Пришлите фото товара одним снимком.",
  askTitle: "Название товара? Например: «Термос Stanley 1.2 л, чёрный».",
  askPrice: "Цена в сумах? Напишите числом, например 349000.",
  askBullets:
    "Три преимущества товара, каждое с новой строки. Например:\nДержит тепло 24 часа\nНержавеющая сталь\nГарантия 12 месяцев",
  skip: "Пропустить",
  cancel: "Отмена",
  canceled: "Отменено.",
  queued: "Принято. Генерирую карточки…",
  progress: (done, total) => `Готово ${done} из ${total}…`,
  packReady: (credits) => `Готово. Осталось карточек: ${credits}.`,
  packPartial: (ok, total, credits) =>
    `Готово ${ok} из ${total}. Неудачные попытки не списаны. Осталось карточек: ${credits}.`,
  packFailed: "Не получилось сгенерировать карточки. Списание отменено, попробуйте другое фото.",
  freeSample: "Это бесплатный пример: главное фото. Полный набор из 4 карточек — команда /buy.",
  freeUsed: "Бесплатная карточка уже использована.",
  noCredits: "Карточки закончились. Пополните через /buy.",
  balance: (credits) => `Ваш баланс: ${credits} карточек.`,
  buyTitle: "Выберите пакет. 1 карточка = 1 товар (4 изображения).",
  packLabel: (credits, uzs) => `${credits} товаров — ${uzs.toLocaleString("ru-RU")} сум`,
  payClick: "Оплатить через Click",
  payStars: (stars) => `Оплатить Stars (${stars} ⭐)`,
  payPrompt: (uzs) => `К оплате ${uzs.toLocaleString("ru-RU")} сум. После оплаты карточки зачислятся автоматически.`,
  paid: (credits, balance) => `Оплата получена. Начислено ${credits}. Баланс: ${balance}.`,
  help:
    "Команды:\n/start — начать\n/buy — купить карточки\n/balance — баланс\n/lang — сменить язык\n/cancel — отменить текущий товар",
  cardName: {
    main: "Главное фото",
    lifestyle: "В интерьере",
    model: "С моделью",
    infographic: "Инфографика",
  },
  cardCaption: (name) => `${name} · 1200×1600 · 3:4`,
  moderationNote:
    "Важно: главное фото сохраняет ваш товар без изменений — так требуют модераторы маркетплейсов.",
  genericError: "Что-то пошло не так. Попробуйте ещё раз.",
  notPhoto: "Это не фото. Пришлите снимок товара.",
  priceHint: "Нужно число, например 349000. Или нажмите «Пропустить».",
};

const uz: Dict = {
  chooseLang: "Tilni tanlang / Выберите язык",
  welcome:
    "Vitrina AI'ga xush kelibsiz.\n\nMahsulot suratini yuboring — Uzum, Wildberries va Ozon uchun 4 ta kartochka tayyorlayman: asosiy surat, interyerdagi surat, model bilan surat va narxli infografika.\n\nFormat 3:4, 1200×1600, yuklashga tayyor.\n\nBirinchi kartochka bepul.",
  askPhoto: "Mahsulot suratini bitta rasm qilib yuboring.",
  askTitle: "Mahsulot nomi? Masalan: «Termos Stanley 1.2 l, qora».",
  askPrice: "Narxi so'mda? Raqam bilan yozing, masalan 349000.",
  askBullets:
    "Mahsulotning uchta afzalligi, har biri yangi qatordan. Masalan:\n24 soat issiq saqlaydi\nZanglamaydigan po'lat\n12 oy kafolat",
  skip: "O'tkazib yuborish",
  cancel: "Bekor qilish",
  canceled: "Bekor qilindi.",
  queued: "Qabul qilindi. Kartochkalar tayyorlanmoqda…",
  progress: (done, total) => `${total} tadan ${done} tasi tayyor…`,
  packReady: (credits) => `Tayyor. Qolgan kartochkalar: ${credits}.`,
  packPartial: (ok, total, credits) =>
    `${total} tadan ${ok} tasi tayyor. Muvaffaqiyatsizlari hisobdan yechilmadi. Qolgan kartochkalar: ${credits}.`,
  packFailed: "Kartochkalarni tayyorlab bo'lmadi. Hisobdan yechilmadi, boshqa surat bilan urinib ko'ring.",
  freeSample: "Bu bepul namuna: asosiy surat. To'liq 4 ta kartochka uchun /buy buyrug'ini bosing.",
  freeUsed: "Bepul kartochka allaqachon ishlatilgan.",
  noCredits: "Kartochkalar tugadi. /buy orqali to'ldiring.",
  balance: (credits) => `Balansingiz: ${credits} ta kartochka.`,
  buyTitle: "Paketni tanlang. 1 kartochka = 1 mahsulot (4 ta rasm).",
  packLabel: (credits, uzs) => `${credits} ta mahsulot — ${uzs.toLocaleString("ru-RU")} so'm`,
  payClick: "Click orqali to'lash",
  payStars: (stars) => `Stars bilan to'lash (${stars} ⭐)`,
  payPrompt: (uzs) => `To'lov: ${uzs.toLocaleString("ru-RU")} so'm. To'lovdan keyin kartochkalar avtomatik qo'shiladi.`,
  paid: (credits, balance) => `To'lov qabul qilindi. ${credits} ta qo'shildi. Balans: ${balance}.`,
  help:
    "Buyruqlar:\n/start — boshlash\n/buy — kartochka sotib olish\n/balance — balans\n/lang — tilni almashtirish\n/cancel — joriy mahsulotni bekor qilish",
  cardName: {
    main: "Asosiy surat",
    lifestyle: "Interyerda",
    model: "Model bilan",
    infographic: "Infografika",
  },
  cardCaption: (name) => `${name} · 1200×1600 · 3:4`,
  moderationNote:
    "Muhim: asosiy surat mahsulotingizni o'zgartirmasdan saqlaydi — marketpleys moderatorlari shuni talab qiladi.",
  genericError: "Nimadir xato ketdi. Qayta urinib ko'ring.",
  notPhoto: "Bu surat emas. Mahsulot rasmini yuboring.",
  priceHint: "Raqam kerak, masalan 349000. Yoki «O'tkazib yuborish»ni bosing.",
};

const dicts: Record<Lang, Dict> = { ru, uz };

export function t(lang: Lang): Dict {
  return dicts[lang] ?? ru;
}

/** Telegram gives a locale like "ru", "uz", "uz-Latn". Anything else gets Russian. */
export function langFromTelegram(code: string | undefined): Lang {
  return code?.toLowerCase().startsWith("uz") ? "uz" : "ru";
}
