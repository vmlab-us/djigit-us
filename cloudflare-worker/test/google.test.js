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
