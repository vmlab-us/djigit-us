import { expect, it } from "vitest";
import { linkDirectory } from "../src/google.js";

it("links fleet only on one exact normalized dealer name", () => {
  const dealers=[
    ["ID дилера","Бренд","Дилерский центр","Расстояние (мили)","Адрес / сведения из карточки","Телефон","Веб-сайт"],
    ["d1","Toyota","Bob’s Toyota — North","10","LA","555","https://dealer.example"],
  ];
  const fleet=[
    ["Дилерский центр","Fleet-контакты и должности","Прямые телефоны","Электронная почта"],
    ["bob's toyota - north","Ann, Fleet Manager","111","a@example.com"],
  ];
  const [dealer]=linkDirectory(dealers,fleet);
  expect(dealer.fleetLinkStatus).toBe("matched");
  expect(dealer.fleet.email).toBe("a@example.com");
});

it("excludes non-sales departments and duplicate brand domains", () => {
  const dealers=[
    ["ID дилера","Бренд","Дилерский центр","Расстояние (мили)","Адрес / сведения из карточки","Телефон","Веб-сайт"],
    ["d1","Kia","Car Pros Kia Glendale","6.8","LA","111","https://www.glendalekia.com/"],
    ["d2","Kia","Car Pros Kia Glendale Service","6.8","LA","222","https://www.glendalekia.com/service/"],
    ["d3","Kia","Car Pros Kia Glendale Parts","6.8","LA","333","https://www.glendalekia.com/parts/"],
    ["d4","Kia","Duplicate Kia showroom","9","LA","444","https://glendalekia.com/find-us"],
  ];
  expect(linkDirectory(dealers,[]).map((dealer) => dealer.id)).toEqual(["d1"]);
});

it("uses audited final URL and excludes invalid links", () => {
  const dealers=[
    ["ID дилера","Бренд","Дилерский центр","Расстояние (мили)","Адрес / сведения из карточки","Телефон","Веб-сайт"],
    ["d1","Toyota","Dealer One","10","LA","111","http://dealer-one.test"],
    ["d2","Honda","Dealer Two","12","LA","222","https://furniture.example"],
  ];
  const audit=[
    ["ID дилера","Конечный URL","Результат","Рекомендация"],
    ["d1","https://www.dealer-one.test/new/","ГОТОВ","Использовать"],
    ["d2","","НЕВЕРНАЯ ССЫЛКА","Исправить"],
  ];
  const result=linkDirectory(dealers,[],audit);
  expect(result).toHaveLength(1);
  expect(result[0].website).toBe("https://www.dealer-one.test/new/");
  expect(result[0].auditResult).toBe("ГОТОВ");
});

it("keeps corporate records in the sheet but excludes sites without dealer inventory", () => {
  const dealers=[
    ["ID дилера","Бренд","Дилерский центр","Расстояние (мили)","Адрес / сведения из карточки","Телефон","Веб-сайт"],
    ["d1","Porsche","Porsche Motorsport North America","23.6","LA","111","https://www.porsche.com/"],
  ];
  const audit=[
    ["ID дилера","Конечный URL","Результат","Рекомендация"],
    ["d1","https://www.porsche.com/","КОРПОРАТИВНЫЙ САЙТ / НЕТ ДИЛЕРСКОГО ИНВЕНТАРЯ","Не сканировать"],
  ];
  expect(linkDirectory(dealers,[],audit)).toEqual([]);
});
